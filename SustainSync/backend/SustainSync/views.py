"""REST endpoints powering the SustainSync dashboard."""

from __future__ import annotations

import csv
import json
from decimal import Decimal, InvalidOperation
from io import TextIOWrapper

from django.db.models import Avg, Sum
from django.db.models.functions import TruncMonth
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import Bill, Goal


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

    return [
        {
            'month': item['month'].date().isoformat() if item['month'] else None,
            'total_cost': _to_float(item['total_cost']),
            'total_consumption': _to_float(item['total_consumption']),
        }
        for item in series
    ]


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
    
    # Allow optional LLM summaries via query param (warning: very slow, ~2-3 minutes)
    include_summaries = request.GET.get('summaries', '').lower() in ('true', '1', 'yes')

    try:
        from llm import rag as ragmod
    except Exception as exc:  # pragma: no cover - optional dependency
        return JsonResponse({'error': f'RAG not available in container: {exc}'}, status=503)

    try:
        # The LLM helper now returns total plus per-utility forecasts and summaries.
        result = ragmod.run_forecast(periods=periods, include_summaries=include_summaries)
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=500)

    status = 200 if not (isinstance(result, dict) and result.get('error')) else 500
    return JsonResponse(result, status=status)


@require_http_methods(["GET"])
def ai_recommendations(request):
    custom_question = request.GET.get('question', '').strip()
    prompt = custom_question or (
        "You are an energy and sustainability analyst reviewing multi-utility billing data. "
        "Provide three actionable recommendations that combine cost savings and sustainability improvements. "
        "Respond with concise bullet points."
    )

    try:
        from llm import rag as ragmod
        answer = ragmod.run_query(prompt)
        return JsonResponse({'recommendations': answer})
    except Exception as exc:  # pragma: no cover - optional dependency
        fallback = _fallback_recommendations()
        return JsonResponse({'recommendations': fallback, 'warning': str(exc)})


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
    """List and filter bills with pagination."""
    try:
        # Get filter parameters
        bill_type = request.GET.get('bill_type')
        page = int(request.GET.get('page', '1'))
        page_size = int(request.GET.get('page_size', '20'))
        
        # Validate pagination
        page = max(1, page)
        page_size = max(1, min(100, page_size))
        
        # Build query
        queryset = Bill.objects.all()
        if bill_type:
            queryset = queryset.filter(bill_type=bill_type)
        
        # Get total count
        total_count = queryset.count()
        total_pages = (total_count + page_size - 1) // page_size  # Ceiling division
        
        # Paginate
        start = (page - 1) * page_size
        end = start + page_size
        bills = queryset[start:end]
        
        # Serialize
        results = [
            {
                'bill_id': bill.bill_id,
                'bill_type': bill.bill_type,
                'bill_date': bill.bill_date.isoformat() if bill.bill_date else None,
                'service_start': bill.service_start.isoformat() if bill.service_start else None,
                'service_end': bill.service_end.isoformat() if bill.service_end else None,
                'service_period': f"{bill.service_start.isoformat() if bill.service_start else ''} - {bill.service_end.isoformat() if bill.service_end else ''}",
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
        })
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=500)


@csrf_exempt
@require_http_methods(["PATCH"])
def update_bill(request, bill_id):
    """Update a single bill."""
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
        # Update fields if present in payload
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
            else:
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


@require_http_methods(["GET"])
def list_goals(request):
    """List all sustainability goals."""
    try:
        goals = Goal.objects.all()
        results = [
            {
                'id': goal.id,
                'title': goal.title,
                'description': goal.description,
                'target_date': goal.target_date.isoformat() if goal.target_date else None,
                'created_at': goal.created_at.isoformat() if goal.created_at else None,
                'updated_at': goal.updated_at.isoformat() if goal.updated_at else None,
            }
            for goal in goals
        ]
        return JsonResponse({'results': results})
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def create_goal(request):
    """Create a new sustainability goal."""
    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload'}, status=400)
    
    title = payload.get('title', '').strip()
    description = payload.get('description', '').strip()
    
    if not title:
        return JsonResponse({'error': 'Title is required'}, status=400)
    if not description:
        return JsonResponse({'error': 'Description is required'}, status=400)
    
    # Check goal limit (max 5)
    if Goal.objects.count() >= 5:
        return JsonResponse({'error': 'Maximum of 5 goals allowed'}, status=400)
    
    try:
        target_date = _parse_date(payload.get('target_date'), 'target_date')
        
        goal = Goal.objects.create(
            title=title,
            description=description,
            target_date=target_date,
        )
        
        return JsonResponse({
            'id': goal.id,
            'title': goal.title,
            'description': goal.description,
            'target_date': goal.target_date.isoformat() if goal.target_date else None,
            'created_at': goal.created_at.isoformat() if goal.created_at else None,
        }, status=201)
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=400)


@csrf_exempt
@require_http_methods(["PATCH"])
def update_goal(request, goal_id):
    """Update an existing goal."""
    try:
        goal = Goal.objects.get(id=goal_id)
    except Goal.DoesNotExist:
        return JsonResponse({'error': 'Goal not found'}, status=404)
    
    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload'}, status=400)
    
    try:
        if 'title' in payload:
            title = payload['title'].strip()
            if not title:
                raise ValueError('Title cannot be empty')
            goal.title = title
        
        if 'description' in payload:
            description = payload['description'].strip()
            if not description:
                raise ValueError('Description cannot be empty')
            goal.description = description
        
        if 'target_date' in payload:
            goal.target_date = _parse_date(payload['target_date'], 'target_date')
        
        goal.save()
        
        return JsonResponse({
            'id': goal.id,
            'title': goal.title,
            'description': goal.description,
            'target_date': goal.target_date.isoformat() if goal.target_date else None,
            'updated_at': goal.updated_at.isoformat() if goal.updated_at else None,
        })
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=400)


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_goal(request, goal_id):
    """Delete a goal."""
    try:
        goal = Goal.objects.get(id=goal_id)
        goal.delete()
        return JsonResponse({'success': True})
    except Goal.DoesNotExist:
        return JsonResponse({'error': 'Goal not found'}, status=404)
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=500)
