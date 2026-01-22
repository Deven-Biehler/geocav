import csv
from django.core.management.base import BaseCommand
from dashboard.models import Factor

class Command(BaseCommand):
    help = 'Exports the Factor data to a CSV file'

    def handle(self, *args, **options):
        self.stdout.write('Exporting Factor data...')
        
        with open('factors_exported.csv', 'w', newline='') as csvfile:
            fieldnames = [field.name for field in Factor._meta.fields]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

            writer.writeheader()
            for factor in Factor.objects.all():
                writer.writerow({field: getattr(factor, field) for field in fieldnames})

        self.stdout.write(self.style.SUCCESS('Successfully exported Factor data to factors_exported.csv'))
