from django.db import models

class CancerType(models.Model):
    name = models.CharField(max_length=100, unique=True)
    
    def __str__(self):
        return self.name

class Factor(models.Model):
    name = models.CharField(max_length=100, unique=True)
    
    def __str__(self):
        return self.name

class Gender(models.Model):
    name = models.CharField(max_length=50, unique=True)  # e.g., 'Male', 'Female', 'All'
    
    def __str__(self):
        return self.name

class Race(models.Model):
    name = models.CharField(max_length=100, unique=True)
    
    def __str__(self):
        return self.name

class GeographicLevel(models.TextChoices):
    STATE = 'State'
    COUNTY = 'County'

class CancerIncidence(models.Model):
    geographic_level = models.CharField(max_length=10, choices=GeographicLevel.choices)
    state = models.CharField(max_length=100)
    statefp = models.CharField(max_length=2, blank=True, null=True)
    county = models.CharField(max_length=100, blank=True, null=True)
    countyfp = models.CharField(max_length=5, blank=True, null=True)
    cancer_type = models.ForeignKey(CancerType, on_delete=models.CASCADE)
    gender = models.ForeignKey(Gender, on_delete=models.CASCADE)
    race = models.ForeignKey(Race, on_delete=models.CASCADE)
    incidence_rate = models.FloatField(null=True, blank=True)
    start_year = models.IntegerField()
    end_year = models.IntegerField()

class FactorMeasurement(models.Model):
    geographic_level = models.CharField(max_length=10, choices=GeographicLevel.choices)
    state = models.CharField(max_length=100)
    statefp = models.CharField(max_length=2, blank=True, null=True)
    county = models.CharField(max_length=100, blank=True, null=True)
    countyfp = models.CharField(max_length=5, blank=True, null=True)
    factor = models.ForeignKey(Factor, on_delete=models.CASCADE)
    factor_value = models.FloatField(null=True, blank=True)
    gender = models.ForeignKey(Gender, on_delete=models.CASCADE)
    race = models.ForeignKey(Race, on_delete=models.CASCADE)
    start_year = models.IntegerField()
    end_year = models.IntegerField()