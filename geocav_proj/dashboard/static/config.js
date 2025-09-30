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