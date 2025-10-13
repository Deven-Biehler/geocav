

export class DataManager {
    constructor() {
    }

    async fetchStatesLayer(filters) {
        // Send default query parameters
        const params = new URLSearchParams();
        params.append('level', filters.level);
        params.append('cancer_type', filters.cancerType);
        params.append('gender', filters.gender || 'all');
        params.append('race', filters.race || 'all');
        params.append('cancer_year', filters.cancer_year);
        params.append('factor_year', filters.factor_year);
        const response = await fetch(`/choropleth?${params.toString()}`);
        
        const statesLayer = await response.json();
        console.log('[DataManager] Data fetched with filters:', filters, 'Data:', statesLayer);
        return statesLayer;
    }

    async fetchRegressionData(filters) {
        const params = new URLSearchParams();
        params.append('cancer_type', filters.cancerType);
        params.append('factor', filters.factor);
        params.append('level', filters.level);
        params.append('cancer_year', filters.cancer_year);
        params.append('factor_year', filters.factor_year);
        params.append('gender', filters.gender || 'all');
        params.append('race', filters.race || 'all');
        const response = await fetch(`/dashboard/regression-data?${params.toString()}`);

        const result = await response.json();
        if (result.error) {
            throw new Error(result.error + (result.debug ? ' | Debug info: ' + JSON.stringify(result.debug) : ''));
        }
        console.log('[DataManager] Regression data fetched with filters:', filters, 'Data:', result.data);
        return result.data;
    }
}