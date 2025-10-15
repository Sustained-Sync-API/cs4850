import csv
import os
import django
from datetime import datetime

# Setup Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from SustainSync.models import Bill

# Resolve CSV path: prefer environment, then common filenames in the container-mounted /app/data
CSV_PATH = os.environ.get('BILLS_CSV')
if not CSV_PATH:
    candidates = ['data/bills.csv', 'data/billdata.csv', 'data/bills.csv']
    for c in candidates:
        if os.path.exists(c):
            CSV_PATH = c
            break
    if not CSV_PATH:
        # default fallback
        CSV_PATH = 'data/billdata.csv'


def parse_optional_float(value):
    try:
        return float(value) if value not in (None, '') else None
    except ValueError:
        return None


def parse_optional_date(value):
    try:
        if not value:
            return None
        # let Django handle the string date parsing where appropriate; store as string if field is CharField
        return value
    except Exception:
        return None


with open(CSV_PATH, newline='', encoding='utf-8') as csvfile:
    reader = csv.DictReader(csvfile)
    count = 0
    for row in reader:
        Bill.objects.update_or_create(
            bill_id=row.get("bill_id"),
            defaults={
                "bill_type": row.get("bill_type"),
                "timestamp_upload": parse_optional_date(row.get("timestamp_upload")),
                "bill_date": parse_optional_date(row.get("bill_date")),
                "units_of_measure": row.get("units_of_measure"),
                "consumption": parse_optional_float(row.get("consumption")),
                "service_start": parse_optional_date(row.get("service_start")),
                "service_end": parse_optional_date(row.get("service_end")),
                "provider": row.get("provider"),
                "city": row.get("city"),
                "state": row.get("state"),
                "zip": row.get("zip"),
                "cost": parse_optional_float(row.get("cost")),
                "file_source": row.get("file_source"),
            },
        )
        count += 1

print(f"\u2705 Successfully imported {count} bills from {CSV_PATH}.")
