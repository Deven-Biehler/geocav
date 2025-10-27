import pandas as pd
import os

# Define paths and periods
data_dir = "geocav_proj/CDC Data"
periods = [(2011, 2015), (2016, 2020)]
output_data = {}

# Create output directory
output_dir = "processed_data"
os.makedirs(output_dir, exist_ok=True)








# Walk through all CSV files in the original data directory
for root, dirs, files in os.walk(data_dir):
    for file in files:
        if not file.endswith('.csv'):
            continue
            
        file_path = os.path.join(root, file)
        
        # Create corresponding output file path
        rel_path = os.path.relpath(file_path, data_dir)
        output_file_path = os.path.join(output_dir, rel_path)
        os.makedirs(os.path.dirname(output_file_path), exist_ok=True)
        
        try:
            df = pd.read_csv(file_path)
            
            # Skip if file is empty or missing FIPS
            if df.empty or "CountyFIPS" not in df.columns:
                print(f"Skipping {file}: Missing CountyFIPS or empty")
                continue
            
            processed_df = pd.DataFrame()
            
            # Handle datasets with no 'Year' column (e.g., Radon)
            if "Year" not in df.columns:
                print(f"{file} has no Year column. Using as-is for both periods.")
                for start_year, end_year in periods:
                    df_period = df.copy()
                    df_period["Start Year"] = start_year
                    df_period["End Year"] = end_year
                    processed_df = pd.concat([processed_df, df_period], ignore_index=True)
            else:
                # Process datasets with Year column
                for start_year, end_year in periods:
                    df_period = df[(df["Year"] >= start_year) & (df["Year"] <= end_year)]
                    if df_period.empty:
                        print(f"No data for {file} in {start_year}–{end_year}")
                        continue
                    
                    # Select numeric columns for averaging
                    numeric_cols = df_period.select_dtypes(include="number").columns
                    agg_cols = [col for col in numeric_cols if col not in ["CountyFIPS", "Year"]]
                    if not agg_cols:
                        print(f"No numeric columns to aggregate in {file} for {start_year}–{end_year}")
                        continue
                    
                    # Group by CountyFIPS and compute mean, keeping all columns
                    df_agg = df_period.groupby("CountyFIPS").agg({
                        **{col: 'mean' for col in agg_cols},
                        **{col: 'first' for col in df_period.columns if col not in agg_cols + ["CountyFIPS", "Year"]}
                    }).reset_index()
                    
                    df_agg["Start Year"] = start_year
                    df_agg["End Year"] = end_year
                    
                    processed_df = pd.concat([processed_df, df_agg], ignore_index=True)
            
            # Save processed data to new location
            if not processed_df.empty:
                processed_df.to_csv(output_file_path, index=False)
                print(f"Saved processed data to {output_file_path}")
            
        except Exception as e:
            print(f"Error processing {file}: {e}")
