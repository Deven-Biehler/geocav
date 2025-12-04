import { DATA_FIELD_MAPPING } from './config.js';

export class DataManager {
    constructor() {
    }

    async fetchStatesLayer(filters) { // filters: {level: 'state' | 'county'}
        // Send default query parameters
        const params = new URLSearchParams();
        params.append('level', filters.level);
        const response = await fetch(`/get_geojson?${params.toString()}`);
        const geojson = await response.json();
        const statesLayer = this.addGeoJSONProperties(geojson, filters.level, this.cancer_data, this.factor_data);
        console.log('[DataManager] Data fetched with filters:', filters, 'Data:', statesLayer);
        return statesLayer;
    }

    async fetchRegressionData(selectedFilters) {
        // Use pre-saved data to fetch regression data if available
        if (this.cancerData == null || this.factor_data == null) {
            console.log('[DataManager] Regression data not found in cache, fetching data...');
            let result = await this.fetchData(selectedFilters);
        }

        const result = Object.keys(this.cancer_data).reduce((acc, key) => {
            if (key in this.factor_data) {
                acc.push({
                    state: this.cancer_data[key][DATA_FIELD_MAPPING.STATE],
                    county: this.cancer_data[key][DATA_FIELD_MAPPING.COUNTY],
                    cancer_rate: this.cancer_data[key][DATA_FIELD_MAPPING.CANCER_RATE],
                    factor_value: this.factor_data[key][DATA_FIELD_MAPPING.FACTOR_VALUE]
                });
            }
            return acc;
        }, []);
        console.log('[DataManager] Regression data prepared:', result);
        return result;
    }

    async fetchData(filters) {
        console.log('[DataManager] Fetching data with filters:', filters);
        // Sends query parameters to backend and fetches data for cancer and factor related to filters
        const params = new URLSearchParams();
        params.append('level', filters.level);
        params.append('cancer_type', filters.cancer_type);
        params.append('factor', filters.factor);
        params.append('cancer_year', parseInt(filters.cancer_year));
        params.append('factor_year', parseInt(filters.factor_year));
        params.append('gender', filters.gender || 'all');
        params.append('race', filters.race || 'all');
        const response = await fetch(`/get_data?${params.toString()}`);
        const result = await response.json();
        if (result.error) {
            throw new Error(result.error + (result.debug ? ' | Debug info: ' + JSON.stringify(result.debug) : ''));
        }
        console.log('[DataManager] Data fetched with filters:', filters, 'Data:', result.data);
        this.cancer_data = result.cancer_data;
        this.factor_data = result.factor_data;
        return result;
    }

    addGeoJSONProperties(geojson, level, cancerData, factorData) {
        // Preprocessing step to merge GeoJSON features with cancer and factor data based on level (state or county)
        console.log('[DataManager] Merging GeoJSON with cancer and factor data for level:', level);
        console.log('[DataManager] Cancer Data Sample:', Object.entries(cancerData).slice(0, 5));
        console.log('[DataManager] Factor Data Sample:', Object.entries(factorData).slice(0, 5));
        geojson.features.forEach((feature, i) => {
            const statefp = level === 'county' 
                ? feature.properties.STATEFP 
                : feature.id;
            
            const countyfp = level === 'county' 
                ? feature.properties.COUNTYFP
                : 'All';
            
            const key = level === 'state' 
                ? statefp 
                : statefp + countyfp;
            
            geojson.features[i].cancer_rate = cancerData[key]?.rate;
            geojson.features[i].factor_value = factorData[key]?.rate;
        });
        
        return geojson;
    }

    async getPieData(filters) {
        // Sends query parameters to backend and fetches data for pie chart related to filters
        const params = new URLSearchParams();
        params.append('level', filters.level);
        params.append('cancer_year', filters.cancer_year);
        params.append('factor', filters.factor);
        params.append('factor_year', filters.factor_year);
        params.append('gender', filters.gender || 'all');
        params.append('race', filters.race || 'all');
        const response = await fetch(`/get_pie_data?${params.toString()}`);
        const result = await response.json();
        if (result.error) {
            throw new Error(result.error + (result.debug ? ' | Debug info: ' + JSON.stringify(result.debug) : ''));
        }

        console.log('[DataManager] Pie data fetched with filters:', filters, 'Data:', result.data);
        this.cancer_data = result.cancer_data;

        // Add geojson properties
        const geojsonResponse = await fetch(`/get_geojson?level=${filters.level}`);
        const geojson = await geojsonResponse.json();
        const statesLayer = this.addGeoJSONProperties(geojson, filters.level, this.cancer_data, {});
        return statesLayer;
    }
}