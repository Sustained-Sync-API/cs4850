# ---- /scripts/forecast_utility_bills.py ----
import pandas as pd
from prophet import Prophet
import matplotlib
matplotlib.use('Agg')  # prevents Tkinter errors on Windows
import matplotlib.pyplot as plt
import os

def forecast_bill_type(df, bill_type, months_ahead=12, output_dir="forecasts"):
    """
    Train and forecast consumption for a specific bill type using Prophet.

    Args:
        df (DataFrame): Filtered DataFrame for one bill_type.
        bill_type (str): 'Power', 'Gas', or 'Water'.
        months_ahead (int): Number of months to forecast forward.
        output_dir (str): Directory where forecast plots & CSVs will be saved.
    """
    # Prepare data for Prophet
    df_prophet = df[['bill_date', 'consumption']].rename(columns={'bill_date': 'ds', 'consumption': 'y'})
    df_prophet = df_prophet.sort_values('ds')

    # Initialize Prophet model (yearly seasonality fits utility patterns)
    model = Prophet(yearly_seasonality=True, weekly_seasonality=False, daily_seasonality=False)
    model.fit(df_prophet)

    # Generate future dataframe
    future = model.make_future_dataframe(periods=months_ahead, freq='M')
    forecast = model.predict(future)

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    # Plot forecast
    fig1 = model.plot(forecast)
    plt.title(f"{bill_type} Consumption Forecast ({months_ahead} months ahead)")
    plt.xlabel("Date")
    plt.ylabel("Consumption")
    plt.grid(True)
    plt.tight_layout()
    plt.savefig(f"{output_dir}/{bill_type.lower()}_forecast.png", dpi=300)
    plt.close(fig1)

    # Plot forecast components (trend + seasonality)
    fig2 = model.plot_components(forecast)
    plt.tight_layout()
    plt.savefig(f"{output_dir}/{bill_type.lower()}_components.png", dpi=300)
    plt.close(fig2)

    # Save forecast data
    forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].to_csv(
        f"{output_dir}/{bill_type.lower()}_forecast.csv", index=False
    )

    print(f"[✓] Forecast complete for {bill_type}: {months_ahead} months ahead. "
          f"Plots and CSV saved to '{output_dir}/'.")

def forecast_all_bill_types(csv_path, months_ahead=12):
    """
    Load data and run Prophet forecasts for each unique bill_type.

    Args:
        csv_path (str): Path to the CSV file containing utility bill data.
        months_ahead (int): Forecast horizon in months.
    """
    # Load CSV
    df = pd.read_csv(csv_path, parse_dates=['bill_date'])

    # Ensure necessary columns exist
    required_cols = {'bill_type', 'bill_date', 'consumption'}
    if not required_cols.issubset(df.columns):
        raise ValueError(f"CSV must contain columns: {required_cols}")

    # Run Prophet for each bill type
    for bill_type, group in df.groupby('bill_type'):
        forecast_bill_type(group, bill_type, months_ahead)

# Example usage (you can call this externally or import this script)
if __name__ == "__main__":
    # Path to your utility data CSV (e.g., "data/utility_bills.csv")
    csv_path = "../../data/billdata.csv"

    # Define how many months ahead to forecast
    months_ahead = 12  # you can modify this externally or make it a CLI arg

    forecast_all_bill_types(csv_path, months_ahead)
