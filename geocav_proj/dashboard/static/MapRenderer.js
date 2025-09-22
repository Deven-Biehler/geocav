import {DEFAULT_LEAFLET_CONFIG} from './config.js';
import {ChoroplethMap} from './maps/ChoroplethMap.js';
import {PieMap} from './maps/PieMap.js';
import { DotDensityMap } from './maps/DotDensityMap.js';

const MAP_TYPE = 'choropleth'; // Change to 'pie', 'choropleth', or 'dotDensity' as needed

export class MapRenderer {
    constructor () {
        console.log('Initializing MapRenderer');
        // Initialize properties
        this.selectedFilters = {
            cancerType: 'kidney',
            level: 'state',
            selectedCancerTypes: ['kidney'],
            factor: 'drinking'
        };
        if (MAP_TYPE == 'choropleth') {
            this.map_type = new ChoroplethMap(this.selectedFilters);
        }
        else if (MAP_TYPE == 'pie') {
            this.map_type = new PieMap(this.selectedFilters);
            this.setupMultiSelect(); // Setup multi-select for pie map
        }
        else if (MAP_TYPE == 'dotDensity') {
            this.map_type = new DotDensityMap(this.selectedFilters);
        }
        
        this.statesLayer = null;
        
        this.map = L.map('map').setView(DEFAULT_LEAFLET_CONFIG.DEFAULT_CENTER, DEFAULT_LEAFLET_CONFIG.DEFAULT_ZOOM);
        
        L.tileLayer(DEFAULT_LEAFLET_CONFIG.TILE_LAYER.url, {
            maxZoom: DEFAULT_LEAFLET_CONFIG.TILE_LAYER.options.maxZoom,
            attribution: DEFAULT_LEAFLET_CONFIG.TILE_LAYER.options.attribution
        }).addTo(this.map);
        
        this.addEventListeners();
        this.renderMap();
    }
    
    renderMap() {
        console.log('[MapRenderer] Rendering map with cancer type:', this.selectedFilters.cancerType, 'and level:', this.selectedFilters.level);
        this.map_type.selectedFilters = this.selectedFilters;
        
        // Render the choropleth map
        this.map_type.renderMap(this.map);
    }

    async updateMap() {
        this.map_type.selectedFilters = this.selectedFilters;
        // Fetch new data and re-render the map
        this.map_type.updateMap(this.map, this.selectedFilters.level);
    }


    clearMap() {
        // Remove all layers except the tile layer
        this.map.eachLayer((layer) => {
            if (!(layer instanceof L.TileLayer)) {
                this.map.removeLayer(layer);
            }
        });
    }
    
    addEventListeners() {
        // Map type change
        const mapSelect = document.getElementById('map-select');
        mapSelect.addEventListener('change', (e) => {
            this.clearMap();
            this.setupSingleSelect(); // Reset to single-select for non-pie maps
            const selectedMapType = e.target.value || 'choropleth'; // Default to choropleth
            if (selectedMapType === 'choropleth') {
                this.map_type = new ChoroplethMap(this.selectedFilters);
            } else if (selectedMapType === 'pie') {
                this.setupMultiSelect();
                this.map_type = new PieMap(this.selectedFilters);
            } else if (selectedMapType === 'dotDensity') {
                this.map_type = new DotDensityMap(this.selectedFilters);
            }
            this.renderMap();
        });
        // Cancer type filter
        const cancerSelect = document.getElementById('cancer-select');
        cancerSelect.addEventListener('change', (e) => {
            if (this.map_type instanceof PieMap) {
                // For pie map, handle multi-select
                this.selectedFilters.selectedCancerTypes = Array.from(cancerSelect.selectedOptions).map(option => option.value) || ['kidney'];
            } else {
                this.selectedFilters.cancerType = e.target.value || 'kidney'; // Default to kidney
            }
            this.renderMap();
            window.regressionPlot.renderPlot();
        });
        // Level filter
        const levelSelect = document.getElementById('level-select');
        levelSelect.addEventListener('change', (e) => {
            this.selectedFilters.level = e.target.value || 'state'; // Default to state
            this.renderMap();
            window.regressionPlot.level = this.selectedFilters.level;
            window.regressionPlot.renderPlot();
        });
        // Factor filter
        const factorSelect = document.getElementById('factor-select');
        factorSelect.addEventListener('change', (e) => {
            this.selectedFilters.factor = e.target.value || 'drinking'; // Default to drinking
            this.renderMap();
            window.regressionPlot.selectedFactor = this.selectedFilters.factor;
            window.regressionPlot.renderPlot();
        });
    }

        
    setupMultiSelect() {
        // Convert the cancer-select to a multi-select for pie map
        const cancerSelect = document.getElementById('cancer-select');
        
        // Save the current options
        const currentOptions = Array.from(cancerSelect.options).map(opt => ({
            value: opt.value,
            text: opt.text
        }));
        
        // Clear the select element
        cancerSelect.innerHTML = '';
        
        // Set multiple attribute
        cancerSelect.setAttribute('multiple', 'multiple');
        cancerSelect.style.height = '120px'; // Make it taller to show multiple options
        
        // Restore the options
        currentOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.text = opt.text;
            if (opt.value === 'kidney') {
                option.selected = true;
            }
            cancerSelect.appendChild(option);
        });
    }

    setupSingleSelect() {
        // Convert the cancer-select back to single-select for non-pie maps
        const cancerSelect = document.getElementById('cancer-select');
        // Save the current options
        const currentOptions = Array.from(cancerSelect.options).map(opt => ({
            value: opt.value,
            text: opt.text,
            selected: opt.selected
        }));
        // Clear the select element
        cancerSelect.innerHTML = '';
        // Remove multiple attribute
        cancerSelect.removeAttribute('multiple');
        cancerSelect.style.height = 'auto'; // Reset height
        // Restore the options
        currentOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.text = opt.text;
            if (opt.selected) {
                option.selected = true;
            }
            cancerSelect.appendChild(option);
        });
        // Ensure only one option is selected
        if (cancerSelect.selectedOptions.length === 0 && currentOptions.length > 0) {
            cancerSelect.options[0].selected = true;
            this.selectedFilters.cancerType = cancerSelect.options[0].value;
        } else if (cancerSelect.selectedOptions.length > 1) {
            // If multiple were selected, keep only the first
            Array.from(cancerSelect.options).forEach((opt, idx) => {
                opt.selected = idx === 0;
                if (opt.selected) {
                    this.selectedFilters.cancerType = opt.value;
                }
            });
        }
    }
}
