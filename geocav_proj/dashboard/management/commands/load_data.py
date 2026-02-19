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

    
    def handle(self, *args, **options):
        self.load_data()
        self.stdout.write(self.style.SUCCESS('Successfully loaded all data'))

    def load_data(self):
        self.clear_existing_data()
        self.load_factors()
        self.load_cancer_incidence()

    def load_factors(self):
        self.factor_folder = os.path.join(settings.BASE_DIR, 'data', 'Factors')
        
        # Ensure default Gender and Race exist
        all_gender, _ = Gender.objects.get_or_create(name='All')
        all_race, _ = Race.objects.get_or_create(name='All')

        # Load county-level factors
        # Assumes files are named like "County_Level/FactorName.csv" with columns: StateFIPS,State,CountyFIPS,County,Value,Start Year,End Year
        county_factors_folder = os.path.join(self.factor_folder, 'County_Level')
        for filename in os.listdir(county_factors_folder):
            if filename.endswith('.csv'):
                filepath = os.path.join(county_factors_folder, filename)
                self.stdout.write(f'Loading factors from {filepath}...')
                df = pd.read_csv(filepath)
                for _, row in df.iterrows():
                    factor_name = filename.replace('.csv', '')
                    value = row['Value']
                    county = row['County']
                    state = row['State']
                    start_year = row['Start Year']
                    end_year = row['End Year']
                    # Get or create the Factor
                    factor, _ = Factor.objects.get_or_create(name=factor_name)
                    
                    # Create the FactorMeasurement
                    FactorMeasurement.objects.create(
                        factor=factor,
                        geographic_level=GeographicLevel.COUNTY,
                        state=state,
                        county=county,
                        statefp=row['StateFIPS'],
                        countyfp=row['CountyFIPS'],
                        factor_value=value,
                        start_year=start_year,
                        end_year=end_year,
                        gender=all_gender,
                        race=all_race
                    )
        
        # Load state-level factors
        # Assumes files are named like "State_Level/FactorName.csv" with columns: StateFIPS,State,Year,Value
        state_factors_folder = os.path.join(self.factor_folder, 'State_Level')
        for filename in os.listdir(state_factors_folder):
            if filename.endswith('.csv'):
                filepath = os.path.join(state_factors_folder, filename)
                self.stdout.write(f'Loading factors from {filepath}...')
                df = pd.read_csv(filepath)
                for _, row in df.iterrows():
                    factor_name = filename.replace('.csv', '')
                    value = row['Value']
                    state = row['State']
                    year = row['Year']
                    # Get or create the Factor
                    factor, _ = Factor.objects.get_or_create(name=factor_name)
                    
                    # Create the FactorMeasurement
                    FactorMeasurement.objects.create(
                        factor=factor,
                        geographic_level=GeographicLevel.STATE,
                        state=state,
                        statefp=row['StateFIPS'],
                        factor_value=value,
                        start_year=year,
                        end_year=year,
                        gender=all_gender,
                        race=all_race
                    )
        

    def load_cancer_incidence(self):
        # Load county cancer incidence data
        # Assumes file is 
        # named "CancerIncidence.csv" in folder "geocav_proj/data/Cancer/county_level/county" with columns: StateFIPS,State,CountyFIPS,County,Start Year,End Year,Value
        # or named "CancerIncidence.csv" in folder "geocav_proj/data/Cancer/county_level/county_gender" with columns: StateFIPS,State,CountyFIPS,County,Start Year,End Year,Sex,Value
        # or named "CancerIncidence.csv" in folder "geocav_proj/data/Cancer/county_level/county_race" with columns: StateFIPS,State,CountyFIPS,County,Start Year,End Year,Race Ethnicity,Value
        cancer_incidence_folder = os.path.join(settings.BASE_DIR, 'data', 'Cancer', 'county_level')
        for subfolder in ['county', 'county_gender', 'county_race']:
            folder_path = os.path.join(cancer_incidence_folder, subfolder)
            for filename in os.listdir(folder_path):
                if filename.endswith('.csv'):
                    filepath = os.path.join(folder_path, filename)
                    self.stdout.write(f'Loading cancer incidence data from {filepath}...')
                    df = pd.read_csv(filepath)
                    for _, row in df.iterrows():
                        state = row['State']
                        county = row['County']
                        start_year = row['Start Year']
                        end_year = row['End Year']
                        value = row['Value']
                        # Get or create the CancerType
                        cancer_type_name = filename.replace('.csv', '')
                        cancer_type, _ = CancerType.objects.get_or_create(name=cancer_type_name)
                        
                        # Get or create the Race and Gender if applicable
                        if subfolder == 'county_gender':
                            gender_obj = Gender.objects.get_or_create(name=row['Sex'])[0]
                        else:
                            gender_obj = Gender.objects.get_or_create(name='All')[0]
                        if subfolder == 'county_race':
                            race_obj = Race.objects.get_or_create(name=row['Race Ethnicity'])[0]
                        else:
                            race_obj = Race.objects.get_or_create(name='All')[0]
                        
                        # Create the CancerIncidence record
                        CancerIncidence.objects.create(
                            cancer_type=cancer_type,
                            geographic_level=GeographicLevel.COUNTY,
                            state=state,
                            county=county,
                            statefp=row['StateFIPS'],
                            countyfp=row['CountyFIPS'],
                            gender=gender_obj,
                            race=race_obj,
                            incidence_rate=value,
                            start_year=start_year,
                            end_year=end_year
                        )

        # Load state cancer incidence data
        # Assumes file is named "CancerIncidence.csv" in folder "geocav_proj/data/Cancer/state_level" with columns: StateFIPS,State,Year,Value
        # or named "CancerIncidence.csv" in folder "geocav_proj/data/Cancer/state_level/state_gender" with columns: StateFIPS,State,Year,Sex,Value
        # or named "CancerIncidence.csv" in folder "geocav_proj/data/Cancer/state_level/state_race" with columns: StateFIPS,State,Year,Race Ethnicity,Value
        state_cancer_incidence_folder = os.path.join(settings.BASE_DIR, 'data', 'Cancer', 'state_level')
        if os.path.exists(state_cancer_incidence_folder):
            for subfolder in ['state', 'state_gender', 'state_race']:
                folder_path = os.path.join(state_cancer_incidence_folder, subfolder)
                if not os.path.exists(folder_path): continue
                
                for filename in os.listdir(folder_path):
                    if filename.endswith('.csv'):
                        filepath = os.path.join(folder_path, filename)
                        self.stdout.write(f'Loading cancer incidence data from {filepath}...')
                        df = pd.read_csv(filepath)
                        for _, row in df.iterrows():
                            state = row['State']
                            year = row['Year']
                            value = row['Value']
                            # Get or create the CancerType
                            cancer_type_name = filename.replace('.csv', '')
                            cancer_type, _ = CancerType.objects.get_or_create(name=cancer_type_name)
                            
                            # Get or create the Race and Gender if applicable
                            if subfolder == 'state_gender':
                                gender_obj = Gender.objects.get_or_create(name=row['Sex'])[0]
                            else:
                                gender_obj = Gender.objects.get_or_create(name='All')[0]
                            if subfolder == 'state_race':
                                race_obj = Race.objects.get_or_create(name=row['Race Ethnicity'])[0]
                            else:
                                race_obj = Race.objects.get_or_create(name='All')[0]
                            
                            # Create the CancerIncidence record
                            CancerIncidence.objects.create(
                                cancer_type=cancer_type,
                                geographic_level=GeographicLevel.STATE,
                                state=state,
                                statefp=row['StateFIPS'],
                                gender=gender_obj,
                                race=race_obj,
                                incidence_rate=value,
                                start_year=year,
                                end_year=year,
                            )


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
