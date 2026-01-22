import {cancerColorScale} from '../config.js';

export class PieMap {
    constructor(selectedFilters) {
        this.markers = [];
        this.selectedFilters = selectedFilters;
    }

    async renderMap(map, data) {
        console.log('[PieMap] Rendering pie map');
        this.statesLayer = data;
        this.createTitle();
        this.updateMap(map, this.selectedFilters.level);
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
        console.log('[PieMap] Updating map with level:', level);
        if (level) {
            this.selectedFilters.level = level;
        }
        
        // Remove existing markers
        console.log('[PieMap] Removing', this.markers.length, 'existing markers');
        this.markers.forEach(marker => map.removeLayer(marker));
        this.markers = [];
        
        this.createLegend();
        
        // Calculate max total for scaling
        let maxTotal = 0;
        console.log('[PieMap] Processing', this.statesLayer.features.length, 'features');
        this.statesLayer.features.forEach((feature, idx) => {
            const rates = this.getCancerRates(feature);
            if (!rates) {
                if (idx < 5) console.warn('[PieMap] Missing rates for feature index', idx, feature);
            }
            const selectedTypes = this.selectedFilters.selectedCancerTypes && this.selectedFilters.selectedCancerTypes.length > 0
                ? this.selectedFilters.selectedCancerTypes
                : ['Kidney'];
            
            let total = 0;
            for (const type of selectedTypes) {
                const rateObj = this.lookupRate(rates, type);
                if (rateObj) {
                    if (typeof rateObj === 'number') {
                        total += rateObj;
                    } else if (typeof rateObj === 'object') {
                        if (rateObj['Male']) total += rateObj['Male'];
                        if (rateObj['Female']) total += rateObj['Female'];
                        // If we only have 'Male and Female' or similar, we might want to use that if Male/Female are missing
                        if (!rateObj['Male'] && !rateObj['Female']) {
                             Object.values(rateObj).forEach(v => { if(typeof v === 'number') total += v; });
                        }
                    }
                } else {
                    if (idx < 2) console.log(`[PieMap] Rate not found for type ${type} in feature ${feature.properties?.NAME || idx}`);
                }
            }
            if (total > maxTotal) maxTotal = total;
        });

        console.log('[PieMap] Calculated maxTotal:', maxTotal);

        this.statesLayer.features.forEach((feature, idx) => {
            const pieData = this.generatePieChart(feature);
            
            let centroid;
            try {
                const layer = L.geoJSON(feature);
                const bounds = layer.getBounds();
                if (!bounds.isValid()) {
                    console.error('[PieMap] Invalid bounds for feature', feature);
                    return;
                }
                centroid = bounds.getCenter();
            } catch (err) {
                 console.error('[PieMap] Error creating centroid for feature', feature, err);
                 return;
            }

            // Calculate total for this feature
            const total = pieData.reduce((sum, d) => sum + d.value, 0);
            
            if (idx < 3) {
                console.log(`[PieMap] Feature ${idx} (${feature.properties?.NAME}): total=${total}, radius calculation (pre-scale)...`);
            }
            
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
                .attr("fill", (d) => {
                    const baseColor = cancerColorScale(d.data.key);
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
        
        // Use selectedCancerTypes instead of all CANCER_TYPES for the legend
        const typesToShow = this.selectedFilters.selectedCancerTypes && this.selectedFilters.selectedCancerTypes.length > 0
            ? this.selectedFilters.selectedCancerTypes
            : ['Pancreatic']; // Default to Pancreatic if nothing selected (matches data capitalization)

        legend.innerHTML = '<h4>Selected Cancer Types</h4>' +
            typesToShow.map((type) => {
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

    generatePieChart(values) {
        // values may be a feature object: prefer feature.cancer_rate but fall back to feature.properties
        const rates = this.getCancerRates(values);
        if (!rates) {
             console.warn('[PieMap] generatePieChart: No rates found for values', values);
        }

        const selectedTypes = this.selectedFilters.selectedCancerTypes && this.selectedFilters.selectedCancerTypes.length > 0
            ? this.selectedFilters.selectedCancerTypes
            : ['Kidney']; // Default to Kidney (match data capitalization)

        const pieData = [];
        selectedTypes.forEach(type => {
            const rateObj = this.lookupRate(rates, type);
            if (rateObj) {
                if (typeof rateObj === 'number') {
                    pieData.push({ key: type, gender: 'All', value: rateObj });
                } else if (typeof rateObj === 'object') {
                    if (rateObj['Male']) pieData.push({ key: type, gender: 'Male', value: rateObj['Male'] });
                    if (rateObj['Female']) pieData.push({ key: type, gender: 'Female', value: rateObj['Female'] });
                    // Fallback if no Male/Female keys found but object exists
                    if (!rateObj['Male'] && !rateObj['Female']) {
                         Object.entries(rateObj).forEach(([k, v]) => {
                             if (typeof v === 'number') pieData.push({ key: type, gender: k, value: v });
                         });
                    }
                }
            } else {
                 // console.debug('[PieMap] generatePieChart: Rate object missing for type', type);
            }
        });

        const pie = d3.pie()
            .value(d => d.value)
            .sort(null);

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
            const rateObj = this.lookupRate(rates, type);
            tooltipContent += `<div><strong>${type}</strong>:</div>`;
            if (rateObj) {
                if (typeof rateObj === 'number') {
                    tooltipContent += `<div>Total: ${Math.round(10*rateObj)/10}</div>`;
                } else if (typeof rateObj === 'object') {
                    Object.entries(rateObj).forEach(([gender, val]) => {
                        tooltipContent += `<div>${gender}: ${Math.round(10*val)/10}</div>`;
                    });
                }
            } else {
                tooltipContent += `<div>N/A</div>`;
            }
        }
        return tooltipContent;
    }

    // Returns the cancer rates object for a feature; the new data stores rates in feature.cancer_rate
    getCancerRates(feature) {
        if (!feature) {
             console.error('[PieMap] getCancerRates: Feature is undefined/null');
             return {};
        }
        if (feature.cancer_rate && typeof feature.cancer_rate === 'object') return feature.cancer_rate;
        if (feature.properties && feature.properties.cancer_rate && typeof feature.properties.cancer_rate === 'object') return feature.properties.cancer_rate;
        // fallback: maybe rates are at top-level of properties
        // console.debug('[PieMap] getCancerRates: using feature.properties fallback', feature);
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