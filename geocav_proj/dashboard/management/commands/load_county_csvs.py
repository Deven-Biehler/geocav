import csv
import os
from django.core.management.base import BaseCommand
from dashboard.models import CountyData

class Command(BaseCommand):
    def handle(self, *args, **options):
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))
        data_dir = os.path.join(project_root, 'data')
   
        files = [
            'eso_factors.csv',
            'kidney_factors.csv', 
            'liver_factors.csv',
            'lung_factors.csv',
            'pancreatic_factors.csv',
            'prostate_factors.csv',
            'skin_factors.csv'
        ]

        # First, delete all existing data
        CountyData.objects.all().delete()
        # Dictionary to store county data
        counties_data = {}  # Format: {(state, county): {cancer_type: rate}}
        
        for file_name in files:
            file_path = os.path.join(data_dir, file_name)
            with open(file_path, 'r') as f:
                reader = csv.DictReader(f)
                cancer_type = file_name.split('_')[0]
                
                for row in reader:
                    state = row['State']
                    county = row['County']
                    key = (state, county)
                    counties_data.setdefault(key, {})[f'{cancer_type}_rate'] = float(row['Value'])
                    
                    # Add factor data if present
                    for factor in ['drinking', 'obesity', 'diabetes', 'heart_disease', 'poverty', 'noHealthIns', 'smoking']:
                        if factor in row and row[factor]:
                            counties_data[key][factor] = float(row[factor])

        # Create CountyData objects from collected data
        for (state, county), data in counties_data.items():
            # Calculate average cancer rate
            if data.get('cancer_rate', 0) == 0:
                rates = [
                    data.get('eso_rate', 0),
                    data.get('kidney_rate', 0),
                    data.get('liver_rate', 0),
                    data.get('lung_rate', 0),
                    data.get('pancreatic_rate', 0),
                    data.get('prostate_rate', 0),
                    data.get('skin_rate', 0)
                ]
                valid_rates = [r for r in rates if r > 0]
                data['cancer_rate'] = sum(valid_rates) / len(valid_rates) if valid_rates else 0
            
            # Create the CountyData object
            CountyData.objects.create(
                state=state,
                county=county,
                cancer_rate=data.get('cancer_rate', 0),
                eso_rate=data.get('eso_rate', None),
                kidney_rate=data.get('kidney_rate', None),
                liver_rate=data.get('liver_rate', None),
                lung_rate=data.get('lung_rate', None),
                pancreatic_rate=data.get('pancreatic_rate', None),
                prostate_rate=data.get('prostate_rate', None),
                skin_rate=data.get('skin_rate', None),
                # Add factor fields
                drinking=data.get('drinking', None),
                obesity=data.get('obesity', None),
                diabetes=data.get('diabetes', None),
                heart_disease=data.get('heart_disease', None),
                poverty=data.get('poverty', None),
                noHealthIns=data.get('noHealthIns', None),
                smoking=data.get('smoking', None),
            )
