import csv
import os
from django.core.management.base import BaseCommand
from dashboard.models import StateData

class Command(BaseCommand):
   help = 'Loads state data from CSV files'
   
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
        StateData.objects.all().delete()

        # Dictionary to store state data
        states_data = {}  # Format: {state: {cancer_type: rate}}
        
        # Load data from all CSV files
        for file_name in files:
            file_path = os.path.join(data_dir, file_name)
           
            with open(file_path, 'r') as f:
                reader = csv.DictReader(f)
                cancer_type = file_name.split('_')[0]  # Extract cancer type from filename
                
                for row in reader:
                    state = row['State']
                    rate = float(row['Value'])
                    
                    # Create or update state entry
                    key = (state, None)
                    if key not in states_data:
                        states_data[key] = {'cancer_rate': 0}
                    
                    # Add cancer type rate
                    states_data[key][f'{cancer_type}_rate'] = rate
                    
                    # Add factor data if available
                    for factor in ['drinking', 'obesity', 'diabetes', 'heart_disease', 'poverty', 'noHealthIns', 'smoking']:
                        if factor in row and row[factor]:
                            try:
                                states_data[key][factor] = float(row[factor])
                            except (ValueError, TypeError):
                                # Skip invalid values
                                pass
       
        # Create StateData objects from collected data
        for (state, county), data in states_data.items():
            # Calculate average cancer rate if not already set
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

            # Create the StateData object
            StateData.objects.create(
                state=state,
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
