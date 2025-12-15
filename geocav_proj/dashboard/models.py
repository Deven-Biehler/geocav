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
    name = models.CharField(max_length=50, unique=True)
    
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

class TotalRecordAgg(models.Model):
    cancer = models.ForeignKey(CancerType, on_delete=models.CASCADE)

    Tumor_Sample_Barcode = models.CharField(max_length=64)

    # List fields stored as JSON
    Hugo_Symbol = models.JSONField(default=list)
    HGVSc = models.JSONField(default=list)
    Variant_Classification = models.JSONField(default=list)

    # Scalars
    TSS = models.CharField(max_length=16, blank=True)
    bcr_patient_barcode = models.CharField(max_length=64, blank=True)
    Source_Site = models.CharField(max_length=128, blank=True)
    Study_Name = models.CharField(max_length=128, blank=True)

    ajcc_pathologic_stage = models.CharField(max_length=64, blank=True)
    age_at_diagnosis = models.IntegerField(null=True, blank=True)
    year_of_diagnosis = models.IntegerField(null=True, blank=True)
    race = models.CharField(max_length=64, blank=True)
    gender = models.CharField(max_length=32, blank=True)
    ethnicity = models.CharField(max_length=64, blank=True)
    vital_status = models.CharField(max_length=32, blank=True)
    treatments_pharmaceutical_treatment_or_therapy = models.CharField(max_length=128, blank=True)
    treatments_radiation_treatment_or_therapy = models.CharField(max_length=128, blank=True)

    def __str__(self):
        return f"{self.cancer.name} - {self.Tumor_Sample_Barcode}"