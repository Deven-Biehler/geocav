from django.contrib import admin
from .models import CancerType, Factor, FactorMeasurement, Gender, Race, CancerIncidence

@admin.register(CancerType)
class CancerTypeAdmin(admin.ModelAdmin):
    list_display = ['name']
    search_fields = ['name']

@admin.register(Factor)
class FactorAdmin(admin.ModelAdmin):
    list_display = ['name']
    search_fields = ['name']

@admin.register(Gender)
class GenderAdmin(admin.ModelAdmin):
    list_display = ['name']

@admin.register(Race)
class RaceAdmin(admin.ModelAdmin):
    list_display = ['name']
    search_fields = ['name']

@admin.register(CancerIncidence)
class CancerIncidenceAdmin(admin.ModelAdmin):
    list_display = ['geographic_level', 'state', 'statefp', 'county', 'countyfp', 'cancer_type', 'gender', 'race', 'incidence_rate', 'start_year', 'end_year']

@admin.register(FactorMeasurement)
class FactorMeasurementAdmin(admin.ModelAdmin):
    list_display = ['geographic_level', 'state', 'statefp', 'county', 'countyfp', 'factor', 'gender', 'race', 'factor_value', 'start_year', 'end_year']