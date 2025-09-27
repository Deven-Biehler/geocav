import os
import json
import pandas as pd
from django.core.management.base import BaseCommand
from django.db import transaction
from ...models import (
    CancerType,
    EnvironmentalFactor,
    Gender,
    Race,
    CancerIncidence,
)

class Command(BaseCommand):
    def __init__(self):
        super().__init__()
        data_config_path = os.path.join(
            os.path.dirname(__file__), '..', '..', 'data_config.json'
        )
        with open(data_config_path, 'r') as f:
            self.data_config = json.load(f)
        
        self.cancer_types = {ct.name: ct for ct in CancerType.objects.all()}
        self.environmental_factors = {ef.name: ef for ef in EnvironmentalFactor.objects.all()}
        self.genders = {g.name: g for g in Gender.objects.all()}
        self.races = {r.name: r for r in Race.objects.all()}
        
        self.data_dir = self.data_config.get('data_directory', 'CDC Data')

        self.factor_lookup = self.load_all_factors()
   
    def handle(self, *args, **options):
        with transaction.atomic():
            self.load_data()
            
        self.stdout.write(self.style.SUCCESS('Successfully loaded all data'))

    def load_all_factors(self):
        """Load all environmental factor data into a lookup dictionary"""
        factor_lookup = {}
        
        for geo_level in ['county', 'state']:
            for factor_config in self.data_config['environmental_factors'][geo_level]:
                filepath = os.path.join(self.data_dir, factor_config['filepath'])
                
                if not os.path.exists(filepath):
                    self.stdout.write(self.style.WARNING(f"Factor file not found: {filepath}"))
                    continue
                
                self.stdout.write(f"Loading factor: {factor_config['name']}")
                df = pd.read_csv(filepath)
                
                # Create lookup key for each row: (geo_level, state, county, year_range) -> value
                for _, row in df.iterrows():
                    if geo_level == 'county':
                        key = (geo_level, row['state'], row.get('county', ''), row['year_range'])
                    else:
                        key = (geo_level, row['state'], '', row['year_range'])
                    
                    # Store as: key -> {factor_name: value}
                    if key not in factor_lookup:
                        factor_lookup[key] = {}
                    
                    factor_lookup[key][factor_config['name']] = float(row.get('value', 0))
        
        return factor_lookup
    
    def load_data(self):
        records_to_create = []
        
        for geo_level in ['county', 'state']:
            cancer_files = self.data_config['cancer_incidence_files'][geo_level]
            
            for file_type, filepath in cancer_files.items():
                df = self._load_cancer_file(filepath)
                if df is None:
                    continue
                
                for _, row in df.iterrows():
                    records = self._process_cancer_row(row, file_type, geo_level)
                    records_to_create.extend(records)
                    
                    if len(records_to_create) >= 1000:
                        self._bulk_create_records(records_to_create)
                        records_to_create = []
        
        self._bulk_create_records(records_to_create)

    def _load_cancer_file(self, filepath):
        """Load a single cancer CSV file"""
        full_path = os.path.join(self.data_dir, filepath)
        
        if not os.path.exists(full_path):
            self.stdout.write(self.style.WARNING(f"Cancer file not found: {full_path}"))
            return None
        
        return pd.read_csv(full_path)

    def _process_cancer_row(self, row, file_type, geo_level):
        cancer_type = self.cancer_types.get(row['cancer_type'])
        if not cancer_type:
            self.stdout.write(self.style.WARNING(f"Unknown cancer type: {row['cancer_type']}"))
            return []
        
        gender, race = self._get_demographics(row, file_type)
        year_range = self._get_year_range(row)
        
        if not year_range:
            return []
        
        return self._create_records_for_factors(row, cancer_type, gender, race, year_range, geo_level)

    def _get_demographics(self, row, file_type):
        if file_type == 'gender':
            return (
                self.genders.get(row.get('gender'), self.genders['All']),
                self.races['All']
            )
        elif file_type == 'race':
            return (
                self.genders['All'],
                self.races.get(row.get('race'), self.races['All'])
            )
        else:
            return (self.genders['All'], self.races['All'])

    def _get_year_range(self, row):
        if 'year_range' in row and pd.notna(row['year_range']):
            return row['year_range']
        elif 'year' in row and pd.notna(row['year']):
            return f"{row['year']}-{row['year']}"
        else:
            self.stdout.write(self.style.WARNING("No year information for row"))
            return None

    def _create_records_for_factors(self, row, cancer_type, gender, race, year_range, geo_level):
        records = []
        
        for factor_config in self.data_config['environmental_factors'][geo_level]:
            factor = self.environmental_factors.get(factor_config['name'])
            if not factor:
                continue
            
            lookup_key = self._create_lookup_key(row, geo_level, year_range)
            factor_value = self.factor_lookup.get(lookup_key, {}).get(factor_config['name'], 0.0)
            
            record = CancerIncidence(
                geographic_level='County' if geo_level == 'county' else 'State',
                state=row['state'],
                county=row.get('county') if geo_level == 'county' else None,
                cancer_type=cancer_type,
                environmental_factor=factor,
                gender=gender,
                race=race,
                incidence_rate=float(row['incidence_rate']),
                factor_value=factor_value,
                year_range=year_range
            )
            records.append(record)
        
        return records

    def _create_lookup_key(self, row, geo_level, year_range):
        if geo_level == 'county':
            return (geo_level, row['state'], row.get('county', ''), year_range)
        else:
            return (geo_level, row['state'], '', year_range)

    def _bulk_create_records(self, records):
        if records:
            CancerIncidence.objects.bulk_create(records, ignore_conflicts=True)