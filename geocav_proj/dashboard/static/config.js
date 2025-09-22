export const DASHBOARD_STATES = [
    'CHOROPLETH',
    'PIE CHART',
    'DOT DENSITY'
]


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

export const US_STATE_DATA = 'data/us-states.json';
export const US_COUNTY_DATA = 'data/counties.geojson';



// Hardcoded factor and cancer type lists for now:
export const FACTORS = [
    'drinking',
    'obesity',
    'diabetes',
    'heart_disease',
    'poverty',
    'noHealthIns',
    'smoking'
];
export const CANCER_TYPES = [
    'eso',
    'kidney',
    'liver',
    'lung',
    'pancreatic',
    'prostate',
    'skin'
];




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

