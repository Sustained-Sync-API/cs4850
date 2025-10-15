from django.shortcuts import render

# Create your views here.
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from llm import rag
import json

@csrf_exempt
def ask_rag(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            question = data.get('question', '').strip()
            if not question:
                return JsonResponse({'error': 'No question provided'}, status=400)

            answer = rag.run_query(question)
            return JsonResponse({'answer': answer})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'POST method required'}, status=405)


@csrf_exempt
def forecast(request):
    if request.method == 'GET':
        try:
            result = rag.run_forecast()
            return JsonResponse({'forecast': result})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'GET method required'}, status=405)
