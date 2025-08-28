import pandas as pd


def excel_to_csv(excel_file, csv_file):
    """
    Convert an Excel file to a CSV file.

    Parameters:
    excel_file (str): Path to the input Excel file.
    csv_file (str): Path to the output CSV file.
    """

    # Read the Excel file
    df = pd.read_excel(excel_file)

    # Write to CSV
    df.to_csv(csv_file, index=False)

if __name__ == "__main__":
    
    excel_to_csv("../data/Book1.xlsx", "../data/epasubregiondata.csv")
