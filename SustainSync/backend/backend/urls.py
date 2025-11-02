"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from SustainSync import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('ask/', views.ask_rag, name='ask_rag'),
    path('api/dashboard/metrics/', views.dashboard_metrics, name='dashboard_metrics'),
    path('api/dashboard/monthly/', views.monthly_trends, name='monthly_trends'),
    path('api/forecast/', views.forecast, name='forecast_api'),
    path('forecast/', views.forecast, name='forecast'),
    path('api/recommendations/', views.ai_recommendations, name='ai_recommendations'),
    path('api/bills/', views.list_bills, name='list_bills'),
    path('api/bills/<int:bill_id>/', views.update_bill, name='update_bill'),
    path('api/goals/', views.sustainability_goals, name='sustainability_goals'),
    path('api/bills/template/', views.download_template, name='download_template'),
    path('api/bills/upload/', views.upload_bills, name='upload_bills'),
    path('api/count/', views.count_bills, name='count_bills'),
]
