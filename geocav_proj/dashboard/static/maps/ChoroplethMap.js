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
        this.dataMin = Math.min(...values);
        this.dataMax = Math.max(...values);
        this.factorMin = Math.min(...factorValues);
        this.factorMax = Math.max(...factorValues);
        console.log('[Choropleth Map] Data range - Min:', this.dataMin, 'Max:', this.dataMax);
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
        this.layer = await this.createChoroplethLayer(map);
        this.createLegend();
        layersToRemove.forEach(layer => map.removeLayer(layer));
        console.log('[Choropleth Map] Choropleth map rendered.');
    }

    createLegend() {
        const legend = document.getElementById('legend');
    
        const colors = [
            ['#350617', '#781217', '#ba1c1c'],
            ['#3a207e', '#835f7f', '#cb9a9a'],
            ['#4533c6', '#9d96c8', '#f3f3f3']
        ];
    
        const dataBinSize = (this.dataMax - this.dataMin) / 3;
        const factorBinSize = (this.factorMax - this.factorMin) / 3;
    
        const dataBins = [0, 1, 2, 3].map(i => (this.dataMin + i * dataBinSize).toFixed(1));
        const factorBins = [0, 1, 2, 3].map(i => (this.factorMin + i * factorBinSize).toFixed(1));
    
        legend.innerHTML = `
            <h4>Legend</h4>
            <div style="display: flex;">
                <div style="display: flex; flex-direction: column-reverse; margin-right: 5px; justify-content: space-between; font-size: 10px; font-weight: bold;">
                    ${dataBins.slice(0, 3).reverse().map(bin => `<div style="height: 35px; display: flex; align-items: center;">${bin}</div>`).join('')}
                </div>
                <div>
                    <div style="display: flex; flex-direction: column-reverse;">
                        ${colors.map(row => `
                            <div style="display: flex;">
                                ${row.map(color => `
                                    <div style="background: ${color}; width: 35px; height: 35px; border: 1px solid #999;"></div>
                                `).join('')}
                            </div>
                        `).join('')}
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: bold; margin-top: 5px;">
                        ${factorBins.slice(0, 3).map(bin => `<div style="width: 35px; text-align: center;">${bin}</div>`).join('')}
                    </div>
                </div>
            </div>
            <div style="margin-top: 10px; font-size: 14px;">
                <div><strong>Cancer Rate:</strong> Incidence per 100,000</div>
                <div><strong>Factor:</strong> ${FACTORS_UNITS[this.selectedFilters.factor]}</div>
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
        const color = this.getBivariateColor(cancerValue, factorValue);
        
        return {
            ...DEFAULT_CHOROPLETH_STYLE,
            fillColor: color,
            fillOpacity: (cancerValue !== null && factorValue !== null) ? 0.7 : 0.1
        };
    }

    getBivariateColor(cancerValue, factorValue) {
        // console.log(`[Bivariate Color] Calculating color for Cancer Value: ${cancerValue}, Factor Value: ${factorValue}`);
        
        const cancerRange = this.dataMax - this.dataMin || 1;
        const factorRange = this.factorMax - this.factorMin || 1;
        
        const cancerNorm = Math.max(0, Math.min(1, (cancerValue - this.dataMin) / cancerRange)) || 0;
        const factorNorm = Math.max(0, Math.min(1, (factorValue - this.factorMin) / factorRange)) || 0;
        
        const cancerBin = Math.min(2, Math.floor(cancerNorm * 3)) || 0;
        const factorBin = Math.min(2, Math.floor(factorNorm * 3)) || 0;

        const colors = [
            ['#350617', '#781217', '#ba1c1c'],
            ['#3a207e', '#835f7f', '#cb9a9a'],
            ['#4533c6', '#9d96c8', '#f3f3f3']
        ];
        
        // console.log(`[Bivariate Color] Cancer Value: ${cancerValue}, Factor Value: ${factorValue}, Cancer Bin: ${cancerBin}, Factor Bin: ${factorBin}, Color: ${colors[cancerBin][factorBin]}`);
        return colors[cancerBin][factorBin];
    }

    createBivariatePopupContent(feature) {
        const county_name = feature.properties.NAME || '';
        const state_name = feature.properties.name || feature.properties.state_name || '';
        const name = county_name ? `${county_name}, ${state_name}` : state_name;
        const cancerValue = feature.cancer_rate;
        const factorValue = feature.factor_value;

        return `
            <div class="map-popup">
                <h4>${name}</h4>
                <p>Cancer Rate: ${cancerValue != null ? cancerValue.toFixed(2) : 'N/A'}</p>
                <p>Factor: ${factorValue != null ? factorValue.toFixed(2) : 'N/A'}</p>
            </div>
        `;
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