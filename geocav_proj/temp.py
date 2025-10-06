import pandas as pd
import os
from django.conf import settings

# Check one of your ORIGINAL cancer incidence files (before preprocessing)
original_file = 'geocav_proj/CDC Data/Cancer_Incidence_Age_Adjusted_by_County_5_Year.csv'  # Adjust filename
df = pd.read_csv(original_file)
print(df[['State', 'County', 'StateFIPS', 'CountyFIPS']].head(20))