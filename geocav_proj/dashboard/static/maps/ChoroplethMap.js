import { DEFAULT_CHOROPLETH_STYLE } from '../config.js';
import { FACTORS_UNITS } from '../config.js';

export class ChoroplethMap {
    constructor(selectedFilters) {
        console.log('[Choropleth Map] ChoroplethMap constructor called with level:', selectedFilters.level, 'and cancer type:', selectedFilters.cancer_type);
        this.layer = null;
        this.selectedFilters = selectedFilters
    }

    async getDataRange(data) {
        // Filter for valid paired data for correlation stats
        const validFeatures = data.features.filter(f => f.cancer_rate != null && f.factor_value != null);
        
        const values = validFeatures.map(f => f.cancer_rate);
        const factorValues = validFeatures.map(f => f.factor_value);
        
        // Calculate min/max for normalization (using all data for single view)
        const allValues = data.features.map(f => f.cancer_rate).filter(v => v != null);
        const allFactorValues = data.features.map(f => f.factor_value).filter(v => v != null);

        this.dataMin = Math.min(...allValues);
        this.dataMax = Math.max(...allValues);
        this.factorMin = Math.min(...allFactorValues);
        this.factorMax = Math.max(...allFactorValues);
        
        if (validFeatures.length < 2) {
            this.correlationMin = 0;
            this.correlationMax = 0;
            this.globalCorrelation = 0;
            this.stats = { meanCancer: 0, meanFactor: 0, stdCancer: 1, stdFactor: 1 };
            return;
        }

        // Calculate mean and std for Pearson correlation (using paired data)
        const n = validFeatures.length;
        const meanCancer = values.reduce((a, b) => a + b, 0) / n;
        const meanFactor = factorValues.reduce((a, b) => a + b, 0) / n;
        
        const stdCancer = Math.sqrt(values.reduce((a, b) => a + Math.pow(b - meanCancer, 2), 0) / (n - 1));
        const stdFactor = Math.sqrt(factorValues.reduce((a, b) => a + Math.pow(b - meanFactor, 2), 0) / (n - 1));

        // Calculate global Pearson correlation
        const correlationTerms = validFeatures.map(feature => {
            const zCancer = (feature.cancer_rate - meanCancer) / stdCancer;
            const zFactor = (feature.factor_value - meanFactor) / stdFactor;
            return zCancer * zFactor;
        });
        
        this.globalCorrelation = correlationTerms.reduce((a, b) => a + b, 0) / (n - 1);

        // Calculate Regression Parameters (y = mx + b)
        // y = cancer, x = factor
        const slope = this.globalCorrelation * (stdCancer / stdFactor);
        const intercept = meanCancer - (slope * meanFactor);
        
        this.stats = { meanCancer, meanFactor, stdCancer, stdFactor, slope, intercept };

        // Calculate Residuals for range
        const residuals = validFeatures.map(feature => {
            const predicted = (slope * feature.factor_value) + intercept;
            return feature.cancer_rate - predicted;
        });
        
        this.residualMin = Math.min(...residuals);
        this.residualMax = Math.max(...residuals);
        this.maxAbsResidual = Math.max(Math.abs(this.residualMin), Math.abs(this.residualMax));
        
        console.log('[Choropleth Map] Data range - Cancer Min:', this.dataMin, 'Cancer Max:', this.dataMax, 'Factor Min:', this.factorMin, 'Factor Max:', this.factorMax);
        console.log('[Choropleth Map] Regression - Slope:', slope, 'Intercept:', intercept, 'Max Abs Residual:', this.maxAbsResidual);
        console.log('[Choropleth Map] Global Pearson Correlation:', this.globalCorrelation);
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
        let content = '';

        if (this.selectedFilters.factor == 'None') {
            legendTitle = this.selectedFilters.cancer_type;
            content = `
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
        } else if (this.selectedFilters.cancer_type == 'None') {
            legendTitle = this.selectedFilters.factor;
            content = `
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
        } else {
            legendTitle = 'Deviation from Trend';
            content = `
            <h4>${legendTitle}</h4>
            <div style="display: flex; flex-direction: column; gap: 5px; font-size: 12px;">
                <div style="display: flex; align-items: center; gap: 5px;">
                    <div style="background: #ff0000; width: 20px; height: 20px; border: 1px solid #999;"></div>
                    <span>Higher than expected</span>
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <div style="background: #ffffff; width: 20px; height: 20px; border: 1px solid #999;"></div>
                    <span>As expected</span>
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <div style="background: #0000ff; width: 20px; height: 20px; border: 1px solid #999;"></div>
                    <span>Lower than expected</span>
                </div>
            </div>
            `;
        }
    
        legend.innerHTML = content;
    }

    createTitle() {
        const titleElement = document.getElementById('page-title');
        if (titleElement) {
            let title = '';
            const level = this.selectedFilters.level.charAt(0).toUpperCase() + this.selectedFilters.level.slice(1);
            
            const cancerPart = this.selectedFilters.cancer_type !== 'None' 
                ? `${this.selectedFilters.cancer_type} (${this.selectedFilters.cancer_year})` 
                : '';
                
            const factorPart = this.selectedFilters.factor !== 'None'
                ? `${this.selectedFilters.factor.replace(/_/g, ' ')} (${this.selectedFilters.factor_year})`
                : '';

            if (cancerPart && factorPart) {
                title = `Choropleth Map - ${cancerPart} vs ${factorPart}`;
            } else if (cancerPart) {
                title = `Choropleth Map - ${cancerPart}`;
            } else if (factorPart) {
                title = `Choropleth Map - ${factorPart}`;
            } else {
                title = 'Choropleth Map';
            }

            titleElement.textContent = `${title} (${level})`;
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
        // Case 1: Only Cancer Type selected (Factor is None)
        // Color based on magnitude of cancer rate (White -> Red)
        if (this.selectedFilters.factor == 'None') {
            if (cancerValue == null) {
                return '#cccccc'; // Gray for missing data
            }
            const range = this.dataMax - this.dataMin || 1;
            const normalized = Math.max(0, Math.min(1, (cancerValue - this.dataMin) / range));
            
            const r = 255;
            const g = Math.round(255 * (1 - normalized));
            const b = Math.round(255 * (1 - normalized));
            return `rgb(${r}, ${g}, ${b})`;
        }
        
        // Case 2: Only Factor selected (Cancer Type is None)
        // Color based on magnitude of factor value (White -> Red)
        if (this.selectedFilters.cancer_type == 'None') {
            if (factorValue == null) {
                return '#cccccc'; // Gray for missing data
            }
            const range = this.factorMax - this.factorMin || 1;
            const normalized = Math.max(0, Math.min(1, (factorValue - this.factorMin) / range));
            
            const r = 255;
            const g = Math.round(255 * (1 - normalized));
            const b = Math.round(255 * (1 - normalized));
            return `rgb(${r}, ${g}, ${b})`;
        }

        // Case 3: Correlation (Both selected)
        // Color based on deviation from regression trend (Blue -> White -> Red)
        if (cancerValue == null || factorValue == null) {
            return '#cccccc'; // Gray for missing data
        }

        // Calculate predicted value and residual
        const predicted = (this.stats.slope * factorValue) + this.stats.intercept;
        const residual = cancerValue - predicted;
        
        // Normalize residual to -1 to 1 range based on maxAbsResidual
        // -1 = Blue (Lower than expected), 0 = White, 1 = Red (Higher than expected)
        const normalized = residual / (this.maxAbsResidual || 1);
        
        // Diverging Color Scale
        let r, g, b;
        if (normalized > 0) {
            // White to Red (Higher than expected)
            r = 255;
            g = Math.round(255 * (1 - normalized));
            b = Math.round(255 * (1 - normalized));
        } else {
            // White to Blue (Lower than expected)
            // normalized is negative here, so use Math.abs
            const absNorm = Math.abs(normalized);
            r = Math.round(255 * (1 - absNorm));
            g = Math.round(255 * (1 - absNorm));
            b = 255;
        }
        
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
            popupContent += `<p><strong>${this.selectedFilters.cancer_type}:</strong> ${cancerValue != null ? cancerValue.toFixed(2) : 'N/A'} per 100,000</p>`;
        }
        
        // Only show factor if it's selected
        if (this.selectedFilters.factor != 'None') {
            const unit = FACTORS_UNITS[this.selectedFilters.factor] || '';
            const valueDisplay = factorValue != null ? factorValue.toFixed(2) : 'N/A';
            popupContent += `<p><strong>${this.selectedFilters.factor}:</strong> ${valueDisplay}${unit ? ' ' + unit : ''}</p>`;
        }
        
        // Only show correlation if both are selected
        if (this.selectedFilters.cancer_type != 'None' && this.selectedFilters.factor != 'None') {
            
            if (cancerValue != null && factorValue != null && this.stats) {
                 const predicted = (this.stats.slope * factorValue) + this.stats.intercept;
                 const residual = cancerValue - predicted;
                 popupContent += `<p><strong>Expected Rate:</strong> ${predicted.toFixed(2)}</p>`;
                 popupContent += `<p><strong>Deviation:</strong> ${residual > 0 ? '+' : ''}${residual.toFixed(2)}</p>`;
            }
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