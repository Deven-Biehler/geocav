import {cancerColorScale} from '../config.js';

export class PieMap {
    constructor(selectedFilters) {
        this.markers = [];
        this.selectedFilters = selectedFilters;
    }

    async renderMap(map, data) {
        console.log('[PieMap] Rendering pie map with data: ', data);
        this.statesLayer = data;
        this.createTitle();
        this.updateMap(map);
    }

    createTitle() {
        console.log('[PieMap] Creating title for pie map');
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

    async updateMap(map) {

        // Remove existing markers
        console.log('[PieMap] Removing', this.markers.length, 'existing markers');
        this.markers.forEach(marker => map.removeLayer(marker));
        this.markers = [];
        

        // Create legend
        this.createLegend();

        // Calculate max total for scaling radii
        const radius = 20

        this.statesLayer.features.forEach((feature, idx) => {
            const pieData = this.generatePieChart(feature);
            
            // Get centroid of the feature
            const layer = L.geoJSON(feature);
            const bounds = layer.getBounds();
            let centroid = bounds.getCenter();
            // Create pie chart SVG
            const svg = d3.create("svg").attr("width", 100).attr("height", 100);
            const g = svg.append("g").attr("transform", "translate(40,40)");
            const arc = d3.arc().innerRadius(0).outerRadius(radius);

            g.selectAll("path")
                .data(pieData)
                .enter()
                .append("path")
                .attr("d", arc)
                .attr("fill", (d) => {
                    const baseColor = cancerColorScale(d.data.cancer_type);
                    if (d.data.gender === 'Male') return d3.rgb(baseColor).darker(0.5);
                    if (d.data.gender === 'Female') return d3.rgb(baseColor).brighter(0.5);
                    return baseColor;
                });

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

        legend.innerHTML = '<h4>Selected Cancer Types</h4>' +
            this.selectedFilters.selectedCancerTypes.map((type) => {
                const baseColor = cancerColorScale(type);
                const maleColor = d3.rgb(baseColor).darker(0.5);
                const femaleColor = d3.rgb(baseColor).brighter(0.5);
                return `<div>
                    <span style="background: ${baseColor}; width: 15px; height: 15px; display: inline-block; margin-right: 5px;"></span>${type}
                    <div style="font-size: 0.8em; margin-left: 20px;">
                        <span style="background: ${maleColor}; width: 10px; height: 10px; display: inline-block; margin-right: 5px;"></span>Male
                        <span style="background: ${femaleColor}; width: 10px; height: 10px; display: inline-block; margin-right: 5px;"></span>Female
                    </div>
                </div>`;
            }).join('');

        const legendContainer = document.getElementsByClassName('legend-box')[0];
        if (legendContainer) legendContainer.style.height = `auto`;
    }

    /* --- Helpers --- */

    generatePieChart(feature) {
        // values may be a feature object: prefer feature.cancer_rate but fall back to feature.properties
        if (!feature.rate) {
             console.warn('[PieMap] generatePieChart: No rates found for values', feature);
        }
        console.log('[PieMap] Generating pie chart data for feature:', feature);

        let filteredRates = [];
        let pieData = [];

        // Filter only selected cancer types
        this.selectedFilters.selectedCancerTypes.forEach(cancer_type => {
            console.log('[PieMap] Processing cancer type for pie chart:', cancer_type);
            if (cancer_type in feature.rate) {
                filteredRates[cancer_type] = feature.rate[cancer_type];
                console.log('[PieMap] Added rates for', cancer_type, ':', feature.rate[cancer_type]);
            }
        });

        console.log('[PieMap] Filtered rates for feature:', filteredRates);

        // Build correct data dict:
        Object.entries(filteredRates).forEach(([cancer_type, rates]) => {
            console.log('[PieMap] Processing rates for cancer type:', cancer_type, 'with rates:', rates);
            if (rates.MALE) { // Check for existence
                pieData.push({ // push male rates
                cancer_type, // cancer type
                gender: "Male", // label for sex
                value: rates.MALE // value to plot
                });
                console.log('[PieMap] Adding pie data for', cancer_type, 'Male:', rates.MALE);
            }
            if (rates.FEMALE) { // Check for existence
                pieData.push({ // push female rates
                cancer_type, // cancer type
                gender: "Female", // label for sex
                value: rates.FEMALE // value to plot
                });
                console.log('[PieMap] Adding pie data for', cancer_type, 'Female:', rates.FEMALE);
            }
        });

        // Build pie data structure
        const pie = d3.pie()
            .value(d => d.value)
            .sort(null);

        console.log('[PieMap] Generated pie data:', pieData);
        return pie(pieData); // Return pie layout data
    }

    createTooltip(feature) {
        const county_name = (feature.properties && (feature.properties.NAME || feature.properties.name)) || '';
        const state_name = feature.properties && (feature.properties.state_name || feature.properties.name) || '';
        const name = county_name ? `${county_name}, ${state_name}` : state_name || (feature.id || '');
        var tooltipContent = `<strong>${name}</strong><br/>`;

        const rates = feature.cancer_rate;

        const typesToShow = this.selectedFilters.selectedCancerTypes && this.selectedFilters.selectedCancerTypes.length > 0
            ? this.selectedFilters.selectedCancerTypes
            : ['Kidney'];

        return tooltipContent;
    }
}