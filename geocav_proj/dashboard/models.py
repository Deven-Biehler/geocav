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
    bcr_patient_barcode = models.CharField(max_length=64, blank=True, null=True)
    case_id = models.CharField(max_length=64, blank=True, null=True)
    patient_id = models.CharField(max_length=64, blank=True, null=True)
    bcr_patient_uuid = models.CharField(max_length=64, blank=True, null=True)
    project = models.CharField(max_length=32, blank=True, null=True)

    # List fields stored as JSON ------
    Hugo_Symbol = models.JSONField(default=list)
    Entrez_Gene_Id = models.JSONField(default=list)

    Chromosome = models.JSONField(default=list)
    Start_Position = models.JSONField(default=list)
    End_Position = models.JSONField(default=list)

    Reference_Allele = models.JSONField(default=list)
    Tumor_Seq_Allele2 = models.JSONField(default=list)

    Variant_Classification = models.JSONField(default=list)
    Variant_Type = models.JSONField(default=list)

    HGVSc = models.JSONField(default=list)
    HGVSp_Short = models.JSONField(default=list)

    Transcript_ID = models.JSONField(default=list)
    Exon_Number = models.JSONField(default=list)

    Protein_position = models.JSONField(default=list)
    Amino_acids = models.JSONField(default=list)
    Codons = models.JSONField(default=list)

    IMPACT = models.JSONField(default=list)
    SIFT = models.JSONField(default=list)
    PolyPhen = models.JSONField(default=list)

    COSMIC = models.JSONField(default=list)
    hotspot = models.JSONField(default=list)

    t_depth = models.JSONField(default=list)
    t_alt_count = models.JSONField(default=list)

    # Scalars -------
    TSS = models.CharField(max_length=16, blank=True, null=True)
    Source_Site = models.CharField(max_length=128, blank=True, null=True)
    Study_Name = models.CharField(max_length=128, blank=True, null=True)

    tumor_tissue_site = models.CharField(max_length=128, blank=True, null=True)
    tissue_source_site = models.CharField(max_length=128, blank=True, null=True)
    histological_type = models.CharField(max_length=256, blank=True, null=True)

    icd_o_3_site = models.CharField(max_length=64, blank=True, null=True)
    icd_o_3_histology = models.CharField(max_length=64, blank=True, null=True)
    icd_10 = models.CharField(max_length=32, blank=True, null=True)

    # Demographics
    race = models.CharField(max_length=64, blank=True, null=True)
    gender = models.CharField(max_length=32, blank=True, null=True)
    ethnicity = models.CharField(max_length=64, blank=True, null=True)

    # Diagnosis timing
    age_at_diagnosis = models.IntegerField(null=True, blank=True)
    year_of_diagnosis = models.IntegerField(null=True, blank=True)

    # Stage
    ajcc_pathologic_stage = models.CharField(max_length=64, blank=True, null=True)
    stage_event_system_version = models.CharField(max_length=64, blank=True, null=True)
    stage_event_clinical_stage = models.CharField(max_length=64, blank=True, null=True)
    stage_event_tnm_categories = models.CharField(max_length=128, blank=True, null=True)

    # Outcomes
    vital_status = models.CharField(max_length=32, blank=True, null=True)
    days_to_death = models.IntegerField(null=True, blank=True)
    days_to_last_followup = models.IntegerField(null=True, blank=True)
    person_neoplasm_cancer_status = models.CharField(max_length=64, blank=True, null=True)

    # Treatments
    treatments_pharmaceutical_treatment_or_therapy = models.CharField(max_length=128, blank=True, null=True)
    treatments_radiation_treatment_or_therapy = models.CharField(max_length=128, blank=True, null=True)

    history_of_neoadjuvant_treatment = models.CharField(max_length=64, blank=True, null=True)
    primary_therapy_outcome_success = models.CharField(max_length=128, blank=True, null=True)

    def __str__(self):
        return f"{self.cancer.name} - {self.Tumor_Sample_Barcode}"

class NetworkNodeMeta(models.Model):
    cancer = models.ForeignKey(CancerType, on_delete=models.CASCADE)
    node_index = models.IntegerField()  # 0..N-1 from GML

    Tumor_Sample_Barcode = models.CharField(max_length=64, blank=True)

    age_at_initial_pathologic_diagnosis = models.IntegerField(null=True, blank=True)
    gender = models.CharField(max_length=32, blank=True)
    vital_status = models.CharField(max_length=32, blank=True)
    race_list = models.CharField(max_length=128, blank=True)
    ethnicity = models.CharField(max_length=128, blank=True)

    # optional useful ones
    n_events = models.IntegerField(null=True, blank=True)
    n_genes = models.IntegerField(null=True, blank=True)
    # List fields stored as JSON 
    event_ids = models.JSONField(default=list, blank=True)
    genes = models.JSONField(default=list, blank=True)

    class Meta:
        unique_together = (("cancer", "node_index"),)