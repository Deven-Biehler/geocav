from django.db import models

class CancerType(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    
    def __str__(self):
        return self.name

class EnvironmentalFactor(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    
    def __str__(self):
        return self.name

class Gender(models.Model):
    name = models.CharField(max_length=50, unique=True)  # e.g., 'Male', 'Female', 'All'
    
    def __str__(self):
        return self.name

class Race(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    
    def __str__(self):
        return self.name

class GeographicLevel(models.TextChoices):
    STATE = 'State'
    COUNTY = 'County'

class CancerIncidence(models.Model):
    # Geography
    geographic_level = models.CharField(
        max_length=10, 
        choices=GeographicLevel.choices
    )
    state = models.CharField(max_length=100)  # State name or FIPS code
    county = models.CharField(max_length=100, blank=True, null=True)  # Only for county-level
    
    # What we're measuring
    cancer_type = models.ForeignKey(CancerType, on_delete=models.CASCADE)
    environmental_factor = models.ForeignKey(EnvironmentalFactor, on_delete=models.CASCADE)
    
    # Demographics
    gender = models.ForeignKey(Gender, on_delete=models.CASCADE)
    race = models.ForeignKey(Race, on_delete=models.CASCADE)
    
    # Data
    incidence_rate = models.FloatField()  # per 100,000 population
    factor_value = models.FloatField()  # value of environmental factor
    year_range = models.CharField(max_length=20)  # e.g., "2010-2014", "2015-2019"
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        indexes = [
            models.Index(fields=['cancer_type', 'environmental_factor', 'gender', 'race']),
            models.Index(fields=['geographic_level', 'state']),
            models.Index(fields=['year_range']),
        ]
        unique_together = [
            ['geographic_level', 'state', 'county', 'cancer_type', 
             'environmental_factor', 'gender', 'race', 'year_range']
        ]
    
    def __str__(self):
        location = f"{self.county}, {self.state}" if self.county else self.state
        return f"{self.cancer_type} vs {self.environmental_factor} - {location} ({self.gender}, {self.race})"