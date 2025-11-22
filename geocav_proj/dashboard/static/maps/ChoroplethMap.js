import { DEFAULT_CHOROPLETH_STYLE } from '../config.js';
import { FACTORS_UNITS } from '../config.js';

export class ChoroplethMap {
    constructor(selectedFilters) {
        console.log('[Choropleth Map] ChoroplethMap constructor called with level:', selectedFilters.level, 'and cancer type:', selectedFilters.cancer_type);
        this.layer = null;
        this.selectedFilters = selectedFilters
    }

    async getDataRange(data) {
        const values = data.features
            .map(feature => feature.cancer_rate)
            .filter(value => value != null);
        const factorValues = data.features
            .map(feature => feature.factor_value)
            .filter(value => value != null);
        
        // Calculate min/max for normalization
        this.dataMin = Math.min(...values);
        this.dataMax = Math.max(...values);
        this.factorMin = Math.min(...factorValues);
        this.factorMax = Math.max(...factorValues);
        
        // Calculate correlation values (product of normalized values) for range
        const correlationValues = data.features
            .map(feature => {
                if (feature.cancer_rate != null && feature.factor_value != null) {
                    const cancerRange = this.dataMax - this.dataMin || 1;
                    const factorRange = this.factorMax - this.factorMin || 1;
                    const normalizedCancer = (feature.cancer_rate - this.dataMin) / cancerRange;
                    const normalizedFactor = (feature.factor_value - this.factorMin) / factorRange;
                    return normalizedCancer * normalizedFactor;
                }
                return null;
            })
            .filter(value => value != null);
        
        this.correlationMin = Math.min(...correlationValues);
        this.correlationMax = Math.max(...correlationValues);
        console.log('[Choropleth Map] Data range - Cancer Min:', this.dataMin, 'Cancer Max:', this.dataMax, 'Factor Min:', this.factorMin, 'Factor Max:', this.factorMax, 'Correlation Min:', this.correlationMin, 'Correlation Max:', this.correlationMax);
    }

    async renderMap(map, data) {
        console.log('[Choropleth Map] Rendering choropleth map with cancer type:', this.selectedFilters.cancer_type, 'and level:', this.selectedFilters.level);
        console.log('[Choropleth Map] Data received for rendering:', data);
        this.statesLayer = data
        this.createTitle();
        const layersToRemove = [];
        map.eachLayer((layer) => {
            if (layer instanceof L.GeoJSON) {
            layersToRemove.push(layer);
            }
        });
        await this.getDataRange(data);
        console.log('[Choropleth Map] Data range calculated - Correlation Min:', this.correlationMin, 'Correlation Max:', this.correlationMax);
        this.layer = await this.createChoroplethLayer(map);
        this.createLegend();
        layersToRemove.forEach(layer => map.removeLayer(layer));
        console.log('[Choropleth Map] Choropleth map rendered.');
    }

    createLegend() {
        const legend = document.getElementById('legend');
        
        // Determine legend title based on what's being displayed
        let legendTitle = 'Correlation';
        if (this.selectedFilters.factor == 'None') {
            legendTitle = this.selectedFilters.cancer_type;
        } else if (this.selectedFilters.cancer_type == 'None') {
            legendTitle = this.selectedFilters.factor;
        }
    
        legend.innerHTML = `
            <h4>${legendTitle}</h4>
            <div style="display: flex; gap: 15px; font-size: 12px;">
                <div style="display: flex; align-items: center; gap: 5px;">
                    <div style="background: white; width: 30px; height: 30px; border: 2px solid #999;"></div>
                    <span>Low</span>
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <div style="background: red; width: 30px; height: 30px; border: 2px solid #999;"></div>
                    <span>High</span>
                </div>
            </div>
        `;
    }

    createTitle() {
        const titleElement = document.getElementById('page-title');
        if (titleElement) {
            titleElement.textContent = `Choropleth Map - ${this.selectedFilters.cancer_type} (${this.selectedFilters.level.charAt(0).toUpperCase() + this.selectedFilters.level.slice(1)})`;
        }
    }

    async createChoroplethLayer(map) {  
        console.log('[Choropleth Map] Creating choropleth layer...');
        console.log('[Choropleth Map] States layer data:', this.statesLayer);
        const layer = L.geoJson(this.statesLayer, {
            style: (feature) => this.getBivariateMapStyle(feature),
            onEachFeature: (feature, layer) => {
                layer.on({
                    mouseover: (e) => {
                        this.highlightFeature(e);
                        e.target.openTooltip();
                    },
                    mouseout: (e) => {
                        this.resetHighlight(e, null);
                        e.target.closeTooltip();
                    }
                });
                
                const popupContent = this.createBivariatePopupContent(feature);
                layer.bindTooltip(popupContent, {
                    sticky: true,
                    opacity: 0.9,
                    className: 'map-tooltip'
                });
            }
        }).addTo(map);
        return layer;
    }

    getBivariateMapStyle(feature) {
        const cancerValue = feature.cancer_rate;
        const factorValue = feature.factor_value;
        const color = this.getCorrelationColor(cancerValue, factorValue);
        
        return {
            ...DEFAULT_CHOROPLETH_STYLE,
            fillColor: color,
            fillOpacity: (cancerValue !== null && factorValue !== null) ? 0.8 : 0.1
        };
    }

    getCorrelationColor(cancerValue, factorValue) {
        let normalized;
        
        // Handle case where only cancer type is selected (factor is 'None')
        if (this.selectedFilters.factor == 'None') {
            if (cancerValue == null) {
                return '#cccccc'; // Gray for missing data
            }
            const range = this.dataMax - this.dataMin || 1;
            normalized = Math.max(0, Math.min(1, (cancerValue - this.dataMin) / range));
        }
        // Handle case where only factor is selected (cancer_type is 'None')
        else if (this.selectedFilters.cancer_type == 'None') {
            if (factorValue == null) {
                return '#cccccc'; // Gray for missing data
            }
            const range = this.factorMax - this.factorMin || 1;
            normalized = Math.max(0, Math.min(1, (factorValue - this.factorMin) / range));
        }
        // Handle correlation case (both cancer type and factor are selected)
        else {
            // Normalize cancer value
            const cancerRange = this.dataMax - this.dataMin || 1;
            const normalizedCancer = (cancerValue - this.dataMin) / cancerRange;
            
            // Normalize factor value
            const factorRange = this.factorMax - this.factorMin || 1;
            const normalizedFactor = (factorValue - this.factorMin) / factorRange;
            
            // Calculate correlation as product of normalized values (both must be high for high correlation)
            const correlationValue = normalizedCancer * normalizedFactor;
            
            if (correlationValue == null) {
                return '#cccccc'; // Gray for missing data
            }
            
            // Normalize to 0-1 range based on actual min/max of correlation values
            const range = this.correlationMax - this.correlationMin || 1;
            normalized = Math.max(0, Math.min(1, (correlationValue - this.correlationMin) / range));
        }
        
        // White to red gradient
        const r = 255;
        const g = Math.round(255 * (1 - normalized));
        const b = Math.round(255 * (1 - normalized));
        
        return `rgb(${r}, ${g}, ${b})`;
    }

    createBivariatePopupContent(feature) {
        const county_name = feature.properties.NAME || '';
        const state_name = feature.properties.name || feature.properties.state_name || '';
        const name = county_name ? `${county_name}, ${state_name}` : state_name;
        const cancerValue = feature.cancer_rate;
        const factorValue = feature.factor_value;
        
        // Build popup content based on selected filters
        let popupContent = `<div class="map-popup"><h4>${name}</h4>`;
        
        // Only show cancer type if it's selected
        if (this.selectedFilters.cancer_type != 'None') {
            popupContent += `<p><strong>${this.selectedFilters.cancer_type}:</strong> ${cancerValue != null ? cancerValue.toFixed(2) : 'N/A'}</p>`;
        }
        
        // Only show factor if it's selected
        if (this.selectedFilters.factor != 'None') {
            popupContent += `<p><strong>${this.selectedFilters.factor}:</strong> ${factorValue != null ? factorValue.toFixed(2) : 'N/A'}</p>`;
        }
        
        // Only show correlation if both are selected
        if (this.selectedFilters.cancer_type != 'None' && this.selectedFilters.factor != 'None') {
            let correlationValue = 'N/A';
            if (cancerValue != null && factorValue != null) {
                const cancerRange = this.dataMax - this.dataMin || 1;
                const factorRange = this.factorMax - this.factorMin || 1;
                const normalizedCancer = (cancerValue - this.dataMin) / cancerRange;
                const normalizedFactor = (factorValue - this.factorMin) / factorRange;
                correlationValue = (normalizedCancer * normalizedFactor).toFixed(2);
            }
            popupContent += `<p><strong>Correlation:</strong> ${correlationValue}</p>`;
        }
        
        popupContent += `</div>`;
        return popupContent;
    }

    highlightFeature(e) {
        const layer = e.target;
        
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
        layer.setStyle(this.getBivariateMapStyle(layer.feature));
    }
}