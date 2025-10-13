export const DEFAULT_LEAFLET_CONFIG = {
    DEFAULT_CENTER: [39.8283, -98.5795],
    DEFAULT_ZOOM: 4,
    TILE_LAYER: {
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        options: {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }
    }
};


// CHOROPLETH MAP CONFIGURATION
export const DEFAULT_CHOROPLETH_STYLE = {
    fillColor: '#FF0000',
    weight: 1,
    opacity: 1,
    color: '#000000',
    fillOpacity: 1
};


export const cancerColorScale = d3.scaleOrdinal()
    .domain(['eso', 'kidney', 'liver', 'lung', 'pancreatic', 'prostate', 'skin'])
    .range(['#FF8000', '#00FF00', '#0000FF', '#FF0000', '#00FFFF', '#FF00FF', '#FFFF00']);

export const FACTORS = [
    "Air_Quality",
    "Air_Toxins_Concentration",
    "Air_Toxins_Concentration",
    "Annual_Sunlight_Exposure",
    "Annual_Sunlight_Exposure",
    "Annual_UV_DailyDose",
    "Annual_UV_DailyDose",
    "Radon_Levels_Pre_Mitigation_10Y",
    "Radon_Tests_Pre_Mitigation_10Y",
    "CO_Poisoning_Hospitalization",
    "Pesticide_Exposure",
    "Coronary_Heart_Disease",
    "Depression",
    "Diabetes",
    "Heart_Stroke",
    "Heart_Stroke",
    "High_Blood_Pressure",
    "High_Blood_Pressure",
    "High_Cholesterol",
    "High_Cholesterol",
    "Hospitalization",
    "Hospitalization",
    "Hospitalization_Gender",
    "Hospitalization_Gender",
    "No_Health_Insurance",
    "No_Health_Insurance",
    "Binge_Drinking",
    "No_Physical_Activity",
    "Obesity",
    "Short_Sleep",
    "Smoking",
    "Smoking"
];

export const DEFAULTS = {
    cancerType: 'Pancreatic',
    level: 'state',
    selectedCancerTypes: ['Pancreatic'],
    factor: 'Air_Toxins_Concentration',
    cancer_year: 2016,
    factor_year: 2016
};

export const STATE_FILTERS = [
    'Air_Toxins_Concentration',
    'Annual_Sunlight_Exposure',
    'Annual_UV_DailyDose',
    'CO_Poisoning_Hospitalization',
    'Pesticide_Exposure',
    'Heart_Stroke',
    'High_Blood_Pressure',
    'High_Cholesterol',
    'Hospitalization_Gender',
    'Hospitalization',
    'No_Health_Insurance',
    'Smoking'
];

export const COUNTY_FILTERS = [
    'Air_Quality',
    'Air_Toxins_Concentration',
    'Annual_Sunlight_Exposure',
    'Annual_UV_DailyDose',
    'Radon_Levels_Pre_Mitigation_10Y',
    'Radon_Tests_Pre_Mitigation_10Y',
    'Coronary_Heart_Disease',
    'Depression',
    'Diabetes',
    'Heart_Stroke',
    'High_Blood_Pressure',
    'High_Cholesterol',
    'Hospitalization_Gender',
    'Hospitalization',
    'No_Health_Insurance',
    'Binge_Drinking',
    'No_Physical_Activity',
    'Obesity',
    'Short_Sleep',
    'Smoking'
];




export const STATE_CANCER_AVAILABLE_YEARS = {
    "Breast": [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020],
    "Esophageal": [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020],
    "Kidney": [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020],
    "Liver": [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020],
    "Lung": [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020],
    "Pancreatic": [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020],
    "Prostate": [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020],
    "Skin": [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020]
};

export const COUNTY_CANCER_AVAILABLE_YEARS = {
    "Breast": [2011, 2016],
    "Esophageal": [2011, 2016],
    "Kidney": [2011, 2016],
    "Liver": [2011, 2016],
    "Lung": [2011, 2016],
    "Pancreatic": [2011, 2016],
    "Prostate": [2011, 2016],
    "Skin": [2011, 2016]
};

export const COUNTY_FACTORS_AVAILABLE_YEARS = {
    // Environment
    "Air_Quality": [2011, 2016],
    "Air_Toxins_Concentration": [2011, 2016],
    "Annual_Sunlight_Exposure": [2011, 2016],
    "Annual_UV_DailyDose": [2011, 2016],
    "Radon_Levels_Pre_Mitigation_10Y": [2011, 2016],
    "Radon_Tests_Pre_Mitigation_10Y": [2011, 2016],
    
    // Health status
    "Coronary_Heart_Disease": [2016],
    "Depression": [2016],
    "Diabetes": [2016],
    "Heart_Stroke": [2016],
    "High_Blood_Pressure": [2016],
    "High_Cholesterol": [2016],
    "Hospitalization": [2011, 2016],
    "Hospitalization_Gender": [2011, 2016],
    "No_Health_Insurance": [2011, 2016],
    
    // Lifestyle
    "Binge_Drinking": [2016],
    "No_Physical_Activity": [2016],
    "Obesity": [2016],
    "Short_Sleep": [2016],
    "Smoking": [2016]
};

export const STATE_FACTORS_AVAILABLE_YEARS = {
    // Environment
    "Air_Toxins_Concentration": [2011, 2014, 2017, 2018, 2019],
    "Annual_Sunlight_Exposure": [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020],
    "Annual_UV_DailyDose": [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020],
    "CO_Poisoning_Hospitalization": [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021],
    "Pesticide_Exposure": [2011, 2012, 2013, 2014, 2015, 2016, 2017],
    
    // Health status
    "Heart_Stroke": [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018],
    "High_Blood_Pressure": [2021],
    "High_Cholesterol": [2021],
    "Hospitalization": [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021],
    "Hospitalization_Gender": [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021],
    "No_Health_Insurance": [2014, 2015, 2016, 2017, 2018, 2019, 2020],
    
    // Lifestyle
    "Smoking": [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021]
};
