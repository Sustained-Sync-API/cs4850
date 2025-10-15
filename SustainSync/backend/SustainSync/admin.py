from django.contrib import admin
from .models import Bill


@admin.register(Bill)
class BillAdmin(admin.ModelAdmin):
	list_display = ("bill_id", "bill_type", "bill_date", "provider", "city", "state", "cost")
	search_fields = ("provider", "city", "state", "bill_id")
	list_filter = ("bill_type", "provider", "state")
	ordering = ("-bill_date",)

