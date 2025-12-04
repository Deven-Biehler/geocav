import {cancerColorScale} from '../config.js';

export class PieMap {
    constructor(selectedFilters) {
        this.markers = [];
        this.selectedFilters = selectedFilters;
    }

    async renderMap(map, data) {
        this.statesLayer = data;
        this.createTitle();
        this.updateMap(map);
    }

    createTitle() {
        const titleElement = document.getElementById('page-title');
        if (titleElement) {
            const level = this.selectedFilters.level.charAt(0).toUpperCase() + this.selectedFilters.level.slice(1);
            const cancerYear = this.selectedFilters.cancer_year;
            
            const typesToShow = this.selectedFilters.selectedCancerTypes && this.selectedFilters.selectedCancerTypes.length > 0
                ? this.selectedFilters.selectedCancerTypes.join(', ')
                : 'No Cancer Selected';

            titleElement.textContent = `Pie Map - ${typesToShow} (${cancerYear}) (${level})`;
        }
    }

    async updateMap(map, level) {
        if (level) {
            this.selectedFilters.level = level;
        }
        
        // Remove existing markers
        this.markers.forEach(marker => map.removeLayer(marker));
        this.markers = [];
        
        this.createLegend();
        
        // Calculate max total for scaling
        let maxTotal = 0;
        this.statesLayer.features.forEach(feature => {
            const rates = this.getCancerRates(feature);
            const selectedTypes = this.selectedFilters.selectedCancerTypes && this.selectedFilters.selectedCancerTypes.length > 0
                ? this.selectedFilters.selectedCancerTypes
                : ['Kidney'];
            
            let total = 0;
            for (const type of selectedTypes) {
                const rate = this.lookupRate(rates, type);
                if (rate !== null && typeof rate === 'number') {
                    total += rate;
                }
            }
            if (total > maxTotal) maxTotal = total;
        });

        this.statesLayer.features.forEach(feature => {
            const pieData = this.generatePieChart(feature);
            const centroid = L.geoJSON(feature).getBounds().getCenter();

            // Calculate total for this feature
            const total = pieData.reduce((sum, d) => sum + d.value, 0);
            
            // Calculate radius
            const maxRadius = 40; 
            const minRadius = 1;
            let radius = minRadius;
            
            if (maxTotal > 0 && total > 0) {
                radius = Math.sqrt(total / maxTotal) * maxRadius;
                if (radius < minRadius) radius = minRadius;
            } else if (total === 0) {
                return; // Skip if no data
            }

            // Create pie chart SVG
            const svg = d3.create("svg").attr("width", 80).attr("height", 80);
            const g = svg.append("g").attr("transform", "translate(40,40)");
            const arc = d3.arc().innerRadius(0).outerRadius(radius);

            g.selectAll("path")
                .data(pieData)
                .enter()
                .append("path")
                .attr("d", arc)
                .attr("fill", (d) => cancerColorScale(d.data.key));

            const icon = L.divIcon({
                className: '',
                html: svg.node().outerHTML,
                iconSize: [80, 80],
                iconAnchor: [40, 40]
            });

            const marker = L.marker([centroid.lat, centroid.lng], {icon: icon}).addTo(map);
            this.markers.push(marker);
            
            const leafletTooltip = L.tooltip({direction: 'top', offset: [0, -20], className: 'pie-tooltip'})
                .setContent(this.createTooltip(feature));

            const attachPathListeners = () => {
                const el = marker.getElement();
                if (!el) return;
                
                el.style.pointerEvents = 'none';
                el.querySelectorAll('path').forEach(path => {
                    path.style.pointerEvents = 'auto';
                    path.style.cursor = 'pointer';
                    path.addEventListener('mouseenter', () => map.openTooltip(leafletTooltip, marker.getLatLng()));
                    path.addEventListener('mouseleave', () => map.closeTooltip(leafletTooltip));
                });
            };

            marker.getElement() ? attachPathListeners() : marker.on('add', attachPathListeners);
        });
    }

    createLegend() {
        const legend = document.getElementById('legend');
        
        // Use selectedCancerTypes instead of all CANCER_TYPES for the legend
        const typesToShow = this.selectedFilters.selectedCancerTypes && this.selectedFilters.selectedCancerTypes.length > 0
            ? this.selectedFilters.selectedCancerTypes
            : ['Pancreatic']; // Default to Pancreatic if nothing selected (matches data capitalization)

        legend.innerHTML = '<h4>Selected Cancer Types</h4>' +
            typesToShow.map((type) =>
                `<div><span style="background: ${cancerColorScale(type)}; width: 15px; height: 15px; display: inline-block; margin-right: 5px;"></span>${type}</div>`
            ).join('');

        const legendContainer = document.getElementsByClassName('legend-box')[0];
        if (legendContainer) legendContainer.style.height = `auto`;
    }

    /* --- Helpers --- */

    generatePieChart(values) {
        // values may be a feature object: prefer feature.cancer_rate but fall back to feature.properties
        const rates = this.getCancerRates(values);

        const selectedTypes = this.selectedFilters.selectedCancerTypes && this.selectedFilters.selectedCancerTypes.length > 0
            ? this.selectedFilters.selectedCancerTypes
            : ['Kidney']; // Default to Kidney (match data capitalization)

        const pieData = selectedTypes
            .map(type => {
                // support case-insensitive keys in the rates object
                const rate = this.lookupRate(rates, type);
                return { key: type, value: rate };
            })
            .filter(d => d.value !== null && typeof d.value === 'number');

        const pie = d3.pie()
            .value(d => d.value);

        return pie(pieData);
    }

    createTooltip(feature) {
        const county_name = (feature.properties && (feature.properties.NAME || feature.properties.name)) || '';
        const state_name = feature.properties && (feature.properties.state_name || feature.properties.name) || '';
        const name = county_name ? `${county_name}, ${state_name}` : state_name || (feature.id || '');
        var tooltipContent = `<strong>${name}</strong><br/>`;

        const rates = this.getCancerRates(feature);

        const typesToShow = this.selectedFilters.selectedCancerTypes && this.selectedFilters.selectedCancerTypes.length > 0
            ? this.selectedFilters.selectedCancerTypes
            : ['Kidney'];

        for (const type of typesToShow) {
            const rate = this.lookupRate(rates, type);
            tooltipContent += `<div>${type}: ${rate !== null && typeof rate === 'number' ? Math.round(10*rate)/10 : 'N/A'}</div>`;
        }
        return tooltipContent;
    }

    // Returns the cancer rates object for a feature; the new data stores rates in feature.cancer_rate
    getCancerRates(feature) {
        if (!feature) return {};
        if (feature.cancer_rate && typeof feature.cancer_rate === 'object') return feature.cancer_rate;
        if (feature.properties && feature.properties.cancer_rate && typeof feature.properties.cancer_rate === 'object') return feature.properties.cancer_rate;
        // fallback: maybe rates are at top-level of properties
        return feature.properties || {};
    }

    // Case-insensitive lookup of a cancer type in rates object
    lookupRate(ratesObj, type) {
        if (!ratesObj || !type) return null;
        // direct lookup
        if (ratesObj.hasOwnProperty(type)) return ratesObj[type];
        // try lowercase/uppercase variants and short keys
        const lower = type.toLowerCase();
        for (const k of Object.keys(ratesObj)) {
            if (k.toLowerCase() === lower) return ratesObj[k];
        }
        // try matching prefixes (e.g., 'Pancreatic' -> 'Pancreatic')
        return null;
    }
}