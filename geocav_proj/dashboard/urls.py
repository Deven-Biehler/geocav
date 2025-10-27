from django.urls import path
from . import views

urlpatterns = [
    path('', views.dashboard_view, name='dashboard_view'), # Renders the main dashboard page
    path('get_data', views.get_data, name='get_data'), # Gets the data for the choropleth, heat map, and regression plot
    path('get_geojson', views.get_geojson, name='get_geojson'), # Gets the GeoJSON data for state and county boundaries
    path('get_pie_data', views.get_pie_data, name='get_pie_data'), # Gets the data for the pie chart
]
