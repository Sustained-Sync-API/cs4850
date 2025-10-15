import csv
import os
import django
from datetime import datetime

# Setup Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from SustainSync.models import Bill

CSV_PATH = "data/bills.csv"

with open(CSV_PATH, newline='', encoding='utf-8') as csvfile:
    reader = csv.DictReader(csvfile)
    count = 0
    for row in reader:
        Bill.objects.update_or_create(
            bill_id=row["bill_id"],
            defaults={
                "bill_type": row["bill_type"],
                "timestamp_upload": row["timestamp_upload"] or None,
                "bill_date": row["bill_date"] or None,
                "units_of_measure": row["units_of_measure"] or None,
                "consumption": row["consumption"] or None,
                "service_start": row["service_start"] or None,
                "service_end": row["service_end"] or None,
                "provider": row["provider"],
                "city": row["city"],
                "state": row["state"],
                "zip": row["zip"],
                "cost": row["cost"] or None,
                "file_source": row["file_source"],
            },
        )
        count += 1

print(f"✅ Successfully imported {count} bills.")
