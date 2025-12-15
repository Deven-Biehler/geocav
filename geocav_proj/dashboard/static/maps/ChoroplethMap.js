import { DEFAULT_CHOROPLETH_STYLE } from '../config.js';
import { FACTORS_UNITS } from '../config.js';
import { calculateMultipleLinearRegression } from '../mathUtils.js';
import { getDeviationLegendContent, getStandardLegendContent, createBivariatePopupContent, getCorrelationColor } from '../mapUtils.js';

export class ChoroplethMap {
    constructor(selectedFilters) {
        console.log('[Choropleth Map] ChoroplethMap constructor called with level:', selectedFilters.level, 'and cancer type:', selectedFilters.cancer_type);
        this.layer = null;
        this.selectedFilters = selectedFilters
    }

    async getDataStats(data) {
        /* Calculate necessary statistics for choropleth rendering */
        
        // Calculate min/max for normalization (using all data for single view)
        const allValues = data.features.map(f => f.cancer_rate).filter(v => v != null); // Filter out nulls
        const nC = allValues.length; // Number of valid cancer rate values
        this.dataMean = allValues.reduce((a, b) => a + b, 0) / nC; // Mean of all cancer rate values
        this.dataStd = Math.sqrt(allValues.reduce((a, b) => a + Math.pow(b - this.dataMean, 2), 0) / (nC - 1)); // Std Dev
        
        // Calculate factor stats if single factor selected
        if (this.selectedFilters.factor.length === 1) {
            const factorName = this.selectedFilters.factor[0]; // Single factor (bc length == 1)
            const allFactorValues = data.features.map(f => f[factorName]).filter(v => v != null); // Filter out nulls
            const nF = allFactorValues.length; // Number of valid factor values
            this.factorMean = allFactorValues.reduce((a, b) => a + b, 0) / nF; // Mean of all factor values
            this.factorStd = Math.sqrt(allFactorValues.reduce((a, b) => a + Math.pow(b - this.factorMean, 2), 0) / (nF - 1)); // Std Dev
        }

        // Filter for valid paired data (cancer rate and factor values)
        const validFeatures = data.features.filter(f => 
            f.cancer_rate != null && this.selectedFilters.factor.every(factor => f[factor] != null)
        );

        this.calculateRegression(validFeatures);
    }

    async calculateRegression(validFeatures) {
        /* Perform regression analysis based on selected factors */
        if (validFeatures.length < this.selectedFilters.factor.length + 1) {
            this.stats = { beta: [] };
            return; // Not enough data to perform regression
        }

        if (this.selectedFilters.factor.length > 1) {
            // Multiple Regression
            const X = validFeatures.map(f => [1, ...this.selectedFilters.factor.map(factor => +f[factor])]);
            const Y = validFeatures.map(f => +f.cancer_rate);
            
            const { beta, predictedY, rSquared } = calculateMultipleLinearRegression(X, Y);
            
            // Calculate Residuals
            const residuals = validFeatures.map((feature, i) => {
                return feature.cancer_rate - predictedY[i];
            });

            this.stats = { beta, isMultiple: true, rSquared };
            
            // Set range to 2 standard deviations of the original data
            this.maxAbsResidual = (this.dataStd * 2) || 1;
            
        } else {
            // Single Regression
            const factorName = this.selectedFilters.factor[0];
            const values = validFeatures.map(f => f.cancer_rate);
            const factorValues = validFeatures.map(f => f[factorName]);
            
            const n = validFeatures.length;
            const meanCancer = values.reduce((a, b) => a + b, 0) / n;
            const meanFactor = factorValues.reduce((a, b) => a + b, 0) / n;
            
            const stdCancer = Math.sqrt(values.reduce((a, b) => a + Math.pow(b - meanCancer, 2), 0) / (n - 1));
            const stdFactor = Math.sqrt(factorValues.reduce((a, b) => a + Math.pow(b - meanFactor, 2), 0) / (n - 1));

            const correlationTerms = validFeatures.map(feature => {
                const zCancer = (feature.cancer_rate - meanCancer) / stdCancer;
                const zFactor = (feature[factorName] - meanFactor) / stdFactor;
                return zCancer * zFactor;
            });
            
            const globalCorrelation = correlationTerms.reduce((a, b) => a + b, 0) / (n - 1);
            const rSquared = Math.pow(globalCorrelation, 2);

            const slope = globalCorrelation * (stdCancer / stdFactor);
            const intercept = meanCancer - (slope * meanFactor);
            
            this.stats = { meanCancer, meanFactor, stdCancer, stdFactor, slope, intercept, isMultiple: false, rSquared };
            
            // Set range to 2 standard deviations of the original data
            this.maxAbsResidual = (this.dataStd * 2) || 1;
        }
        
        console.log('[Choropleth Map] Regression stats:', this.stats);
    }

    async renderMap(map, data) {
        console.log('[Choropleth Map] Rendering choropleth map with cancer type:', this.selectedFilters.cancer_type, 'and level:', this.selectedFilters.level);
        console.log('[Choropleth Map] Data received for rendering:', data);

        const layersToRemove = [];
        map.eachLayer((layer) => { // Promise to remove old layers
            if (layer instanceof L.GeoJSON) {
            layersToRemove.push(layer);
            }
        });

        /* Update title, legend and map */
        this.createTitle();                                         // Update title based on selected filters
        await this.getDataStats(data);                              // Calculate necessary stats before rendering
        this.layer = await this.createChoroplethLayer(map, data);   // Create new choropleth layer
        this.createLegend();                                        // Update legend after rendering map
        layersToRemove.forEach(layer => map.removeLayer(layer));    // Remove old layers

        console.log('[Choropleth Map] Data range calculated - Correlation Min:', this.correlationMin, 'Correlation Max:', this.correlationMax);
        console.log('[Choropleth Map] Choropleth map rendered.');
    }

    createLegend() {
        const legend = document.getElementById('legend');
        
        // Determine legend title based on what's being displayed
        let legendTitle = 'Correlation';
        let content = '';

        const factor = Array.isArray(this.selectedFilters.factor) ? this.selectedFilters.factor[0] : this.selectedFilters.factor;

        if (factor == 'None') {
            legendTitle = this.selectedFilters.cancer_type;
            const lowVal = (this.dataMean - 2 * this.dataStd).toFixed(1);
            const highVal = (this.dataMean + 2 * this.dataStd).toFixed(1);
            const meanVal = this.dataMean.toFixed(1);
            content = getStandardLegendContent(legendTitle, lowVal, highVal, meanVal);
        } else if (this.selectedFilters.cancer_type == 'None') {
            legendTitle = factor;
            const lowVal = (this.factorMean - 2 * this.factorStd).toFixed(1);
            const highVal = (this.factorMean + 2 * this.factorStd).toFixed(1);
            const meanVal = this.factorMean.toFixed(1);
            content = getStandardLegendContent(legendTitle, lowVal, highVal, meanVal);
        } else {
            legendTitle = 'Deviation from Trend';
            const rangeVal = this.maxAbsResidual ? this.maxAbsResidual.toFixed(1) : 'N/A';
            const r2 = this.stats && this.stats.rSquared ? this.stats.rSquared.toFixed(3) : 'N/A';
            
            content = getDeviationLegendContent(legendTitle, r2, rangeVal);
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
            
            const factors = Array.isArray(this.selectedFilters.factor) ? this.selectedFilters.factor : [this.selectedFilters.factor];
            let factorPart = '';
            
            if (factors.length > 1) {
                factorPart = `${factors.length} Factors (${this.selectedFilters.factor_year})`;
            } else if (factors[0] !== 'None') {
                factorPart = `${factors[0].replace(/_/g, ' ')} (${this.selectedFilters.factor_year})`;
            }

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

    async createChoroplethLayer(map, data) {  
        /* Create choropleth layer on map based on data and selected filters */

        console.log('[Choropleth Map] Creating choropleth layer...');
        console.log('[Choropleth Map] States layer data:', data);
        
        const layer = L.geoJson(data, {
            style: (feature) => this.getBivariateMapStyle(feature),     // Apply bivariate styling
            onEachFeature: (feature, layer) => {                        // Add interactivity
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
                
                const popupContent = createBivariatePopupContent(
                    feature, 
                    this.selectedFilters, 
                    this.stats, 
                    this.maxAbsResidual,
                     FACTORS_UNITS);                                    // Create popup content
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
        const factors = Array.isArray(this.selectedFilters.factor) ? this.selectedFilters.factor : [this.selectedFilters.factor];
        const hasFactors = factors.every(f => feature[f] != null);
        
        // Use imported getCorrelationColor
        const color = getCorrelationColor(
            feature, 
            this.selectedFilters, 
            this.dataMean, 
            this.dataStd, 
            this.factorMean, 
            this.factorStd, 
            this.stats, 
            this.maxAbsResidual
        );
        
        return {
            ...DEFAULT_CHOROPLETH_STYLE,
            fillColor: color,
            fillOpacity: (cancerValue !== null && hasFactors) ? 0.8 : 0.1
        };
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