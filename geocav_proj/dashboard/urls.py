from django.urls import path
from . import views

urlpatterns = [
    path('', views.dashboard_view, name='dashboard_view'),
    # path('choropleth', views.choropleth, name='choropleth'),
    # path('pie', views.pie, name='pie'),
    # path('dotDensity', views.dotDensity, name='dotDensity'),
    # path('dashboard/regression-data', views.regression_data, name='regression_data'),
    path('get_data', views.get_data, name='get_data'),
    path('get_geojson', views.get_geojson, name='get_geojson'),
    path('get_pie_data', views.get_pie_data, name='get_pie_data'),
]
