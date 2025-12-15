import os
import json
import pandas as pd
from django.core.management.base import BaseCommand
from django.db import transaction
from django.conf import settings
from ...models import (
    CancerType,
    Factor,
    Gender,
    GeographicLevel,
    Race,
    CancerIncidence,
    FactorMeasurement
)

class Command(BaseCommand):
    def __init__(self):
        super().__init__()
        data_config_path = os.path.join(settings.BASE_DIR, 'data_config.json')
        with open(data_config_path, 'r') as f:
            self.data_config = json.load(f)

        self.factor_files = self.data_config["factor_files"]
        self.factor_columns = ["StateFIPS","State","CountyFIPS","County","Start Year","End Year","Value","Factor"]
        self.cancer_incidence_files = self.data_config["cancer_incidence_files"]
        self.cancer_incidence_columns = ["StateFIPS","State","CountyFIPS","County","Start Year","End Year","Pancreatic","Skin","Lung","Liver","Breast","Kidney","Prostate","Esophageal", "Sex", "Race Ethnicity"]
        self.geographic_levels = ["county", "state"]
    
    def handle(self, *args, **options):
        self.load_data()
        self.stdout.write(self.style.SUCCESS('Successfully loaded all data'))

    def load_data(self):
        self.clear_existing_data()
        self.pre_process_data()
        self.load_factors()
        self.load_cancer_incidence()

    def load_factors(self):
        """Load environmental factor data into database"""
        factors_path = os.path.join(settings.BASE_DIR, 'CDC Data/factors.csv')
        df = pd.read_csv(factors_path)

        # Pre-create lookups
        factors_dict = {name: Factor.objects.get_or_create(name=name)[0] 
                    for name in df['Factor'].unique()}
        gender_all = Gender.objects.get_or_create(name='All')[0]
        race_all = Race.objects.get_or_create(name='ALL')[0]
        
        # Add geo_level and factor_id columns
        df['geo_level'] = df['County'].apply(
            lambda x: GeographicLevel.STATE if x == 'All' else GeographicLevel.COUNTY
        )
        df['factor_id'] = df['Factor'].map(lambda x: factors_dict[x].id)
        
        # Convert to list of dicts for bulk_create
        measurements = [
            FactorMeasurement(
                geographic_level=row['geo_level'],
                state=row['State'],
                statefp=row['StateFIPS'],
                county=row['County'],
                countyfp=row['CountyFIPS'],
                factor_id=row['factor_id'],
                start_year=int(row['Start Year']),
                end_year=int(row['End Year']),
                factor_value=float(row['Value']),
                gender=gender_all, # default to 'All'
                race=race_all # default to 'ALL'
            )
            for _, row in df.iterrows()
        ]
        
        # Bulk insert
        FactorMeasurement.objects.bulk_create(measurements, batch_size=10000)

    def load_cancer_incidence(self):
        """Load cancer incidence data into database"""
        cancer_path = os.path.join(settings.BASE_DIR, 'CDC Data/cancer_incidence.csv')
        df = pd.read_csv(cancer_path)
        
        self.stdout.write(f"Loading {len(df)} cancer incidence records...")
        
        # Pre-create all lookup objects
        cancer_types_dict = {}
        for cancer_name in df['Cancer Type'].unique():
            cancer_type, _ = CancerType.objects.get_or_create(name=cancer_name)
            cancer_types_dict[cancer_name] = cancer_type
        
        genders_dict = {}
        for gender_name in df['Sex'].unique():
            gender, _ = Gender.objects.get_or_create(name=gender_name)
            genders_dict[gender_name] = gender
        
        races_dict = {}
        for race_name in df['Race Ethnicity'].unique():
            race, _ = Race.objects.get_or_create(name=race_name)
            races_dict[race_name] = race
        
        # Build list of objects to bulk create
        incidences = []
        for idx, row in df.iterrows():
            if idx % 10000 == 0:
                self.stdout.write(f"  Prepared {idx} records...")
            
            geo_level = GeographicLevel.STATE if row['County'] == 'All' else GeographicLevel.COUNTY
            statefp = row['StateFIPS']
            countyfp = row['CountyFIPS']
            
            incidences.append(CancerIncidence(
                geographic_level=geo_level,
                state=row['State'],
                statefp=statefp,
                county=row['County'],
                countyfp=countyfp,
                cancer_type=cancer_types_dict[row['Cancer Type']],
                gender=genders_dict[row['Sex']],
                race=races_dict[row['Race Ethnicity']],
                start_year=int(row['Start Year']),
                end_year=int(row['End Year']),
                incidence_rate=float(row['Incidence'])
            ))
        
        # Bulk create in batches
        with transaction.atomic():
            CancerIncidence.objects.bulk_create(incidences, batch_size=10000)
        
        self.stdout.write(self.style.SUCCESS(f"Loaded {len(incidences)} cancer incidence records"))

    def pre_process_data(self):
        """Moves all data into 2 tables and standardizes columns"""
        dfs = []
        for file in self.factor_files:
            file = os.path.join(settings.BASE_DIR, file)    
            df = pd.read_csv(file)
            df = self._standardize_factor_df(df=df, file=file)
            dfs.append(df)
        
        merged_df = pd.concat(dfs, ignore_index=True)

        # Calculate missing state averages from county data
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

        merged_df.to_csv(os.path.join(settings.BASE_DIR, 'CDC Data/factors.csv'), index=False)

        
        dfs = []
        for file in self.cancer_incidence_files:
            file = os.path.join(settings.BASE_DIR, file)
            df = pd.read_csv(file)
            df = self._standardize_cancer_df(df=df)
            dfs.append(df)
        
        merged_df = pd.concat(dfs, ignore_index=True)
        merged_df.to_csv(os.path.join(settings.BASE_DIR, 'CDC Data/cancer_incidence.csv'), index=False)
                

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
        df['Sex'] = df['Sex'].str.strip().str.title()
        df['Race Ethnicity'] = df['Race Ethnicity'].str.strip().str.upper()
        df['Cancer Type'] = df['Cancer Type'].str.strip().str.title()
        
        # Duplicate Breast (All -> Female) and Prostate (All -> Male) data
        breast_all = df[(df['Cancer Type'] == 'Breast') & (df['Sex'] == 'All')].copy()
        breast_all['Sex'] = 'Female'
        
        prostate_all = df[(df['Cancer Type'] == 'Prostate') & (df['Sex'] == 'All')].copy()
        prostate_all['Sex'] = 'Male'
        
        df = pd.concat([df, breast_all, prostate_all], ignore_index=True)

        df['County'] = df['County'].str.strip()
        df['State'] = df['State'].str.strip()
        df['StateFIPS'] = df['StateFIPS'].apply(lambda x: int(x))
        df['CountyFIPS'] = df['CountyFIPS'].apply(lambda x: int(x))
        
        return df


    def clear_existing_data(self):
        """Clear all existing data from the database"""
        self.stdout.write('Clearing existing data...')
        
        with transaction.atomic():
            CancerIncidence.objects.all().delete()
            self.stdout.write('  Deleted CancerIncidence records')
            
            Race.objects.all().delete()
            self.stdout.write('  Deleted Race records')
            
            Gender.objects.all().delete()
            self.stdout.write('  Deleted Gender records')
            
            Factor.objects.all().delete()
            self.stdout.write('  Deleted EnvironmentalFactor records')
            
            CancerType.objects.all().delete()
            self.stdout.write('  Deleted CancerType records')
        
        self.stdout.write(self.style.SUCCESS('Successfully cleared all data'))
