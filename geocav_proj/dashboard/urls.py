from django.urls import path
from . import views

urlpatterns = [
    path('', views.dashboard_view, name='dashboard_view'),
    path('choropleth', views.choropleth, name='choropleth'),
    path('pie', views.pie, name='pie'),
    path('dotDensity', views.dotDensity, name='dotDensity'),
    path('dashboard/regression-data', views.regression_data, name='regression_data'),
]
