import { DEFAULT_CHOROPLETH_STYLE } from '../config.js';

export class ChoroplethMap {
    constructor(selectedFilters) {
        console.log('[Choropleth Map] ChoroplethMap constructor called with level:', selectedFilters.level, 'and cancer type:', selectedFilters.cancerType);
        this.layer = null; // Initialize layer property
        this.selectedFilters = selectedFilters
    }

    async getDataRange(data) {
        const values = data.features
            .map(feature => feature.cancer_rate)
            .filter(value => value != null);  // Filters out null and undefined
        // Set default min/max or calculate from values
        this.dataMin = Math.min(...values);
        this.dataMax = Math.max(...values);
        console.log('[Choropleth Map] Data range - Min:', this.dataMin, 'Max:', this.dataMax);
    }

    async renderMap(map, data) {
        console.log('[Choropleth Map] Rendering choropleth map with cancer type:', this.selectedFilters.cancerType, 'and level:', this.selectedFilters.level);
        console.log('[Choropleth Map] Data received for rendering:', data);
        this.statesLayer = data
        this.createTitle();
        const layersToRemove = [];
        map.eachLayer((layer) => {
            if (layer instanceof L.GeoJSON) {
            layersToRemove.push(layer);
            }
        });
        await this.getDataRange(data); // Get data range consistent throughout years to avoid color scale changes
        // Store the layer for later updates
        this.layer = await this.createChoroplethLayer(map);
        this.createLegend();
        layersToRemove.forEach(layer => map.removeLayer(layer));
        console.log('[Choropleth Map] Choropleth map rendered.');
    }

    updateMap(map) {

        // Render the new layer with updated data
        this.renderMap(map);
        this.createLegend();
    }

    createLegend() {
        const legend = document.getElementById('legend');
        
        // Generate a color scale with several steps
        const colorCount = 7;
        const colors = [];
        
        // Generate colors for each step in the legend
        for (let i = 0; i < colorCount; i++) {
            const normalizedValue = i / (colorCount - 1);
            colors.push(d3.interpolateRdYlBu(1 - normalizedValue)); // Using same color scale as the map
        }
        
        legend.innerHTML = '<h4>Cancer Rate</h4>' +
            colors.map((color, i) => {
            const value = (this.dataMin + (i / (colorCount - 1)) * (this.dataMax - this.dataMin)).toFixed(2);
            return `
                <div style="display: inline-block; text-align: center; margin-right: 5px;">
                <span style="background: ${color}; width: 45px; height: 45px; display: flex; align-items: center; justify-content: center; font-size: 13px; color: black; font-weight: bold;">${value}</span>
                </div>
            `;
            }).join('');
        
            const legendContainer = document.getElementsByClassName('legend-box')[0];
            legendContainer.style.height = `auto`;
    }

    createTitle() {
        const titleElement = document.getElementById('page-title');
        if (titleElement) {
            titleElement.textContent = `Choropleth Map - ${this.selectedFilters.cancerType} (${this.selectedFilters.level.charAt(0).toUpperCase() + this.selectedFilters.level.slice(1)})`;
        }
    }

    /* --- Helpers --- */
    async createChoroplethLayer(map) {  
        // Create the choropleth layer
        const layer = L.geoJson(this.statesLayer, {
            style: (feature) => this.getMapStyle(feature),
            onEachFeature: (feature, layer) => {
                layer.on({
                    mouseover: (e) => {
                        this.highlightFeature(e);
                        // Show tooltip on hover
                        e.target.openTooltip();
                    },
                    mouseout: (e) => {
                        this.resetHighlight(e, null); // Pass required second parameter
                        // Hide tooltip when mouse leaves
                        e.target.closeTooltip();
                    }
                });
                
                // Add tooltip with state/county name and value (shown on hover)
                const popupContent = this.createPopupContent(feature);
                layer.bindTooltip(popupContent, {
                    sticky: true,  // Makes tooltip follow the mouse
                    opacity: 0.9,
                    className: 'map-tooltip'
                });
            }
        }).addTo(map);
        return layer;
    }

    /* --- Styling --- */

    getMapStyle(feature) {
        const value = feature.cancer_rate;
        const color = this.getColor(value, this.dataMin, this.dataMax);
        
        return {
            ...DEFAULT_CHOROPLETH_STYLE,
            fillColor: color,
            fillOpacity: value !== null ? 0.7 : 0.1 // Less opacity for no data
        };
    }

    getColor(value, min, max) {
        if (value === null || value === 0) return '#cccccc'; // Gray for no data
        
        // Ensure min and max are different to avoid division by zero
        if (min === max) {
            min = 0;
            max = Math.max(1, max);
        }
        
        // Ensure the value is within a reasonable range (avoid outliers)
        const normalizedValue = Math.max(0, Math.min(1, (value - min) / (max - min)));
        
        // Use a color scale that's easier to distinguish
        return d3.interpolateRdYlBu(1 - normalizedValue); // Reversed so red is high, blue is low
    }


    /* --- Popup Content --- */

    createPopupContent(feature) {
        // Get the name from county_name property that we explicitly set
        const county_name = feature.properties.NAME || '';
        const state_name = feature.properties.name || feature.properties.state_name || '';
        const name = county_name ? `${county_name}, ${state_name}` : state_name;
        const value = feature.cancer_rate;

        return `
            <div class="map-popup">
                <h4>${name}</h4>
                <p>${value != null ? `Value: ${value.toFixed(2)}` : 'No data available'}</p>
            </div>
        `;
    }

    highlightFeature(e) {
        const layer = e.target;
        
        // Custom highlight style
        layer.setStyle({
            weight: 3,
            color: '#666',
            dashArray: '',
            fillOpacity: 0.9
        });
        
        layer.bringToFront();
    }  

    resetHighlight(e, dataValues) {
        const layer = e.target;
        layer.setStyle(this.getMapStyle(layer.feature, dataValues));
    }

}
