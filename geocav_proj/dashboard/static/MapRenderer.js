import {DEFAULT_LEAFLET_CONFIG, 
    STATE_CANCER_AVAILABLE_YEARS, COUNTY_CANCER_AVAILABLE_YEARS,
    COUNTY_FACTORS_AVAILABLE_YEARS, STATE_FACTORS_AVAILABLE_YEARS
} from './config.js';
import {ChoroplethMap} from './maps/ChoroplethMap.js';
import {PieMap} from './maps/PieMap.js';
import { DotDensityMap } from './maps/DotDensityMap.js';
import { RegressionPlot } from './RegressionPlot.js';
import { DataManager } from './DataManager.js';

const MAP_TYPE = 'choropleth'; // Change to 'pie', 'choropleth', or 'dotDensity' as needed

export class MapRenderer {
    constructor (dataManager) {
        console.log('[Map Renderer] Initializing MapRenderer');
        this.dataManager = dataManager;
        this.initializeBaseMap();
    }

    initializeBaseMap() {
        this.map = L.map('map').setView(DEFAULT_LEAFLET_CONFIG.DEFAULT_CENTER, DEFAULT_LEAFLET_CONFIG.DEFAULT_ZOOM);

        L.tileLayer(DEFAULT_LEAFLET_CONFIG.TILE_LAYER.url, {
            maxZoom: DEFAULT_LEAFLET_CONFIG.TILE_LAYER.options.maxZoom,
            attribution: DEFAULT_LEAFLET_CONFIG.TILE_LAYER.options.attribution
        }).addTo(this.map);
    }


    
    async renderMap(selectedFilters) {
        console.log('[MapRenderer] Rendering map with cancer type:', selectedFilters.cancer_type, 'and level:', selectedFilters.level);

        if (selectedFilters.mapType === 'choropleth') {
            this.map_type = new ChoroplethMap(selectedFilters);
        }
        else if (selectedFilters.mapType === 'pie') {
            this.map_type = new PieMap(selectedFilters);
        }
        else if (selectedFilters.mapType === 'dotDensity') {
            this.map_type = new DotDensityMap(selectedFilters);
        }

        // promise to clear map
        const layers = this.getMapLayers();
        await this.dataManager.fetchData(selectedFilters);
        let statesLayer = null;
        if (this.map_type instanceof PieMap) {
            // For pie map, handle multi-select
            statesLayer = await this.dataManager.getPieData(selectedFilters);
        }
        else {
            statesLayer = await this.dataManager.fetchStatesLayer(selectedFilters);
        }   
        
        // Render the choropleth map
        this.map_type.renderMap(this.map, statesLayer);

        // Clear previous layers
        this.clearMap(layers);
    }

    async updateMap(selectedFilters) {
        this.map_type.selectedFilters = selectedFilters;
        // Fetch new data and re-render the map
        this.map_type.updateMap(this.map, selectedFilters.level);
    }

    getMapLayers() {
        const layers = [];
        this.map.eachLayer((layer) => {
            if (!(layer instanceof L.TileLayer)) {
                layers.push(layer);
            }
        });
        return layers;
    }

    clearMap(layers) {
        if (layers && layers.length) {
            layers.forEach(layer => this.map.removeLayer(layer));
        }
    }


}
