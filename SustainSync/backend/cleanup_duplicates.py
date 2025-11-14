#!/usr/bin/env python
"""
Cleanup duplicate bills with same bill_date (month/year) on system startup.
Keeps the most recently uploaded bill when duplicates are detected.
"""

import os
import sys
import django

# Setup Django environment
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db.models import Q, Count
from SustainSync.models import Bill


def cleanup_duplicate_bills():
    """Remove duplicate bills with same bill_date (month/year) and bill_type, keeping the newest."""
    
    print("🔍 Checking for duplicate bills with same bill_date (month/year)...")
    
    # Get all bill types
    bill_types = Bill.objects.values_list('bill_type', flat=True).distinct()
    
    total_deleted = 0
    
    for bill_type in bill_types:
        print(f"\n📊 Processing {bill_type} bills...")
        
        # Find bills with same month/year/type
        bills_by_month = Bill.objects.filter(
            bill_type=bill_type,
            bill_date__isnull=False
        ).extra(select={
            'year': "EXTRACT(YEAR FROM bill_date)",
            'month': "EXTRACT(MONTH FROM bill_date)"
        }).values('year', 'month').annotate(count=Count('bill_id')).filter(count__gt=1)
        
        for month_group in bills_by_month:
            year = int(month_group['year'])
            month = int(month_group['month'])
            
            # Get all bills for this month/year/type
            duplicates = Bill.objects.filter(
                bill_type=bill_type,
                bill_date__year=year,
                bill_date__month=month
            ).order_by('-timestamp_upload', '-bill_id')
            
            if duplicates.count() > 1:
                # Keep the first (newest), delete the rest
                to_keep = duplicates.first()
                to_delete = duplicates.exclude(bill_id=to_keep.bill_id)
                
                print(f"  ⚠️  Found {to_delete.count()} duplicate(s) for {year}/{month:02d}")
                print(f"      Keeping Bill #{to_keep.bill_id} (uploaded {to_keep.timestamp_upload or to_keep.bill_date})")
                
                for bill in to_delete:
                    print(f"      Deleting Bill #{bill.bill_id} (uploaded {bill.timestamp_upload or bill.bill_date})")
                
                deleted_count = to_delete.delete()[0]
                total_deleted += deleted_count
    
    if total_deleted > 0:
        print(f"\n✅ Cleanup complete! Removed {total_deleted} duplicate bill(s) total.")
    else:
        print(f"\n✓ No duplicates found. Database is clean!")
    
    return total_deleted


if __name__ == '__main__':
    try:
        cleanup_duplicate_bills()
    except Exception as e:
        print(f"❌ Error during duplicate cleanup: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
