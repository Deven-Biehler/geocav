import {DEFAULT_LEAFLET_CONFIG, DEFAULTS, COUNTY_FILTERS, STATE_FILTERS, 
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
    constructor () {
        console.log('[Map Renderer] Initializing MapRenderer');

        this.dataManager = new DataManager();
        // Initialize properties
        this.selectedFilters = DEFAULTS;
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
        
        this.regressionPlot = new RegressionPlot(this.selectedFilters);
        
        this.statesLayer = null;
        
        this.map = L.map('map').setView(DEFAULT_LEAFLET_CONFIG.DEFAULT_CENTER, DEFAULT_LEAFLET_CONFIG.DEFAULT_ZOOM);
        
        L.tileLayer(DEFAULT_LEAFLET_CONFIG.TILE_LAYER.url, {
            maxZoom: DEFAULT_LEAFLET_CONFIG.TILE_LAYER.options.maxZoom,
            attribution: DEFAULT_LEAFLET_CONFIG.TILE_LAYER.options.attribution
        }).addTo(this.map);


        this.cancerSelect = document.getElementById('cancer-select');
        this.factorSelect = document.getElementById('factor-select');
        this.levelSelect = document.getElementById('level-select');
        this.genderSelect = document.getElementById('gender-select');
        this.raceSelect = document.getElementById('race-select');
        this.slider = document.getElementById('cancer-year-selector');
        this.factorSlider = document.getElementById('factor-year-selector');

        // Set default selections
        this.cancerSelect.value = this.selectedFilters.cancerType;
        this.factorSelect.value = this.selectedFilters.factor;
        this.levelSelect.value = this.selectedFilters.level;
        this.genderSelect.value = this.selectedFilters.gender;
        this.raceSelect.value = this.selectedFilters.race;
        this.slider.value = this.selectedFilters.cancer_year;
        this.factorSlider.value = this.selectedFilters.factor_year;

        
        this.addEventListeners();
        this.updateAvailableFilters();
        this.updateAvailableYears();
        this.renderMap();
    }

    
    async renderMap() {
        console.log('[MapRenderer] Rendering map with cancer type:', this.selectedFilters.cancerType, 'and level:', this.selectedFilters.level);

        // promise to clear map
        const layers = this.getMapLayers();
        await this.dataManager.loadData(this.selectedFilters);
        const data = await this.dataManager.fetchRegressionData(this.selectedFilters);
        let statesLayer = null;
        if (this.map_type instanceof PieMap) {
            // For pie map, handle multi-select
            statesLayer = await this.dataManager.getPieData(this.selectedFilters);
        }
        else {
            statesLayer = await this.dataManager.fetchStatesLayer(this.selectedFilters);
        }   
        
        // Render the choropleth map
        this.map_type.renderMap(this.map, statesLayer);
        this.regressionPlot.renderPlot(data);

        // Clear previous layers
        this.clearMap(layers);
    }

    async updateMap() {
        this.map_type.selectedFilters = this.selectedFilters;
        // Fetch new data and re-render the map
        this.map_type.updateMap(this.map, this.selectedFilters.level);
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

    updateAvailableFilters() {
        const factorFilters = document.getElementById('factor-select');
        const cancerFilters = document.getElementById('cancer-select');
        factorFilters.innerHTML = ''; // Clear existing options
        // Set cancer filter options to available cancer types for the selected geographic level
        if (this.selectedFilters.level === 'state') {
            for (const factor of STATE_FILTERS) {
                const option = document.createElement('option');
                option.value = factor;
                option.text = factor.replace(/_/g, ' ');
                factorFilters.appendChild(option);
            }
            // Set default factor
            if (!this.selectedFilters.factor || !STATE_FILTERS.includes(this.selectedFilters.factor)) {
                this.selectedFilters.factor = STATE_FILTERS[0];
                factorFilters.value = this.selectedFilters.factor;
            }
        } else if (this.selectedFilters.level === 'county') {
            for (const factor of COUNTY_FILTERS) {
                const option = document.createElement('option');
                option.value = factor;
                option.text = factor.replace(/_/g, ' ');
                factorFilters.appendChild(option);
            }
            // Set default factor
            if (!this.selectedFilters.factor || !COUNTY_FILTERS.includes(this.selectedFilters.factor)) {
                this.selectedFilters.factor = COUNTY_FILTERS[0];
                factorFilters.value = this.selectedFilters.factor;
            }
        }

        // Make sure the visual selector reflects the current filter
        factorFilters.value = this.selectedFilters.factor;
        cancerFilters.value = this.selectedFilters.cancerType;
    }

    updateAvailableYears() {
        const cancerYearFilter = document.getElementById('cancer-year-selector');
        const factorYearFilter = document.getElementById('factor-year-selector');
        cancerYearFilter.innerHTML = ''; // Clear existing options
        factorYearFilter.innerHTML = ''; // Clear existing options
        let availableYears = [];
        let factorAvailableYears = [];
        if (this.selectedFilters.level === 'state') {
            console.log(this.selectedFilters.factor)
            availableYears = STATE_CANCER_AVAILABLE_YEARS[this.selectedFilters.cancerType]; 
            factorAvailableYears = STATE_FACTORS_AVAILABLE_YEARS[this.selectedFilters.factor];
        } else if (this.selectedFilters.level === 'county') {
            availableYears = COUNTY_CANCER_AVAILABLE_YEARS[this.selectedFilters.cancerType];
            factorAvailableYears = COUNTY_FACTORS_AVAILABLE_YEARS[this.selectedFilters.factor];
        }
        console.log('[MapRenderer] Available years for cancer type', this.selectedFilters.cancerType, 'at level', this.selectedFilters.level, ':', availableYears);
        console.log('[MapRenderer] Available years for factor', this.selectedFilters.factor, 'at level', this.selectedFilters.level, ':', factorAvailableYears);
        for (const year of availableYears) {
            const option = document.createElement('option');
            option.value = year;
            option.text = year;
            cancerYearFilter.appendChild(option);
        }
        for (const year of factorAvailableYears) {
            const option = document.createElement('option');
            option.value = year;
            option.text = year;
            factorYearFilter.appendChild(option);
        }
        // Set default year
        if (!this.selectedFilters.cancer_year || !availableYears.includes(this.selectedFilters.cancer_year)) {
            this.selectedFilters.cancer_year = availableYears[0];
            document.getElementById('cancer-year-selector').value = this.selectedFilters.cancer_year;
        }
        if (!this.selectedFilters.factor_year || !factorAvailableYears.includes(this.selectedFilters.factor_year)) {
            this.selectedFilters.factor_year = factorAvailableYears[0];
            document.getElementById('factor-year-selector').value = this.selectedFilters.factor_year;
        }

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
        this.cancerSelect.addEventListener('change', (e) => {
            this.update_selected_cancer(e);
        });
        // Level filter
        this.levelSelect.addEventListener('change', (e) => {
            this.update_selected_level(e);
        });
        // Factor filter
        this.factorSelect.addEventListener('change', (e) => {
            this.update_selected_factor(e);
        });
        // Gender filter
        
        this.genderSelect.addEventListener('change', (e) => {
            this.updateSelectedGender(e.target.value); // Default to all
        });
        // Race filter
        this.raceSelect.addEventListener('change', (e) => {
            this.updateSelectedRace(e.target.value); // Default to all
        });

        
        
        this.slider.addEventListener('change', (e) => {
            this.updateSelectedCancerYear(e.target.value);
        });

        this.factorSlider.addEventListener('change', (e) => {
            this.updateSelectedFactorYear(e.target.value);
        });

    }

    update_selected_cancer(e) {
        this.updateAvailableYears();
        if (this.map_type instanceof PieMap) {
            // For pie map, handle multi-select
            this.selectedFilters.selectedCancerTypes = Array.from(this.cancerSelect.selectedOptions).map(option => option.value);
        } else {
            this.selectedFilters.cancerType = e.target.value;
        }
        this.renderMap();
    }

    update_selected_factor(e) {
        this.updateAvailableYears();
        this.selectedFilters.factor = e.target.value;
        this.renderMap();
    }

    update_selected_level(e) {
        this.selectedFilters.level = e.target.value;
        this.updateAvailableFilters();
        this.updateAvailableYears();
        this.renderMap();
    }

    updateSelectedCancerYear(year) {
        this.selectedFilters.cancer_year = year;
        this.renderMap();
    };

    updateSelectedFactorYear(year) {
        this.selectedFilters.factor_year = year;
        this.renderMap();
    };

    updateSelectedGender(gender) {
        this.selectedFilters.gender = gender;
        this.renderMap();
        if (gender !== 'all') {
            this.raceSelect.value = 'all';
            this.raceSelect.disabled = true;
            this.selectedFilters.race = 'all';
        }
        else {
            this.raceSelect.disabled = false;
        }

    };

    updateSelectedRace(race) {
        this.selectedFilters.race = race;
        this.renderMap();

        console.log('[MapRenderer] Race selected:', race);
        if (race !== 'all') {
            this.genderSelect.value = 'all';
            this.genderSelect.disabled = true;
            this.selectedFilters.gender = 'all';
        }
        else {
            this.genderSelect.disabled = false;
        }
    };


        
    setupMultiSelect() {
        
        // Save the current options
        const currentOptions = Array.from(this.cancerSelect.options).map(opt => ({
            value: opt.value,
            text: opt.text
        }));
        
        // Clear the select element
        this.cancerSelect.innerHTML = '';
        
        // Set multiple attribute
        this.cancerSelect.setAttribute('multiple', 'multiple');
        this.cancerSelect.style.height = '120px'; // Make it taller to show multiple options
        
        // Restore the options
        currentOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.text = opt.text;
            this.cancerSelect.appendChild(option);
        });
    }

    setupSingleSelect() {
        // Convert the cancer-select back to single-select for non-pie maps
        // Save the current options
        const currentOptions = Array.from(this.cancerSelect.options).map(opt => ({
            value: opt.value,
            text: opt.text,
            selected: opt.selected
        }));
        // Clear the select element
        this.cancerSelect.innerHTML = '';
        // Remove multiple attribute
        this.cancerSelect.removeAttribute('multiple');
        this.cancerSelect.style.height = 'auto'; // Reset height
        // Restore the options
        currentOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.text = opt.text;
            if (opt.selected) {
                option.selected = true;
            }
            this.cancerSelect.appendChild(option);
        });
        // Ensure only one option is selected
        if (this.cancerSelect.selectedOptions.length === 0 && currentOptions.length > 0) {
            this.cancerSelect.options[0].selected = true;
            this.selectedFilters.cancerType = this.cancerSelect.options[0].value;
        } else if (this.cancerSelect.selectedOptions.length > 1) {
            // If multiple were selected, keep only the first
            Array.from(this.cancerSelect.options).forEach((opt, idx) => {
                opt.selected = idx === 0;
                if (opt.selected) {
                    this.selectedFilters.cancerType = opt.value;
                }
            });
        }
    }
}
