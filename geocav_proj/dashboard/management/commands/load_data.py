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
        # self.clear_existing_data()
        self.load_factors()
        self.load_cancer_incidence()

    def load_factors(self):
        """Load environmental factor data into database"""
        factors_path = os.path.join(settings.BASE_DIR, 'data/factors.csv')
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
        cancer_path = os.path.join(settings.BASE_DIR, 'data/cancer_incidence.csv')
        df = pd.read_csv(cancer_path)
        
        self.stdout.write(f"Loading {len(df)} cancer incidence records...")
        
        # Pre-create all lookup objects
        cancer_types_dict = {}
        for cancer_name in df['Cancer Type'].unique():
            cancer_type, _ = CancerType.objects.get_or_create(name=cancer_name)
            cancer_types_dict[cancer_name] = cancer_type
        
        genders_dict = {name: Gender.objects.get_or_create(name=name)[0] 
                        for name in df['Sex'].unique()}
        gender_all, _ = Gender.objects.get_or_create(name='All')
        genders_dict['All'] = gender_all
        
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
