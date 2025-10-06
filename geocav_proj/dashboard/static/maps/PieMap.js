import {cancerColorScale} from '../config.js';

export class PieMap {
    constructor(selectedFilters) {
        console.log('[Pie] PieMap constructor called with:', selectedFilters);
        this.markers = [];
        this.selectedFilters = selectedFilters;
    }

    async fetchMapData() {
        console.log('[Pie] Fetching pie map data for level:', this.selectedFilters.level);
        // Send default query parameters
        const params = new URLSearchParams();
        params.append('level', this.selectedFilters.level);
        
        const response = await fetch(`/pie?${params.toString()}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Response is not JSON:', text);
            throw new Error('Server did not return JSON');
        }
        
        this.statesLayer = await response.json();
    }

    async renderMap(map) {
        console.log('[Pie] Rendering pie map with filters:', this.selectedFilters);
        await this.fetchMapData();
        this.updateMap(map);
    }

    async updateMap(map, level) {
        if (level) {
            this.selectedFilters.level = level;
        }
        // Update selected cancer types if they were passed in selectedFilters
        if (this.selectedFilters && this.selectedFilters.selectedCancerTypes) {
            this.selectedFilters.selectedCancerTypes = this.selectedFilters.selectedCancerTypes;
        }
        // Remove existing markers
        if (this.markers && this.markers.length) {
            this.markers.forEach(marker => map.removeLayer(marker));
            this.markers = [];
        }
        
        this.createLegend();
        
        this.statesLayer.features.forEach(feature => {
            const values = feature.properties;
            const pieData = this.generatePieChart(values);
            const centroid = L.geoJSON(feature).getBounds().getCenter();

            // Create pie chart SVG
            const svg = d3.create("svg").attr("width", 100).attr("height", 100);
            const g = svg.append("g").attr("transform", "translate(50,50)");
            const arc = d3.arc().innerRadius(0).outerRadius(20);

            g.selectAll("path")
                .data(pieData)
                .enter()
                .append("path")
                .attr("d", arc)
                .attr("fill", (d) => cancerColorScale(d.data.key));

            const icon = L.divIcon({
                className: '',
                html: svg.node().outerHTML,
                iconSize: [100, 100],
                iconAnchor: [50, 50]
            });

            const tooltipContent = this.createTooltip(feature);

            const marker = L.marker([centroid.lat, centroid.lng], {icon: icon}).addTo(map).bindTooltip(tooltipContent);
            this.markers.push(marker);
        });
    }

    createLegend() {
        const legend = document.getElementById('legend');
        
        // Use selectedCancerTypes instead of all CANCER_TYPES for the legend
        const typesToShow = this.selectedFilters.selectedCancerTypes && this.selectedFilters.selectedCancerTypes.length > 0 
            ? this.selectedFilters.selectedCancerTypes 
            : ['kidney']; // Default to kidney if nothing selected
            
        legend.innerHTML = '<h4>Selected Cancer Types</h4>' +
            typesToShow.map((type) =>
                `<div><span style="background: ${cancerColorScale(type)}; width: 15px; height: 15px; display: inline-block; margin-right: 5px;"></span>${type}</div>`
            ).join('');

        const legendContainer = document.getElementsByClassName('legend-box')[0];
        legendContainer.style.height = `auto`;
    }

    /* --- Helpers --- */

    generatePieChart(values) {
        // Use selectedCancerTypes instead of all CANCER_TYPES
        const selectedTypes = this.selectedFilters.selectedCancerTypes && this.selectedFilters.selectedCancerTypes.length > 0 
            ? this.selectedFilters.selectedCancerTypes 
            : ['kidney']; // Default to kidney if nothing selected

        var pieData = selectedTypes
            .filter(type => values[type] !== null && typeof values[type] === 'number')
            .map(type => ({
                key: type,
                value: values[type]
            }));
        
        var pie = d3.pie()
            .value(d => d.value);
        
        return pie(pieData);
    }

    createTooltip(feature) {
        const county_name = feature.properties.NAME || '';
        const state_name = feature.properties.name || feature.properties.state_name || '';
        const name = county_name ? `${county_name}, ${state_name}` : state_name;
        const value = feature.properties.cancer_rate;
        var tooltipContent = `<strong>${name}</strong><br/>`;
        const values = feature.properties;
        
        // Use selectedCancerTypes instead of all CANCER_TYPES for the tooltip
        const typesToShow = this.selectedFilters.selectedCancerTypes && this.selectedFilters.selectedCancerTypes.length > 0 
            ? this.selectedFilters.selectedCancerTypes 
            : ['kidney']; // Default to kidney if nothing selected
            
        for (const type of typesToShow) {
            tooltipContent += `<div>${type}: ${values[type] !== null ? Math.round(10*values[type])/10 : 'N/A'}</div>`;
        }
        return tooltipContent;
    }
}