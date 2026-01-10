from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('geospatial/', views.dashboard_view, name='dashboard_view'),
    #path('geospatial/', views.geospatial_dashboard, name='geospatial_dashboard'),
    path('network/', views.network_analysis, name='network_analysis'),
    path('api/network/<slug:cancer>.json', views.network_json_by_slug, name='network_json_by_slug'),
    # Molecular analysis pages
    path("molecular/", views.molecular_landscape, name="molecular_landscape"),  # default
    path("molecular/cooccurrence/", views.molecular_cooccurrence, name="molecular_cooccurrence"),
    path("molecular/clinical/", views.molecular_clinical, name="molecular_clinical"),
    path("molecular/demographics/", views.molecular_demographics, name="molecular_demographics"),
    # path('choropleth', views.choropleth, name='choropleth'),
    # path('pie', views.pie, name='pie'),
    # path('dotDensity', views.dotDensity, name='dotDensity'),
    # path('dashboard/regression-data', views.regression_data, name='regression_data'),
    path('get_data', views.get_data, name='get_data'),
    path('get_geojson', views.get_geojson, name='get_geojson'),
    path('get_pie_data', views.get_pie_data, name='get_pie_data'),
    path('get_pca', views.get_pca_view, name='get_pca_view'),

    # API for mutational landscape
    path(
        "api/molecular/<str:cancer_name>/landscape.json",
        views.molecular_landscape_json,
        name="molecular_landscape_json"
    ),
    path(
        "api/molecular/<str:cancer_name>/cooccurrence.json",
        views.molecular_cooccurrence_json,
        name="molecular_cooccurrence_json"
    ),

    # clinical associations
    path(
        "molecular/clinical/",
        views.molecular_clinical,
        name="molecular_clinical",
    ),

    path(
        "api/molecular/<str:cancer_name>/clinical.json",
        views.molecular_clinical_json,
        name="molecular_clinical_json",
    ),

    # demographic associations
    path(
        "molecular/demographics/",
        views.molecular_demographics,
        name="molecular_demographics",
    ),
    path(
        "api/molecular/<str:cancer_name>/demographics.json",
        views.molecular_demographics_json,
        name="molecular_demographics_json",
    ),
]
