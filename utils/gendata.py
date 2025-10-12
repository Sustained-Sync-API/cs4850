import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# Set parameters
start_year = 2015
end_year = 2024
city = "Duluth"
state = "GA"
zip_code = "30096"

# Providers
providers = {
    "Power": "Georgia Power",
    "Gas": "Gas South",
    "Water": "Gwinnett P.U."
}

# Base consumption and cost patterns (initial for Jan 2015)
base_consumption = {
    "Power": 180000.0,  # kWh
    "Gas": 4500.0,      # therms
    "Water": 900.0      # CCF
}
base_cost_per_unit = {
    "Power": 0.10,      # $/kWh
    "Gas": 0.60,        # $/therm
    "Water": 0.60       # $/CCF
}

# Seasonal factors for each month (relative to base)
seasonal_factors = {
    "Power": [1.0, 0.95, 1.03, 1.05, 1.1, 1.2, 1.25, 1.25, 1.15, 1.05, 1.0, 0.98],
    "Gas":   [1.0, 0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.6, 0.8, 0.9, 1.0],
    "Water": [1.0, 0.98, 1.0, 1.05, 1.1, 1.2, 1.3, 1.3, 1.2, 1.1, 1.05, 1.0]
}

# Growth rate per year for Power (due to servers); Gas & Water grow slower
growth_rate = {
    "Power": 0.05,   # 5% per year
    "Gas": 0.03,     # 3% per year
    "Water": 0.04    # 4% per year
}

records = []
bill_id = 1

for year in range(start_year, end_year + 1):
    years_since_start = year - start_year
    for month in range(1, 13):
        days_in_month = (datetime(year + (month // 12), (month % 12) + 1, 1) - timedelta(days=1)).day \
            if month != 12 else 31
        service_start = datetime(year, month, 1)
        service_end = datetime(year, month, days_in_month)
        bill_date = service_start
        timestamp_upload = service_start + timedelta(days=4, hours=10)

        for bill_type in ["Power", "Gas", "Water"]:
            consumption = (base_consumption[bill_type] *
                           seasonal_factors[bill_type][month - 1] *
                           (1 + growth_rate[bill_type]) ** years_since_start)
            cost = consumption * base_cost_per_unit[bill_type]

            records.append({
                "bill_id": bill_id,
                "bill_type": bill_type,
                "timestamp_upload": timestamp_upload.strftime("%Y-%m-%d %H:%M:%S"),
                "bill_date": bill_date.strftime("%Y-%m-%d"),
                "units_of_measure": "kWh" if bill_type == "Power" else "therms" if bill_type == "Gas" else "CCF",
                "consumption": round(consumption, 2),
                "service_start": service_start.strftime("%Y-%m-%d"),
                "service_end": service_end.strftime("%Y-%m-%d"),
                "provider": providers[bill_type],
                "city": city,
                "state": state,
                "zip": zip_code,
                "cost": round(cost, 2),
                "file_source": "internal"
            })
            bill_id += 1

# Create DataFrame
df = pd.DataFrame(records)

# Save to CSV
csv_path = "billdata.csv"
df.to_csv(csv_path, index=False)

