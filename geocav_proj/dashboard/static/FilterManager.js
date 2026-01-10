import {DEFAULT_LEAFLET_CONFIG, DEFAULT_FILTERS, COUNTY_FACTOR_FILTERS, STATE_FACTOR_FILTERS, 
    STATE_CANCER_AVAILABLE_YEARS, COUNTY_CANCER_AVAILABLE_YEARS,
    COUNTY_FACTORS_AVAILABLE_YEARS, STATE_FACTORS_AVAILABLE_YEARS,
    CANCER_TYPES_CONFIG
} from './config.js';

import {PieMap} from './maps/PieMap.js';

export class FilterManager {
    constructor(mapRenderer, regressionPlot, tableRenderer, heatmapPlot) {
        console.log('[FilterManager] Initializing FilterManager');
        this.selectedFilters = DEFAULT_FILTERS;
        this.mapRenderer = mapRenderer;
        this.regressionPlot = regressionPlot;
        this.tableRenderer = tableRenderer;
        this.heatmapPlot = heatmapPlot;
        this.isPCAActive = false; // Track if PCA is currently active

        this.initializeFilters();
        
        // update all map elements based on initial filters
        this.mapRenderer.renderMap(this.selectedFilters);
        this.regressionPlot.renderPlot(this.selectedFilters);
        this.tableRenderer.renderTable(this.selectedFilters);
        if(this.heatmapPlot) this.heatmapPlot.renderPlot(this.selectedFilters);
    }

    initializeFilters() {
        console.log('[FilterManager] Setting up filter UI elements');
        console.log('[FilterManager] Initial selected filters:', DEFAULT_FILTERS);
        this.cancerSelect = document.getElementById('cancer-select');
        this.factorSelect = document.getElementById('factor-select');
        this.levelSelect = document.getElementById('level-select');
        this.genderSelect = document.getElementById('gender-select');
        this.raceSelect = document.getElementById('race-select');
        this.cancerSlider = document.getElementById('cancer-year-selector');
        this.factorSlider = document.getElementById('factor-year-selector');
        this.runPcaBtn = document.getElementById('run-pca-btn');
        this.visualizeBtn = document.getElementById('visualize-btn');
        this.analysisModeToggle = document.getElementById('analysis-mode-toggle');


        // Set default selections
        this.cancerSelect.value = this.selectedFilters.cancer_type;
        
        // Handle initial factor selection
        if (!Array.isArray(this.selectedFilters.factor)) {
            this.selectedFilters.factor = [this.selectedFilters.factor];
        }
        Array.from(this.factorSelect.options).forEach(option => {
            option.selected = this.selectedFilters.factor.includes(option.value);
        });

        this.levelSelect.value = this.selectedFilters.level;
        this.genderSelect.value = this.selectedFilters.gender;
        this.raceSelect.value = this.selectedFilters.race;
        this.cancerSlider.value = this.selectedFilters.cancer_year;
        this.factorSlider.value = this.selectedFilters.factor_year;

        this.addEventListeners(); // Set up event listeners for filter changes
        this.filterChanged() // Initial update based on default filters
    }

    addEventListeners() {
        if (this.visualizeBtn) {
            this.visualizeBtn.addEventListener('click', () => {
                this.updateVisualization();
            });
        }

        if (this.runPcaBtn) {
            this.runPcaBtn.addEventListener('click', () => {
                if (this.isPCAActive) {
                    // Remove PCA mode
                    this.removePCA();
                } else {
                    // Run PCA mode
                    this.runPCA();
                }
            });
        }

        const selectElements = [
            { element: 'map-select', key: 'mapType' },
            { element: this.cancerSelect, key: 'cancer_type' },
            { element: this.levelSelect, key: 'level' },
            { element: this.factorSelect, key: 'factor' },
            { element: this.genderSelect, key: 'gender' },
            { element: this.raceSelect, key: 'race' },
            { element: this.cancerSlider, key: 'cancer_year' },
            { element: this.factorSlider, key: 'factor_year' }
        ];

        selectElements.forEach(({ element, key }) => {
            const select = typeof element === 'string' ? document.getElementById(element) : element;
            select.addEventListener('change', (e) => {
                if (key === 'cancer_type') {
                    if (this.cancerSelect.hasAttribute('multiple')) {
                        this.selectedFilters.selectedCancerTypes = Array.from(this.cancerSelect.selectedOptions).map(opt => opt.value);
                    } else {
                        this.selectedFilters[key] = e.target.value;
                        this.selectedFilters.selectedCancerTypes = [e.target.value];
                    }
                } else if (key === 'factor') {
                    this.selectedFilters[key] = Array.from(this.factorSelect.selectedOptions).map(opt => opt.value);
                    // If nothing selected, maybe default to 'None' or empty array?
                    if (this.selectedFilters[key].length === 0) {
                        this.selectedFilters[key] = ['None'];
                    }
                } else {
                    this.selectedFilters[key] = (key === 'cancer_year' || key === 'factor_year') 
                        ? parseInt(e.target.value) 
                        : e.target.value;
                }
                this.filterChanged();
            });
        });
    }

    filterChanged() {
        console.log('[FilterManager] Filters changed:', this.selectedFilters);
        // update filter-dependent UI elements if needed
        this.FilterUpdate(); // Make sure factors are updated based on level
        this.raceGenderToggle(); // Ensure race/gender toggling is respected
        this.updateCancerOptions();
        this.checkMultiSelect(); // Adjust cancer type select for pie map multi-select
    }

    updateVisualization() {
        console.log('[FilterManager] Visualize button clicked. Updating plots with:', this.selectedFilters);
        // Then update the map and regression plot based on new filters / new selections
        this.mapRenderer.renderMap(this.selectedFilters);
        this.regressionPlot.renderPlot(this.selectedFilters);
        this.tableRenderer.renderTable(this.selectedFilters);

        // Update PCA placeholder or clear data if filters change?
        if(this.heatmapPlot) {
             // Optional: reset or notify user to re-run PCA
             this.heatmapPlot.renderPlot(this.selectedFilters);
        }
    }

    updateCancerOptions() {
        const gender = this.selectedFilters.gender;
        
        // Define available cancers
        let availableCancers = [...CANCER_TYPES_CONFIG.COMMON];
        
        if (gender === 'Female') {
            availableCancers.push(...CANCER_TYPES_CONFIG.FEMALE_ONLY);
        }
        if (gender === 'Male') {
            availableCancers.push(...CANCER_TYPES_CONFIG.MALE_ONLY);
        }
        
        const order = CANCER_TYPES_CONFIG.ORDER;
        availableCancers.sort((a, b) => order.indexOf(a) - order.indexOf(b));

        // Rebuild options
        this.cancerSelect.innerHTML = '';
        availableCancers.forEach(cancer => {
            const option = document.createElement('option');
            option.value = cancer;
            option.textContent = cancer === 'None' ? 'None' : cancer + ' Cancer';
            this.cancerSelect.appendChild(option);
        });

        // Validate and update selected filters
        if (!availableCancers.includes(this.selectedFilters.cancer_type)) {
             const newSelection = availableCancers.includes('Pancreatic') ? 'Pancreatic' : availableCancers[0];
             this.selectedFilters.cancer_type = newSelection;
        }
        
        if (this.selectedFilters.selectedCancerTypes) {
            this.selectedFilters.selectedCancerTypes = this.selectedFilters.selectedCancerTypes.filter(c => availableCancers.includes(c));
            if (this.selectedFilters.selectedCancerTypes.length === 0) {
                this.selectedFilters.selectedCancerTypes = [this.selectedFilters.cancer_type];
            }
        }

        this.cancerSelect.value = this.selectedFilters.cancer_type;
    }

    raceGenderToggle() {
        if (this.selectedFilters.race !== 'ALL') {
            this.genderSelect.value = 'All';
            this.selectedFilters.gender = 'All';
            this.genderSelect.disabled = true;
        }
        else if (this.selectedFilters.gender !== 'All') {
            this.raceSelect.value = 'ALL';
            this.selectedFilters.race = 'ALL';
            this.raceSelect.disabled = true;
        }
        else {
            this.raceSelect.disabled = false;
            this.genderSelect.disabled = false;
        }
    }

    FilterUpdate() {
        this.factorSelect.innerHTML = ''; // Clear existing options
        
        // Determine which filter list to use
        const filterList = this.selectedFilters.level === 'state' 
            ? STATE_FACTOR_FILTERS 
            : COUNTY_FACTOR_FILTERS;
        
        // Populate options
        filterList.forEach(factor => {
            const option = document.createElement('option');
            option.value = factor;
            option.text = factor.replace(/_/g, ' ');
            this.factorSelect.appendChild(option);
        });
        
        // Handle factor selection (array or string)
        let currentFactors = Array.isArray(this.selectedFilters.factor) 
            ? this.selectedFilters.factor 
            : [this.selectedFilters.factor];

        // Filter out invalid factors
        currentFactors = currentFactors.filter(f => filterList.includes(f));

        // If no valid factors, default to first one
        if (currentFactors.length === 0) {
            currentFactors = [filterList[0]];
        }
        
        this.selectedFilters.factor = currentFactors;

        // Update the select element to match the current filter
        Array.from(this.factorSelect.options).forEach(option => {
            option.selected = currentFactors.includes(option.value);
        });

        // Clear current slider options
        this.cancerSlider.innerHTML = '';
        this.factorSlider.innerHTML = '';

        // Update cancer years
        let availableCancerYears = this.selectedFilters.level === 'state'
            ? STATE_CANCER_AVAILABLE_YEARS[this.selectedFilters.cancer_type]
            : COUNTY_CANCER_AVAILABLE_YEARS[this.selectedFilters.cancer_type];

        // Ensure current cancer year is valid
        if (!availableCancerYears.includes(this.selectedFilters.cancer_year)) {
             if (availableCancerYears.length > 0) {
                 this.selectedFilters.cancer_year = availableCancerYears[0];
             }
        }

        availableCancerYears.forEach(year => {
            const option = document.createElement('option');
            option.value = parseInt(year);
            option.textContent = year;
            if (year == this.selectedFilters.cancer_year) option.selected = true;
            this.cancerSlider.appendChild(option);
        });

        // Update factor years
        const firstFactor = Array.isArray(this.selectedFilters.factor) ? this.selectedFilters.factor[0] : this.selectedFilters.factor;
        let availableFactorYears = this.selectedFilters.level === 'state'
            ? STATE_FACTORS_AVAILABLE_YEARS[firstFactor]
            : COUNTY_FACTORS_AVAILABLE_YEARS[firstFactor];

        // Ensure current factor year is valid
        if (!availableFactorYears.includes(this.selectedFilters.factor_year)) {
             if (availableFactorYears.length > 0) {
                 this.selectedFilters.factor_year = availableFactorYears[0];
             }
        }

        availableFactorYears.forEach(year => {
            const option = document.createElement('option');
            option.value = parseInt(year);
            option.textContent = year;
            if (year == this.selectedFilters.factor_year) option.selected = true;
            this.factorSlider.appendChild(option);
        });
    }

    checkMultiSelect() {
        if (this.selectedFilters.mapType === 'pie') {
            this.setupMultiSelect();
        } else {
            this.setupSingleSelect();
        }
    }

    setupMultiSelect() {
        this.cancerSelect.setAttribute('multiple', 'multiple');
        this.cancerSelect.style.height = '120px';
        
        if (this.selectedFilters.selectedCancerTypes && this.selectedFilters.selectedCancerTypes.length > 0) {
            Array.from(this.cancerSelect.options).forEach(opt => {
                opt.selected = this.selectedFilters.selectedCancerTypes.includes(opt.value);
            });
        }
    }

    setupSingleSelect() {
        const selectedValues = Array.from(this.cancerSelect.selectedOptions).map(opt => opt.value);
        
        this.cancerSelect.removeAttribute('multiple');
        this.cancerSelect.style.height = 'auto';
        
        if (selectedValues.length > 0) {
            this.cancerSelect.value = selectedValues[0];
            this.selectedFilters.cancer_type = selectedValues[0];
            this.selectedFilters.selectedCancerTypes = [selectedValues[0]];
        } else if (this.cancerSelect.options.length > 0) {
            this.cancerSelect.options[0].selected = true;
            this.selectedFilters.cancer_type = this.cancerSelect.value;
            this.selectedFilters.selectedCancerTypes = [this.cancerSelect.value];
        }
    }

    runPCA() {
        const factors = this.selectedFilters.factor;
        if (!factors || factors.length < 2) {
            alert("Please select at least 2 factors to run PCA.");
            return;
        }
        
        // Set PCA as active
        this.isPCAActive = true;
        
        // Lock factor filters
        this.factorSelect.disabled = true;
        this.factorSelect.style.opacity = '0.6';
        this.factorSelect.style.cursor = 'not-allowed';
        
        // Update button text and styling
        this.runPcaBtn.textContent = 'Remove PCs';
        this.runPcaBtn.style.backgroundColor = '#f44336';
        this.runPcaBtn.style.color = 'white';
        
        // Run PCA
        if (this.heatmapPlot) {
            this.heatmapPlot.runPCA(this.selectedFilters);
        }
        
        console.log('[FilterManager] PCA activated - factor filters locked');
    }

    removePCA() {
        // Set PCA as inactive
        this.isPCAActive = false;
        
        // Unlock factor filters
        this.factorSelect.disabled = false;
        this.factorSelect.style.opacity = '1';
        this.factorSelect.style.cursor = 'pointer';
        
        // Update button text and styling
        this.runPcaBtn.textContent = 'Run PCA';
        this.runPcaBtn.style.backgroundColor = '';
        this.runPcaBtn.style.color = '';
        
        // Clear PCA visualization
        if (this.heatmapPlot) {
            this.heatmapPlot.clearPCA();
        }
        
        console.log('[FilterManager] PCA deactivated - factor filters unlocked');
    }
}