import os
import json
import pandas as pd
from django.core.management.base import BaseCommand
from django.conf import settings

class Command(BaseCommand):
    def __init__(self):
        super().__init__()
        self.factor_files = [
            "data/CDC Data/Factors/County_Level/Environment/Air_Quality.csv",
            "data/CDC Data/Factors/County_Level/Environment/Air_Toxins_Concentration.csv",
            "data/CDC Data/Factors/State_Level/Environment/Air_Toxins_Concentration.csv",
            "data/CDC Data/Factors/County_Level/Environment/Annual_Sunlight_Exposure.csv",
            "data/CDC Data/Factors/State_Level/Environment/Annual_Sunlight_Exposure.csv",
            "data/CDC Data/Factors/County_Level/Environment/Annual_UV_DailyDose.csv",
            "data/CDC Data/Factors/State_Level/Environment/Annual_UV_DailyDose.csv",
            "data/CDC Data/Factors/State_Level/Environment/CO_Poisoning_Hospitalization.csv",
            "data/CDC Data/Factors/State_Level/Environment/Pesticide_Exposure.csv",
            "data/CDC Data/Factors/County_Level/Health/Coronary_Heart_Disease.csv",
            "data/CDC Data/Factors/County_Level/Health/Depression.csv",
            "data/CDC Data/Factors/County_Level/Health/Diabetes.csv",
            "data/CDC Data/Factors/County_Level/Health/Heart_Stroke.csv",
            "data/CDC Data/Factors/State_Level/Health/Heart_Stroke.csv",
            "data/CDC Data/Factors/County_Level/Health/High_Blood_Pressure.csv",
            "data/CDC Data/Factors/State_Level/Health/High_Blood_Pressure.csv",
            "data/CDC Data/Factors/County_Level/Health/High_Cholesterol.csv",
            "data/CDC Data/Factors/State_Level/Health/High_Cholesterol.csv",
            "data/CDC Data/Factors/County_Level/Health/Hospitalization.csv",
            "data/CDC Data/Factors/State_Level/Health/Hospitalization.csv",
            "data/CDC Data/Factors/County_Level/Health/Hospitalization_Gender.csv",
            "data/CDC Data/Factors/State_Level/Health/Hospitalization_Gender.csv",
            "data/CDC Data/Factors/County_Level/Health/No_Health_Insurance.csv",
            "data/CDC Data/Factors/State_Level/Health/No_Health_Insurance.csv",
            "data/CDC Data/Factors/County_Level/Lifestyle/Binge_Drinking.csv",
            "data/CDC Data/Factors/County_Level/Lifestyle/No_Physical_Activity.csv",
            "data/CDC Data/Factors/County_Level/Lifestyle/Obesity.csv",
            "data/CDC Data/Factors/County_Level/Lifestyle/Short_Sleep.csv",
            "data/CDC Data/Factors/County_Level/Lifestyle/Smoking.csv",
            "data/CDC Data/Factors/State_Level/Lifestyle/Smoking.csv",
            "data/CDC Data/Factors/County_Level/SVI_Score.csv"
        ]
        self.cancer_incidence_files = [
            "data/CDC Data/Cancer_Incidence/State_Level/Cancer_Incidence_State.csv",
            "data/CDC Data/Cancer_Incidence/State_Level/Cancer_Incidence_State_Race.csv",
            "data/CDC Data/Cancer_Incidence/State_Level/Cancer_Incidence_State_Gender.csv",
            "data/CDC Data/Cancer_Incidence/County_Level/Cancer_Incidence_County.csv",
            "data/CDC Data/Cancer_Incidence/County_Level/Cancer_Incidence_County_Race.csv",
            "data/CDC Data/Cancer_Incidence/County_Level/Cancer_Incidence_County_Gender.csv"
        ]
        self.factor_columns = ["StateFIPS","State","CountyFIPS","County","Start Year","End Year","Value","Factor"]
        self.cancer_incidence_columns = ["StateFIPS","State","CountyFIPS","County","Start Year","End Year","Pancreatic","Skin","Lung","Liver","Breast","Kidney","Prostate","Esophageal", "Sex", "Race Ethnicity"]
        self.geographic_levels = ["county", "state"]

    def handle(self, *args, **options):
        self.pre_process_data()
        self.stdout.write(self.style.SUCCESS('Successfully pre-processed all data'))

    def pre_process_data(self):
        """Pre-process raw data files into standardized format for loading"""
        self.stdout.write('Pre-processing factor data...')
        factor_df = self._preprocess_factor_data()
        factor_df.to_csv(os.path.join(settings.BASE_DIR, 'data/factors.csv'), index=False)
        self.stdout.write(self.style.SUCCESS(f'Successfully saved {len(factor_df)} records to factors.csv'))

        self.stdout.write('Pre-processing cancer incidence data...')
        cancer_df = self._preprocess_cancer_data()
        cancer_df.to_csv(os.path.join(settings.BASE_DIR, 'data/cancer_incidence.csv'), index=False)
        self.stdout.write(self.style.SUCCESS(f'Successfully saved {len(cancer_df)} records to cancer_incidence.csv'))

    # --------------------------------------------------------------
    #                   CDC DATA PRE-PROCESSING
    # --------------------------------------------------------------

    def _preprocess_factor_data(self):
        """Moves all factor data into a single dataframe and standardizes columns"""
        dfs = []

        # ----------------------------------------------
        # ADD NEW FACTOR DATA HERE
        # ----------------------------------------------
        
        # Add SVI data
        svi_df = self._preprocess_SVI_data()
        dfs.append(svi_df)

        # Add RUCC data
        # rucc_df = self._preprocess_RUCC_data()
        # dfs.append(rucc_df)

        # Add Opioid data
        opioid_df = self._preprocess_opioid_data()
        dfs.append(opioid_df)

        # ----------------------------------------------
        # ADD NEW FACTOR DATA HERE
        # ----------------------------------------------

        # Add all CDC factor files
        for file in self.factor_files:
            file = os.path.join(settings.BASE_DIR, file)    
            df = pd.read_csv(file)
            df = self._standardize_factor_df(df=df, file=file)
            dfs.append(df)
        
        merged_df = pd.concat(dfs, ignore_index=True)


        # For each factor, check if state level data exists; if not, calculate it
        existing_factors = merged_df['Factor'].unique()
        new_state_dfs = []
        for factor in existing_factors:
            factor_df = merged_df[merged_df['Factor'] == factor]
            
            # Check if state level data exists (County == 'All')
            if not factor_df[factor_df['County'] == 'All'].empty:
                continue
                
            self.stdout.write(f"Calculating state averages for {factor}...")
            
            # Group by state and year to calculate averages
            # Ensure we keep StateFIPS
            state_avg = factor_df.groupby(['State', 'StateFIPS', 'Start Year', 'End Year'])['Value'].mean().reset_index()
            
            # Add required columns
            state_avg['County'] = 'All'
            state_avg['CountyFIPS'] = 0
            state_avg['Factor'] = factor
            
            # Ensure correct column order
            state_avg = state_avg[self.factor_columns]
            new_state_dfs.append(state_avg)
        if new_state_dfs:
            merged_df = pd.concat([merged_df] + new_state_dfs, ignore_index=True)

        return merged_df

    def _preprocess_cancer_data(self):
        """Moves all cancer incidence data into a single dataframe and standardizes columns"""
        dfs = []
        for file in self.cancer_incidence_files:
            file = os.path.join(settings.BASE_DIR, file)
            df = pd.read_csv(file)
            df = self._standardize_cancer_df(df=df)
            dfs.append(df)
        
        merged_df = pd.concat(dfs, ignore_index=True)
        return merged_df

    def _standardize_factor_df(self, df, file):
        df['Factor'] = os.path.basename(file)[:-4]  # Use filename (without .csv) as factor name
        print("Processing file: ", file, "With shape: ", df.shape)
        if "County" not in df.columns:
            df["County"] = "All"
            df['Geographic Level'] = "State"
            df["CountyFIPS"] = 0
        if "Year" in df.columns:
            df["Start Year"] = df["Year"]
            df["End Year"] = df["Year"]
        
        # Handle cancer incidence files that are being processed as factors
        if "Incidence Rate" in df.columns and "Value" not in df.columns:
            df.rename(columns={"Incidence Rate": "Value"}, inplace=True)

        # Remove any unecessary columns
        df = df[self.factor_columns]
        
        # Standardize units - convert non-numeric values and ensure consistent formatting
        df['Value'] = df['Value'].astype(str).str.replace(',', '', regex=False).str.replace('%', '', regex=False) # Remove commas and percent signs
        df['Value'] = pd.to_numeric(df['Value'], errors='coerce')
        df = df.dropna(subset=['Value'])
        df['Factor'] = df['Factor'].str.strip()
        df['County'] = df['County'].str.strip()
        df['State'] = df['State'].str.strip()
        df['StateFIPS'] = df['StateFIPS'].apply(lambda x: int(x))
        df['CountyFIPS'] = df['CountyFIPS'].apply(lambda x: int(x))

        if len(df) == 0:
            raise ValueError(f"No valid records in {file}")
        
        return df
    
    def _standardize_cancer_df(self, df):
        if "Sex" not in df.columns:
            df['Sex'] = "All"
        if "Race Ethnicity" not in df.columns:
            df["Race Ethnicity"] = "ALL"
        if "County" not in df.columns:
            df["County"] = "All"
            df['Geographic Level'] = "State"
            df["CountyFIPS"] = 0
        if "Year" in df.columns:
            df["Start Year"] = df["Year"]
            df["End Year"] = df["Year"]
        if "Breast" not in df.columns:
            df["Breast"] = "Suppressed"
        if "Prostate" not in df.columns:
            df["Prostate"] = "Suppressed"

        
        # Remove any unecessary columns
        df = df[self.cancer_incidence_columns]
        
        # Convert cancer type columns to long format
        cancer_columns = ["Pancreatic","Skin","Lung","Liver","Breast","Kidney","Prostate","Esophageal"]
        id_vars = [col for col in df.columns if col not in cancer_columns]
        df = pd.melt(df, id_vars=id_vars, value_vars=cancer_columns, 
                     var_name='Cancer Type', value_name='Incidence')
        
        # Standardize units - convert non-numeric values and ensure consistent formatting
        df['Incidence'] = pd.to_numeric(df['Incidence'].astype(str).str.replace(',', '', regex=False), errors='coerce')
        df = df.dropna(subset=['Incidence'])
        df['Sex'] = df['Sex'].str.strip().str.upper()
        df['Race Ethnicity'] = df['Race Ethnicity'].str.strip().str.upper()
        df['Cancer Type'] = df['Cancer Type'].str.strip().str.title()
        
        # Duplicate Breast (All -> Female) and Prostate (All -> Male) data
        breast_all = df[(df['Cancer Type'] == 'Breast') & (df['Sex'] == 'ALL')].copy()
        breast_all['Sex'] = 'FEMALE'
        
        prostate_all = df[(df['Cancer Type'] == 'Prostate') & (df['Sex'] == 'ALL')].copy()
        prostate_all['Sex'] = 'MALE'
        
        df = pd.concat([df, breast_all, prostate_all], ignore_index=True)

        df['County'] = df['County'].str.strip()
        df['State'] = df['State'].str.strip()
        df['StateFIPS'] = df['StateFIPS'].apply(lambda x: int(x))
        df['CountyFIPS'] = df['CountyFIPS'].apply(lambda x: int(x))
        
        return df

    # --------------------------------------------------------------
    #                   SVI DATA PRE-PROCESSING
    # --------------------------------------------------------------
    def _preprocess_SVI_data(self):
        """
        Pre-processes SVI data and returns a standardized DataFrame.
        """
        svi_dir = os.path.join(settings.BASE_DIR, 'data/SVI_data')
        svi_files = [f for f in os.listdir(svi_dir) if f.endswith('.csv')]
        
        svi_data = pd.DataFrame()
        for file in svi_files:
            year = file.split('_')[1]
            df = pd.read_csv(os.path.join(svi_dir, file), dtype={"FIPS": str})
            df["STATE"] = df["STATE"].str.title()
            df.rename(columns={"ST": "StateFIPS", "STATE": "State", "FIPS": "CountyFIPS", "COUNTY": "County", "RPL_THEMES": "Value"}, inplace=True)
            df["Year"] = int(year)
            svi_data = pd.concat([svi_data, df[["StateFIPS", "State", "CountyFIPS", "County", "Year", "Value"]]], ignore_index=True)
            
        svi_data['Factor'] = 'SVI_Score'
        svi_data.rename(columns={"Year": "Start Year"}, inplace=True)
        svi_data["End Year"] = svi_data["Start Year"]

        # Ensure correct column order and types
        svi_data = svi_data[self.factor_columns]
        svi_data['Value'] = pd.to_numeric(svi_data['Value'], errors='coerce')
        svi_data.dropna(subset=['Value'], inplace=True)
        svi_data['StateFIPS'] = svi_data['StateFIPS'].apply(lambda x: int(x))
        svi_data['CountyFIPS'] = svi_data['CountyFIPS'].apply(lambda x: int(x))

        self.stdout.write(f"Processed SVI data, {len(svi_data)} records created.")
        return svi_data

    # --------------------------------------------------------------
    #                   RUCC DATA PRE-PROCESSING
    # --------------------------------------------------------------

    # --------------------------------------------------------------
    #                   OPIOD DATA PRE-PROCESSING
    # --------------------------------------------------------------

    def _preprocess_opioid_data(self):
        """
        Pre-processes Opioid data and returns a standardized DataFrame.
        """
        opiod_county_path = os.path.join(settings.BASE_DIR, 'data/Opiod Data/County Opioid Dispensing Rates.csv')
        opiod_state_path = os.path.join(settings.BASE_DIR, 'data/Opiod Data/State Opioid Dispensing Rates.csv')

        dfs = []

        # county columns: FullGeoName,YEAR,STATE_NAME,STATE_ABBREV,COUNTY_NAME,STATE_COUNTY_FIP_U,opioid_dispensing_rate,Opioid Dispensing Rate (per 100 persons)
        # "KY, Wayne",2019,Kentucky,KY,Wayne County,21231,105.5,>49.8

        # state columns: YEAR,STATE_NAME,STATE_ABBREV,STATE_FIPS,opioid_dispensing_rate,Opioid Dispensing Rate (per 100 persons)
        # 2019,Alabama,AL,01,86,>51.7

        for file, geo_level in [(opiod_county_path, 'County'), (opiod_state_path, 'State')]:
            # Preprocess each file
            df = pd.read_csv(file, dtype={"STATE_COUNTY_FIP_U": str, "STATE_FIPS": str})
            if geo_level == 'County':
                df.rename(columns={
                    "STATE_COUNTY_FIP_U": "CountyFIPS",
                    "COUNTY_NAME": "County",
                    "STATE_NAME": "State",
                    "YEAR": "Start Year",
                    "opioid_dispensing_rate": "Value"
                }, inplace=True)
                df["StateFIPS"] = df["CountyFIPS"].str[:2]
                df["End Year"] = df["Start Year"]
                df['County'] = df['County'].str.replace(' County', '', regex=False).str.strip()

            else:  # State level
                df.rename(columns={
                    "STATE_FIPS": "StateFIPS",
                    "STATE_NAME": "State",
                    "YEAR": "Start Year",
                    "opioid_dispensing_rate": "Value"
                }, inplace=True)
                df["CountyFIPS"] = '0'
                df["County"] = 'All'
                df["End Year"] = df["Start Year"]
            df['Factor'] = 'Opioid_Dispensing_Rate'
            df = df[self.factor_columns]
            df['Value'] = pd.to_numeric(df['Value'], errors='coerce')
            df.dropna(subset=['Value'], inplace=True)
            df['StateFIPS'] = df['StateFIPS'].apply(lambda x: int(x))
            df['CountyFIPS'] = df['CountyFIPS'].apply(lambda x: int(x))
            dfs.append(df)
        merged_df = pd.concat(dfs, ignore_index=True)

        if len(merged_df) == 0:
            raise ValueError("No valid records in Opioid data")

        self.stdout.write(f"Processed Opioid data, {len(merged_df)} records created.")
        return merged_df