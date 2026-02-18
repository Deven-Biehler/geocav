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


    
    async renderMap(selectedFilters, pcData = null) {
        console.log('[MapRenderer] Rendering map with filters:', selectedFilters);
        
        // Check if PCA visualization is requested
        if (pcData && pcData.isPCA) {
            console.log('[MapRenderer] Rendering PC visualization with PCs:', pcData.selectedPCs);
            await this.renderPCVisualization(selectedFilters, pcData);
            return;
        }

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
        
        try {
            await this.dataManager.fetchData(selectedFilters);
            let statesLayer = null;
            if (this.map_type instanceof PieMap) {
                // For pie map, handle multi-select
                statesLayer = await this.dataManager.getPieData(selectedFilters);
            }
            else {
                statesLayer = await this.dataManager.fetchStatesLayer(selectedFilters);
            }   
            
            console.log('[MapRenderer] Rendering map type:', this.map_type);
            console.log('[MapRenderer] States Layer Data:', statesLayer);
            this.map_type.renderMap(this.map, statesLayer);
        } catch (error) {
            console.error('[MapRenderer] Error rendering map:', error);
        }

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

    async renderPCVisualization(selectedFilters, pcData) {
        console.log('[MapRenderer] Creating PC visualization');
        
        const pcResults = pcData.pcResults;
        const selectedPCs = pcData.selectedPCs;
        
        if (selectedPCs.length === 0) {
            console.error('[MapRenderer] No PCs selected');
            return;
        }
        
        // Use the first selected PC for visualization
        const pcIndex = selectedPCs[0];
        
        // Clear existing layers
        const layers = this.getMapLayers();
        this.clearMap(layers);

        // Fetch all data needed for computation
        await this.dataManager.fetchData(selectedFilters);
        const statesLayer = await this.dataManager.fetchStatesLayer(selectedFilters);
        
        // Calculate PC scores for each region
        this.computePCScores(statesLayer, pcResults, pcIndex, selectedFilters); 
        
        // Create a modified filters object that indicates PC visualization
        const pcFilters = {...selectedFilters, isPCVisualization: true, pcIndex: pcIndex};

        console.log('[MapRenderer] PC Filters for rendering:', pcFilters);
        console.log('[MapRenderer] States Layer with PC scores:', statesLayer);
        
        // Create choropleth map and render with PC scores
        this.map_type = new ChoroplethMap(pcFilters);
        this.map_type.renderMap(this.map, statesLayer);
    }

    computePCScores(statesLayer, pcResults, pcIndex, selectedFilters) {
        const loadings = pcResults.loadings[pcIndex]; // Loadings for this PC
        const factorNames = pcResults.factor_names;
        const factorMeans = pcResults.factor_means || [];
        const factorStds = pcResults.factor_stds || [];
        
        console.log('[MapRenderer] Computing PC scores for PC', pcIndex, 'with loadings:', loadings);
        
        // Calculate means and stds from the data if not provided
        let computedMeans = factorMeans.length > 0 ? factorMeans : new Array(factorNames.length).fill(0);
        let computedStds = factorStds.length > 0 ? factorStds : new Array(factorNames.length).fill(1);
        
        // If means/stds not provided, compute them from the data
        if (computedMeans.length === 0 || computedMeans.every(m => m === 0)) {
            console.log('[MapRenderer] Computing means and stds from data...');
            computedMeans = new Array(factorNames.length).fill(0);
            computedStds = new Array(factorNames.length).fill(0);
            const counts = new Array(factorNames.length).fill(0);
            
            // First pass: compute means
            statesLayer.features.forEach((feature) => {
                factorNames.forEach((factorName, idx) => {
                    const value = feature.properties[factorName];
                    if (value !== undefined && value !== null && !isNaN(value)) {
                        computedMeans[idx] += value;
                        counts[idx]++;
                    }
                });
            });
            
            computedMeans = computedMeans.map((sum, idx) => counts[idx] > 0 ? sum / counts[idx] : 0);
            
            // Second pass: compute stds
            statesLayer.features.forEach((feature) => {
                factorNames.forEach((factorName, idx) => {
                    const value = feature.properties[factorName];
                    if (value !== undefined && value !== null && !isNaN(value)) {
                        computedStds[idx] += Math.pow(value - computedMeans[idx], 2);
                    }
                });
            });
            
            computedStds = computedStds.map((sum, idx) => counts[idx] > 0 ? Math.sqrt(sum / counts[idx]) : 1);
        }
        
        // For each region in the statesLayer, compute its PC score
        statesLayer.features.forEach((feature, idx) => {
            let pcScore = 0;
            let validFactorCount = 0;
            
            // Sum (standardized_factor_value * loading) for each factor
            factorNames.forEach((factorName, factorIdx) => {
                const factorValue = feature[factorName];
                const loading = loadings[factorIdx];
                
                // Standardize the factor value
                let standardizedValue = factorValue;
                const mean = computedMeans[factorIdx] || 0;
                standardizedValue = (factorValue - mean) / computedStds[factorIdx];
                
                pcScore += standardizedValue * loading;
                validFactorCount++;
            });
            
            // Store the PC score as the visualization value
            feature.properties['pc_score'] = pcScore;
            feature.properties['factor_value'] = pcScore; // Use this for compatibility with rendering
        });
    }
}
