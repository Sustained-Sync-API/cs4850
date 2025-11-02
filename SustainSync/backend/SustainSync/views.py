"""REST endpoints powering the SustainSync dashboard."""

from __future__ import annotations

import csv
import json
from decimal import Decimal, InvalidOperation
from io import TextIOWrapper

from django.db.models import Avg, Sum, F
from django.db.models.expressions import OrderBy
from django.db.models.functions import TruncMonth, Coalesce
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import Bill, SustainabilityGoal


def _to_float(value):
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _build_metrics_snapshot():
    metrics = Bill.objects.aggregate(
        total_cost=Sum('cost'),
        total_consumption=Sum('consumption'),
        average_bill=Avg('cost'),
    )
    latest_bill = Bill.objects.order_by('-bill_date').first()

    breakdown = (
        Bill.objects.values('bill_type')
        .annotate(total_cost=Sum('cost'), total_consumption=Sum('consumption'))
        .order_by('bill_type')
    )

    return {
        'totals': {
            'cost': _to_float(metrics.get('total_cost')),
            'consumption': _to_float(metrics.get('total_consumption')),
            'average_bill': _to_float(metrics.get('average_bill')),
            'last_updated': latest_bill.bill_date.isoformat() if latest_bill and latest_bill.bill_date else None,
        },
        'by_type': [
            {
                'bill_type': entry['bill_type'],
                'total_cost': _to_float(entry['total_cost']),
                'total_consumption': _to_float(entry['total_consumption']),
            }
            for entry in breakdown
        ],
    }


def _build_monthly_series():
    series = (
        Bill.objects.exclude(bill_date__isnull=True)
        .annotate(month=TruncMonth('bill_date'))
        .values('month')
        .annotate(total_cost=Sum('cost'), total_consumption=Sum('consumption'))
        .order_by('month')
    )

    result = []
    for item in series:
        month_val = None
        m = item.get('month')
        if m:
            # TruncMonth may return a datetime or a date depending on DB/driver.
            # Safely handle either by checking for .date().
            if hasattr(m, 'date'):
                month_val = m.date().isoformat()
            else:
                month_val = m.isoformat()

        result.append({
            'month': month_val,
            'total_cost': _to_float(item['total_cost']),
            'total_consumption': _to_float(item['total_consumption']),
        })

    return result


def _fallback_recommendations():
    snapshot = _build_metrics_snapshot()
    totals = snapshot['totals']
    by_type = snapshot['by_type']

    messages = []
    if totals['consumption']:
        messages.append(
            f"Track overall resource usage: the portfolio has consumed {totals['consumption']:.2f} units across all utilities."
        )
    if totals['cost']:
        messages.append(
            f"Set quarterly budget guardrails: year-to-date spend is ${totals['cost']:.2f}."
        )
    for entry in by_type[:3]:
        messages.append(
            f"Investigate {entry['bill_type']} efficiency opportunities—the category totals ${entry['total_cost']:.2f} in spend."
        )
    if not messages:
        messages.append("No billing data is available yet. Upload a CSV to unlock insights.")

    return "\n".join(f"• {msg}" for msg in messages)


@csrf_exempt
@require_http_methods(["POST"])
def ask_rag(request):
    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload'}, status=400)

    question = payload.get('question', '').strip()
    if not question:
        return JsonResponse({'error': 'No question provided'}, status=400)

    try:
        from llm import rag as ragmod
    except Exception as exc:  # pragma: no cover - optional dependency
        return JsonResponse({'error': f'RAG not available in container: {exc}'}, status=503)

    try:
        answer = ragmod.run_query(question)
        return JsonResponse({'answer': answer})
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=500)


@require_http_methods(["GET"])
def dashboard_metrics(request):
    try:
        return JsonResponse(_build_metrics_snapshot())
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=500)


@require_http_methods(["GET"])
def monthly_trends(request):
    try:
        return JsonResponse({'series': _build_monthly_series()})
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=500)


@require_http_methods(["GET"])
def forecast(request):
    periods_param = request.GET.get('periods', '12')
    try:
        periods = max(1, min(24, int(periods_param)))
    except ValueError:
        periods = 12
    
    # Enable LLM summaries by default for AI-driven insights (can be disabled with summaries=false)
    # Summaries may take 30-60 seconds depending on Ollama performance
    import os
    default_summaries = os.environ.get('ENABLE_LLM_SUMMARIES', 'true').lower() in ('true', '1', 'yes')
    include_summaries = request.GET.get('summaries', str(default_summaries)).lower() in ('true', '1', 'yes')
    
    # Format parameter: 'dashboard' or 'sustainability' (default: 'dashboard')
    # Dashboard: Key Trends, Cost Efficiency, Actionable Recommendations
    # Sustainability: Goal-focused bullet list
    format_param = request.GET.get('format', 'dashboard').lower()
    use_dashboard_format = format_param == 'dashboard'

    try:
        from llm import rag as ragmod
    except Exception as exc:  # pragma: no cover - optional dependency
        return JsonResponse({'error': f'RAG not available in container: {exc}'}, status=503)

    # Fetch sustainability goals to incorporate into recommendations
    goals = None
    if include_summaries:
        goals_qs = SustainabilityGoal.objects.all()[:5]
        if goals_qs.exists():
            goals = []
            for g in goals_qs:
                goal_dict = {
                    'title': g.title,
                    'description': g.description,
                    'target_date': g.target_date.strftime('%B %Y') if g.target_date else None
                }
                goals.append(goal_dict)
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"Passing {len(goals)} sustainability goals to forecast: {[g['title'] for g in goals]}")
        else:
            import logging
            logger = logging.getLogger(__name__)
            logger.info("No sustainability goals found in database")

    try:
        # The LLM helper now returns total plus per-utility forecasts and summaries.
        result = ragmod.run_forecast(periods=periods, include_summaries=include_summaries, goals=goals, use_dashboard_format=use_dashboard_format)
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=500)

    status = 200 if not (isinstance(result, dict) and result.get('error')) else 500
    return JsonResponse(result, status=status)


@require_http_methods(["GET"])
def ai_recommendations(request):
    custom_question = request.GET.get('question', '').strip()
    
    # Get all sustainability goals (auto-analyze all of them)
    goals = SustainabilityGoal.objects.all()[:5]
    goals_context = ""
    if goals.exists():
        goals_list = []
        for g in goals:
            goal_str = f"- {g.title}: {g.description}"
            if g.target_date:
                goal_str += f" (Target: {g.target_date.strftime('%B %Y')})"
            goals_list.append(goal_str)
        goals_context = "\n\nUser's Sustainability Goals:\n" + "\n".join(goals_list) + "\n"
    
    prompt = custom_question or (
        "You are an energy and sustainability analyst reviewing multi-utility billing data. "
        f"{goals_context}"
        "Analyze the data and provide 3-5 actionable recommendations that combine cost savings and sustainability improvements. "
        "REQUIREMENTS:\n"
        "1. For EACH recommendation, cite specific data points with exact numbers (e.g., 'Power consumption increased 15.2% from Q3 to Q4, from 12,450 kWh to 14,343 kWh').\n"
        "2. Map each recommendation to the most relevant sustainability goal (by title) and explain how it advances that goal.\n"
        "3. Quantify potential impact where possible (e.g., 'Could reduce monthly cost by ~$120' or 'Estimated 8% carbon reduction').\n"
        "4. Identify seasonal patterns, anomalies, or efficiency opportunities in the data.\n"
        "5. Assess current progress toward each user goal based on the billing trends.\n\n"
        "Format each recommendation as:\n"
        "**[Recommendation Title]**\n"
        "- Data Evidence: [specific metrics and trends]\n"
        "- Goal Alignment: [which goal this supports and why]\n"
        "- Expected Impact: [quantified benefit]\n"
        "- Action Steps: [2-3 concrete steps]"
    )

    try:
        from llm import rag as ragmod
        answer = ragmod.run_query(prompt)
        
        # Extract data sources from the RAG context
        # The answer already includes citations from the LLM
        data_sources = {
            'model': 'llama3.2:1b',
            'data_range': _get_data_range(),
            'goals_count': goals.count(),
            'rag_enabled': True
        }
        
        return JsonResponse({
            'recommendations': answer,
            'sources': data_sources,
            'goals_count': goals.count()
        })
    except Exception as exc:  # pragma: no cover - optional dependency
        fallback = _fallback_recommendations()
        data_sources = {
            'model': 'fallback',
            'data_range': _get_data_range(),
            'goals_count': goals.count(),
            'rag_enabled': False
        }
        return JsonResponse({
            'recommendations': fallback,
            'sources': data_sources,
            'goals_count': goals.count(),
            'warning': str(exc)
        })


def _get_data_range():
    """Get the date range of available billing data."""
    first_bill = Bill.objects.order_by('bill_date').first()
    last_bill = Bill.objects.order_by('-bill_date').first()
    
    if first_bill and last_bill:
        return {
            'start_date': first_bill.bill_date.isoformat() if first_bill.bill_date else None,
            'end_date': last_bill.bill_date.isoformat() if last_bill.bill_date else None,
            'total_bills': Bill.objects.count()
        }
    return {'start_date': None, 'end_date': None, 'total_bills': 0}


@require_http_methods(["GET", "POST", "PUT", "DELETE"])
@csrf_exempt
def sustainability_goals(request):
    """CRUD endpoint for sustainability goals."""
    
    if request.method == "GET":
        # List all goals or get specific goal
        goal_id = request.GET.get('id')
        if goal_id:
            try:
                goal = SustainabilityGoal.objects.get(id=goal_id)
                return JsonResponse(_serialize_goal(goal))
            except SustainabilityGoal.DoesNotExist:
                return JsonResponse({'error': 'Goal not found'}, status=404)
        
        # List all goals
        goals = SustainabilityGoal.objects.all()
        goals_list = [_serialize_goal(g) for g in goals]
        
        print(f"[DEBUG] Goals endpoint called - found {goals.count()} goals")
        print(f"[DEBUG] Goals data: {goals_list}")
        
        return JsonResponse({
            'goals': goals_list,
            'count': goals.count()
        })
    
    elif request.method == "POST":
        # Create new goal
        try:
            data = json.loads(request.body)
            
            # Limit to 5 goals maximum
            if SustainabilityGoal.objects.count() >= 5:
                return JsonResponse({'error': 'Maximum of 5 goals allowed'}, status=400)
            
            goal = SustainabilityGoal.objects.create(
                title=data.get('title', ''),
                description=data.get('description', ''),
                target_date=parse_date(data['target_date']) if data.get('target_date') else None
            )
            return JsonResponse(_serialize_goal(goal), status=201)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
    
    elif request.method == "PUT":
        # Update existing goal
        try:
            data = json.loads(request.body)
            goal_id = data.get('id')
            if not goal_id:
                return JsonResponse({'error': 'Goal ID required'}, status=400)
            
            goal = SustainabilityGoal.objects.get(id=goal_id)
            goal.title = data.get('title', goal.title)
            goal.description = data.get('description', goal.description)
            if data.get('target_date'):
                goal.target_date = parse_date(data['target_date'])
            goal.save()
            
            return JsonResponse(_serialize_goal(goal))
        except SustainabilityGoal.DoesNotExist:
            return JsonResponse({'error': 'Goal not found'}, status=404)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)
    
    elif request.method == "DELETE":
        # Delete goal
        try:
            data = json.loads(request.body)
            goal_id = data.get('id')
            if not goal_id:
                return JsonResponse({'error': 'Goal ID required'}, status=400)
            
            goal = SustainabilityGoal.objects.get(id=goal_id)
            goal.delete()
            return JsonResponse({'success': True, 'message': 'Goal deleted'})
        except SustainabilityGoal.DoesNotExist:
            return JsonResponse({'error': 'Goal not found'}, status=404)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)


def _serialize_goal(goal):
    """Serialize a SustainabilityGoal instance to dict."""
    return {
        'id': goal.id,
        'title': goal.title,
        'description': goal.description,
        'target_date': goal.target_date.isoformat() if goal.target_date else None,
        'created_at': goal.created_at.isoformat(),
        'updated_at': goal.updated_at.isoformat()
    }


@require_http_methods(["GET"])
def count_bills(request):
    try:
        return JsonResponse({'count': Bill.objects.count()})
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=500)


@require_http_methods(["GET"])
def download_template(request):
    headers = [
        'bill_id',
        'bill_type',
        'bill_date',
        'service_start',
        'service_end',
        'units_of_measure',
        'consumption',
        'cost',
        'provider',
        'city',
        'state',
        'zip',
    ]
    example_row = [
        '12345',
        Bill.BILL_TYPE_POWER,
        '2024-01-01',
        '2023-12-01',
        '2023-12-31',
        Bill.UNITS_KWH,
        '1200',
        '450.32',
        'Duluth Utilities',
        'Duluth',
        'GA',
        '30096',
    ]

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="sustainsync_template.csv"'
    writer = csv.writer(response)
    writer.writerow(headers)
    writer.writerow(example_row)
    return response


def _parse_decimal(value: str | None, field_name: str):
    if value in (None, ''):
        return None
    cleaned = value.replace('$', '').replace(',', '').strip()
    try:
        return Decimal(cleaned)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"Field '{field_name}' must be numeric") from exc


def _parse_date(value: str | None, field_name: str):
    if value in (None, ''):
        return None
    parsed = parse_date(value)
    if parsed is None:
        raise ValueError(f"Field '{field_name}' must be an ISO date (YYYY-MM-DD)")
    return parsed


@require_http_methods(["GET"])
def list_bills(request):
    """List and filter bills with pagination for the tables view."""
    try:
        bill_type = request.GET.get('bill_type')
        page = int(request.GET.get('page', '1'))
        page_size = int(request.GET.get('page_size', '20'))
        sort_by = request.GET.get('sort_by', 'bill_date')
        sort_direction = request.GET.get('sort_direction', 'desc').lower()

        descending = sort_direction != 'asc'

        ordering_map = {
            'bill_date': [F('bill_date')],
            'timestamp_upload': [F('timestamp_upload')],
            'consumption': [F('consumption')],
            'cost': [F('cost')],
            'provider': [F('provider'), F('bill_date')],
            'service_period': [
                Coalesce(F('service_start'), F('service_end'), F('bill_date')),
                Coalesce(F('service_end'), F('service_start'), F('bill_date')),
            ],
            'location': [F('city'), F('state'), F('zip'), F('bill_date')],
        }

        ordering_expressions = ordering_map.get(sort_by, ordering_map['bill_date'])
        order_by = [
            OrderBy(expr, descending=descending, nulls_last=True)
            for expr in ordering_expressions
        ]
        # Always add bill_id as a deterministic tie-breaker.
        order_by.append(OrderBy(F('bill_id'), descending=descending))

        # clamp pagination values
        page = max(1, page)
        page_size = max(1, min(100, page_size))

        queryset = Bill.objects.all()
        if bill_type:
            queryset = queryset.filter(bill_type=bill_type)

        queryset = queryset.order_by(*order_by)

        total_count = queryset.count()
        total_pages = (total_count + page_size - 1) // page_size
        if total_pages > 0 and page > total_pages:
            page = total_pages

        start = (page - 1) * page_size
        end = start + page_size
        bills = queryset[start:end]

        results = [
            {
                'bill_id': bill.bill_id,
                'bill_type': bill.bill_type,
                'bill_date': bill.bill_date.isoformat() if bill.bill_date else None,
                'service_start': bill.service_start.isoformat() if bill.service_start else None,
                'service_end': bill.service_end.isoformat() if bill.service_end else None,
                'service_period': (
                    f"{bill.service_start.isoformat() if bill.service_start else ''} - "
                    f"{bill.service_end.isoformat() if bill.service_end else ''}"
                ),
                'units_of_measure': bill.units_of_measure,
                'consumption': _to_float(bill.consumption),
                'cost': _to_float(bill.cost),
                'provider': bill.provider,
                'city': bill.city,
                'state': bill.state,
                'zip': bill.zip,
                'timestamp_upload': bill.timestamp_upload.isoformat() if bill.timestamp_upload else None,
            }
            for bill in bills
        ]

        return JsonResponse({
            'results': results,
            'count': total_count,
            'total_pages': total_pages,
            'page': page,
            'page_size': page_size,
            'sort_by': sort_by,
            'sort_direction': 'asc' if not descending else 'desc',
        })
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=500)


@csrf_exempt
@require_http_methods(["PATCH"])
def update_bill(request, bill_id):
    """Update a single bill record."""
    try:
        bill = Bill.objects.get(bill_id=bill_id)
    except Bill.DoesNotExist:
        return JsonResponse({'error': 'Bill not found'}, status=404)

    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload'}, status=400)

    allowed_types = {choice[0] for choice in Bill.BILL_TYPE_CHOICES}
    allowed_units = {choice[0] for choice in Bill.UNITS_OF_MEASURE_CHOICES}

    try:
        if 'bill_type' in payload:
            bill_type = payload['bill_type'].strip()
            if bill_type not in allowed_types:
                raise ValueError(f"bill_type must be one of: {', '.join(sorted(allowed_types))}")
            bill.bill_type = bill_type

        if 'bill_date' in payload:
            bill.bill_date = _parse_date(payload['bill_date'], 'bill_date')

        if 'service_start' in payload:
            bill.service_start = _parse_date(payload['service_start'], 'service_start')

        if 'service_end' in payload:
            bill.service_end = _parse_date(payload['service_end'], 'service_end')

        if 'units_of_measure' in payload:
            units = payload['units_of_measure'].strip() if payload['units_of_measure'] else None
            if units and units not in allowed_units:
                raise ValueError(f"units_of_measure must be one of: {', '.join(sorted(allowed_units))}")
            bill.units_of_measure = units

        if 'consumption' in payload:
            bill.consumption = _parse_decimal(str(payload['consumption']), 'consumption')

        if 'cost' in payload:
            bill.cost = _parse_decimal(str(payload['cost']), 'cost')

        if 'provider' in payload:
            bill.provider = payload['provider'] or None

        if 'city' in payload:
            bill.city = payload['city'] or None

        if 'state' in payload:
            state = payload['state']
            bill.state = state.upper() if state else None

        if 'zip' in payload:
            bill.zip = payload['zip'] or None

        bill.save()

        return JsonResponse({
            'bill_id': bill.bill_id,
            'bill_type': bill.bill_type,
            'bill_date': bill.bill_date.isoformat() if bill.bill_date else None,
            'service_start': bill.service_start.isoformat() if bill.service_start else None,
            'service_end': bill.service_end.isoformat() if bill.service_end else None,
            'units_of_measure': bill.units_of_measure,
            'consumption': _to_float(bill.consumption),
            'cost': _to_float(bill.cost),
            'provider': bill.provider,
            'city': bill.city,
            'state': bill.state,
            'zip': bill.zip,
        })
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=400)


@csrf_exempt
@require_http_methods(["POST"])
def upload_bills(request):
    upload = request.FILES.get('file')
    if not upload:
        return JsonResponse({'error': 'No file provided'}, status=400)

    try:
        wrapper = TextIOWrapper(upload.file, encoding='utf-8')
    except Exception as exc:
        return JsonResponse({'error': f'Unable to read uploaded file: {exc}'}, status=400)

    reader = csv.DictReader(wrapper)
    required_headers = {
        'bill_id', 'bill_type', 'bill_date', 'units_of_measure', 'consumption', 'cost'
    }
    if not reader.fieldnames or required_headers - set(reader.fieldnames):
        missing = required_headers - set(reader.fieldnames or [])
        return JsonResponse({'error': f'Missing required columns: {", ".join(sorted(missing))}'}, status=400)

    allowed_types = {choice[0] for choice in Bill.BILL_TYPE_CHOICES}
    allowed_units = {choice[0] for choice in Bill.UNITS_OF_MEASURE_CHOICES}

    inserted = 0
    updated = 0
    errors = []

    for idx, row in enumerate(reader, start=2):  # account for header row
        try:
            bill_id_raw = row.get('bill_id')
            if bill_id_raw in (None, ''):
                raise ValueError('bill_id is required')
            bill_id = int(bill_id_raw)

            bill_type = row.get('bill_type', '').strip()
            if bill_type not in allowed_types:
                raise ValueError(f"bill_type must be one of: {', '.join(sorted(allowed_types))}")

            units = row.get('units_of_measure', '').strip()
            if units and units not in allowed_units:
                raise ValueError(f"units_of_measure must be one of: {', '.join(sorted(allowed_units))}")

            bill_date = _parse_date(row.get('bill_date'), 'bill_date')
            service_start = _parse_date(row.get('service_start'), 'service_start')
            service_end = _parse_date(row.get('service_end'), 'service_end')

            consumption = _parse_decimal(row.get('consumption'), 'consumption')
            cost = _parse_decimal(row.get('cost'), 'cost')

            # Check for existing bill with same month/year and bill_type
            # If found, delete it so the new one can take its place
            if bill_date:
                year = bill_date.year
                month = bill_date.month
                # Delete any existing bills for this month/year/type combination
                deleted_count = Bill.objects.filter(
                    bill_date__year=year,
                    bill_date__month=month,
                    bill_type=bill_type
                ).exclude(bill_id=bill_id).delete()[0]
                
                if deleted_count > 0:
                    updated += deleted_count

            defaults = {
                'bill_type': bill_type,
                'bill_date': bill_date,
                'service_start': service_start,
                'service_end': service_end,
                'units_of_measure': units or None,
                'consumption': consumption,
                'cost': cost,
                'provider': row.get('provider') or None,
                'city': row.get('city') or None,
                'state': row.get('state') or None,
                'zip': row.get('zip') or None,
                'timestamp_upload': timezone.now(),
            }

            _, created = Bill.objects.update_or_create(
                bill_id=bill_id,
                defaults=defaults,
            )

            if created:
                inserted += 1
            elif deleted_count == 0:
                # Only count as updated if we didn't already count deleted records
                updated += 1
        except Exception as exc:
            errors.append({'row': idx, 'message': str(exc)})

    wrapper.detach()

    response = {
        'inserted': inserted,
        'updated': updated,
        'errors': errors,
    }
    if errors:
        response['status'] = 'completed_with_errors'
    else:
        response['status'] = 'success'

    return JsonResponse(response)
