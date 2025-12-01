export class DotDensityMap {
    constructor (selectedFilters) {
        this.selectedFilters = selectedFilters;

        this.percent = 0.2; // Top 20% cases
    }

    async updateMap(map) {
        // clear dots layer
        map.eachLayer((layer) => {
            if (layer instanceof L.CircleMarker) {
                map.removeLayer(layer); 
            }
        });
        // Add back the dots layer
        this.renderDots(map);
    }

    async renderMap(map, data) {
        this.statesLayer = data;
        this.map = map;
        console.log('[Heat Map] Rendering dot density map with cancer type:', this.selectedFilters.cancer_type, ', factor:', this.selectedFilters.factor, 'and level:', this.selectedFilters.level);
        console.log('[Heat Map] Data received for rendering:', data);
        this.createTitle();
        this.createLegend(this.selectedFilters.cancer_type);
        this.renderDots();
        this.renderHeatmap();
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
                title = `Heat Map - ${cancerPart} vs ${factorPart}`;
            } else if (cancerPart) {
                title = `Heat Map - ${cancerPart}`;
            } else if (factorPart) {
                title = `Heat Map - ${factorPart}`;
            } else {
                title = 'Heat Map';
            }

            titleElement.textContent = `${title} (${level})`;
        }
    }

    async renderHeatmap() {
        console.log('[Heat Map] Rendering heatmap for cancer type:', this.selectedFilters.cancer_type);
        const heatData = await this.prepareHeatmapData();
        L.heatLayer(heatData, {
                radius: 25,
                blur: 15,
                maxZoom: 17,
                max: 0.1,
                gradient: {
                    0.0: 'blue',
                    0.3: 'cyan',
                    0.5: 'lime',
                    0.7: 'yellow',
                    1.0: 'red'
                }
            }).addTo(this.map);
    }

    async renderDots() {
        console.log('[Heat Map] Rendering top cases for factor:', this.selectedFilters.factor);
        const topCases = await this.prepareTopCasesData();
        topCases.forEach((point) => {
            const marker = L.circleMarker([point[0], point[1]], {
                radius: 1.4,
                fillColor: 'blue',
                color: 'darkblue',
                weight: 1,
                fillOpacity: 0.8
            });
            
            if (point[3]) {
                const tooltipContent = this.createTooltip(point[3]);
                marker.bindTooltip(tooltipContent, {
                    permanent: false,
                    direction: 'top',
                    offset: [0, -5]
                });
            }
            
            marker.addTo(this.map);
        });
    }

    calculateArea(latlngs) {
        let area = 0;
        const len = latlngs.length;
        
        for (let i = 0; i < len; i++) {
            const j = (i + 1) % len;
            area += latlngs[i].lng * latlngs[j].lat;
            area -= latlngs[j].lng * latlngs[i].lat;
        }
        
        area = Math.abs(area / 2);
        
        // Convert to square meters (approximate)
        return area * 111320 * 111320 * Math.cos(latlngs[0].lat * Math.PI / 180);
    }

    async prepareHeatmapData() {
        let heatData = [];
    
        this.statesLayer.features.forEach(row => {
            const centroid = L.geoJSON(row).getBounds().getCenter();
            const factor = parseFloat(row.factor_value); // Already per 100k
            
            if (!isNaN(centroid.lat) && !isNaN(centroid.lng) && !isNaN(factor)) {
                heatData.push([centroid.lat, centroid.lng, factor]);
            }
        });
    
        // Normalize to 0-1 for heatmap
        const values = heatData.map(d => d[2]);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min;
        
        heatData = heatData.map(d => [
            d[0],
            d[1],
            range > 0 ? ((d[2] - min) * 10) / range : 0
        ]);
        
        return heatData;
    }

    // Prepares top case data based on selected factor and cancer type
    async prepareTopCasesData() {
        let topCases = [];
        this.statesLayer.features.forEach(row => {
            const centroid = L.geoJSON(row).getBounds().getCenter();
            const cancer = parseFloat(row.cancer_rate);
            if (!isNaN(centroid.lat) && !isNaN(centroid.lng) && !isNaN(cancer)) {
                // Include feature data directly to avoid expensive lookups later
                topCases.push([centroid.lat, centroid.lng, cancer, row]);
            }
        });
        topCases.sort((a, b) => b[2] - a[2]);
        const topPercentCount = Math.ceil(topCases.length * this.percent);
        topCases = topCases.slice(0, topPercentCount);
        return topCases;
    }

    createLegend() {
        const legend = document.getElementById('legend');
        legend.innerHTML = `
            <h4>Heat Map</h4>
            <div style="margin-top: 10px;">
                <label for="percentSlider">Top Cases of ${this.selectedFilters.cancer_type}: <span id="percentValue">${(this.percent * 100).toFixed(0)}%</span></label>
                <input type="range" id="percentSlider" min="5" max="100" value="${this.percent * 100}" step="5" style="width: 100%; margin-top: 5px;">
            </div>
        `;
        
        // Add event listener for slider
        console.log('[Heat Map] Setting up percent slider event listener in DotDensityMap...');
        document.getElementById('percentSlider').addEventListener('input', (e) => {
            this.percent = e.target.value / 100;
            document.getElementById('percentValue').textContent = `${e.target.value}%`;
            // Trigger map update
            console.log('[Heat Map] Percent change detected in DotDensityMap, updating map...');
            this.updateMap(this.map);
        });

        document.getElementsByClassName('legend-box')[0].style.height = `auto`;
    }

    createTooltip(feature) {
        const county_name = feature.properties.NAME || '';
        const state_name = feature.properties.name || feature.properties.state_name || '';
        const name = county_name ? `${county_name}, ${state_name}` : state_name;
        const value = feature.cancer_rate;
        var tooltipContent = `<strong>${name}</strong><br/>`;
        tooltipContent += `Cancer Rate: ${value !== null && !isNaN(value) ? value.toFixed(2) : 'N/A'}`;
        return tooltipContent;
    }


}