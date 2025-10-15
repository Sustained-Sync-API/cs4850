from django.shortcuts import render

# Create your views here.
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json

@csrf_exempt
def ask_rag(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            question = data.get('question', '').strip()
            if not question:
                return JsonResponse({'error': 'No question provided'}, status=400)
            # lazy import rag to avoid import-time dependency failures (pandas/faiss/torch heavy libs)
            try:
                from llm import rag as ragmod
            except Exception as e:
                return JsonResponse({'error': f'RAG not available in container: {e}'}, status=503)

            answer = ragmod.run_query(question)
            return JsonResponse({'answer': answer})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'POST method required'}, status=405)


@csrf_exempt
def forecast(request):
    if request.method == 'GET':
        try:
            try:
                from llm import rag as ragmod
            except Exception as e:
                return JsonResponse({'error': f'RAG not available in container: {e}'}, status=503)

            result = ragmod.run_forecast()
            return JsonResponse({'forecast': result})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'GET method required'}, status=405)


def count_bills(request):
    if request.method == 'GET':
        try:
            from .models import Bill
            count = Bill.objects.count()
            return JsonResponse({'count': count})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'GET method required'}, status=405)
