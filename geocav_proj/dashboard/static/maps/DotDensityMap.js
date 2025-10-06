export class DotDensityMap {
    constructor (selectedFilters) {
        this.selectedFilters = selectedFilters;

        this.percent = 0.2; // Top 20% cases
    }

    async fetchMapData() {
        const time = performance.now();
        console.log('Fetching map data for cancer type:', this.selectedFilters.cancerType, ', factor:', this.selectedFilters.factor, 'and level:', this.selectedFilters.level);
        // Send default query parameters
        const params = new URLSearchParams();
        params.append('level', this.selectedFilters.level);
        params.append('cancer_type', this.selectedFilters.cancerType);
        params.append('factor', this.selectedFilters.factor);
        
        const response = await fetch(`/dotDensity?${params.toString()}`);
        this.statesLayer = await response.json();
        console.log(`Map data fetched in ${(performance.now() - time).toFixed(2)} ms`);
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

    async renderMap(map) {
        this.map = map;
        await this.fetchMapData();
        // Remove existing heatmap layers
        const layersToRemove = [];
        map.eachLayer((layer) => {
            if (layer instanceof L.HeatLayer || layer instanceof L.CircleMarker) {
            layersToRemove.push(layer);
            }
        });

        console.log('Rendering dot density map with cancer type:', this.selectedFilters.cancerType, ', factor:', this.selectedFilters.factor, 'and level:', this.selectedFilters.level);
        this.createLegend(this.selectedFilters.cancerType);
        this.renderDots(map);
        this.renderHeatmap(map);
        layersToRemove.forEach(layer => map.removeLayer(layer));
    }

    async renderHeatmap(map) {
        console.log('Rendering heatmap for cancer type:', this.selectedFilters.cancerType);
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
            }).addTo(map);
    }

    async renderDots(map) {
        console.log('Rendering top cases for factor:', this.selectedFilters.factor);
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
            
            marker.addTo(map);
        });
    }

    // Prepares heatmap data based on selected factor and cancer type
    async prepareHeatmapData() {
        // Each object: { latitude, longitude, ...factors, ...cancerTypes }
        const heatData = [];
        
        this.statesLayer.features.forEach(row => {
            const centroid = L.geoJSON(row).getBounds().getCenter();
            const factor = parseFloat(row.properties.factor_value);
            if (!isNaN(centroid.lat) && !isNaN(centroid.lng) && !isNaN(factor)) {
                heatData.push([centroid.lat, centroid.lng, factor]);
            }
        });
        return heatData;
    }

    // Prepares top case data based on selected factor and cancer type
    async prepareTopCasesData() {
        let topCases = [];
        this.statesLayer.features.forEach(row => {
            const centroid = L.geoJSON(row).getBounds().getCenter();
            const cancer = parseFloat(row.properties.cancer_rate);
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

    createLegend(selectedCancerType) {
        const legend = document.getElementById('legend');
        legend.innerHTML = `
            <h4>Heat Map</h4>
            <div style="margin-top: 10px;">
                <label for="percentSlider">Top Cases of ${selectedCancerType}: <span id="percentValue">${(this.percent * 100).toFixed(0)}%</span></label>
                <input type="range" id="percentSlider" min="5" max="100" value="${this.percent * 100}" step="5" style="width: 100%; margin-top: 5px;">
            </div>
        `;
        
        // Add event listener for slider
        console.log('Setting up percent slider event listener in DotDensityMap...');
        document.getElementById('percentSlider').addEventListener('input', (e) => {
            this.percent = e.target.value / 100;
            document.getElementById('percentValue').textContent = `${e.target.value}%`;
            // Trigger map update
            console.log('Percent change detected in DotDensityMap, updating map...');
            this.updateMap(this.map);
        });

        document.getElementsByClassName('legend-box')[0].style.height = `auto`;
    }

    createTooltip(feature) {
        const county_name = feature.properties.NAME || '';
        const state_name = feature.properties.name || feature.properties.state_name || '';
        const name = county_name ? `${county_name}, ${state_name}` : state_name;
        const value = feature.properties.cancer_rate;
        var tooltipContent = `<strong>${name}</strong><br/>`;
        tooltipContent += `Cancer Rate: ${value !== null && !isNaN(value) ? value.toFixed(2) : 'N/A'}`;
        return tooltipContent;
    }


}