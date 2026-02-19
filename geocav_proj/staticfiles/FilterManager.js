import {DEFAULT_FILTERS} from './config.js';

export class FilterManager {
    constructor(dataManager, mapRenderer, regressionPlot, tableRenderer, pcaPlot) {
        console.log('[FilterManager] Initializing FilterManager');
        this.selectedFilters = DEFAULT_FILTERS;
        this.dataManager = dataManager;
        this.mapRenderer = mapRenderer;
        this.regressionPlot = regressionPlot;
        this.tableRenderer = tableRenderer;
        this.pcaPlot = pcaPlot;
        this.isPCAActive = false; // Track if PCA is currently active

        this.initializeFilters();
        
        // update all map elements based on initial filters
        this.mapRenderer.renderMap(this.selectedFilters);
        this.regressionPlot.renderPlot(this.selectedFilters);
        this.tableRenderer.renderTable(this.selectedFilters);
        if(this.pcaPlot) this.pcaPlot.renderPlot(this.selectedFilters);
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
        this.mapSelect = document.getElementById('map-select');
        
        // PCA related elements
        this.pcSelect = document.getElementById('pc-select');
        this.pcSelectionGroup = document.getElementById('pc-selection-group');
        this.biplotXSelect = document.getElementById('biplot-x-select');
        this.biplotYSelect = document.getElementById('biplot-y-select');
        this.biplotSelectionGroup = document.getElementById('biplot-selection-group');
        this.toggleHeatmapBtn = document.getElementById('toggle-heatmap-btn');
        this.toggleBiplotBtn = document.getElementById('toggle-biplot-btn');


        // Set default selections
        this.mapSelect.value = this.selectedFilters.mapType;
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
                this.updateSelectedFilters();
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
        
        // Factor select listener
        this.factorSelect.addEventListener('change', (e) => {
            const selectedOptions = Array.from(e.target.selectedOptions).map(option => option.value);
            this.selectedFilters.factor = selectedOptions;
            this.updateSelectedFilters();
            this.filterChanged();
        });

        // PC select listener
        if (this.pcSelect) {
            this.pcSelect.addEventListener('change', (e) => {
                const selectedPCs = Array.from(this.pcSelect.selectedOptions).map(opt => parseInt(opt.value));
                this.pcaPlot.setSelectedPCs(selectedPCs);
                console.log('[FilterManager] Selected PCs:', selectedPCs);
            });
        }

        // BiPlot axis selectors
        const onBiplotAxisChange = () => {
            const x = parseInt(this.biplotXSelect.value);
            const y = parseInt(this.biplotYSelect.value);
            this.pcaPlot.setBiplotAxes(x, y);
            console.log('[FilterManager] BiPlot axes set to:', x, y);
        };

        this.biplotXSelect.addEventListener('change', onBiplotAxisChange);
        this.biplotYSelect.addEventListener('change', onBiplotAxisChange);
        this.toggleHeatmapBtn.addEventListener('click', () => {
            this.showHeatmap(); // If heatmap button clicked, show heatmap
        });
        this.toggleBiplotBtn.addEventListener('click', () => {
            this.showBiplot(); // If biplot button clicked, show biplot
        });

        // Add listeners for dependent filters
        this.mapSelect.addEventListener('change', () => {
             this.updateSelectedFilters();
             this.filterChanged();
        });
        this.levelSelect.addEventListener('change', () => {
             this.updateSelectedFilters();
             this.filterChanged();
        });
         this.genderSelect.addEventListener('change', () => {
             this.updateSelectedFilters();
             this.filterChanged();
        });
        this.raceSelect.addEventListener('change', () => {
             this.updateSelectedFilters();
             this.filterChanged();
        });
    }

    updateSelectedFilters() {
        console.log('[FilterManager] Updating selected filters from UI. Level value:', this.levelSelect.value);
        this.selectedFilters.mapType = this.mapSelect.value;
        this.selectedFilters.cancer_type = this.cancerSelect.value;
        // Capture all selected cancer types (for pie map multi-select)
        this.selectedFilters.selectedCancerTypes = Array.from(this.cancerSelect.selectedOptions).map(opt => opt.value);
        
        this.selectedFilters.factor = Array.from(this.factorSelect.selectedOptions).map(option => option.value);
        this.selectedFilters.level = this.levelSelect.value;
        this.selectedFilters.gender = this.genderSelect.value;
        this.selectedFilters.race = this.raceSelect.value;
        this.selectedFilters.cancer_year = this.cancerSlider.value;
        this.selectedFilters.factor_year = this.factorSlider.value;
        console.log('[FilterManager] Filters updated to:', JSON.parse(JSON.stringify(this.selectedFilters)));
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
        console.log('[FilterManager] Updating visualization with filters:', JSON.parse(JSON.stringify(this.selectedFilters)));

        if (this.isPCAActive && this.pcaPlot.pcResults) {
            const pcData = {
                isPCA: true,
                pcResults: this.pcaPlot.pcResults,
                selectedPCs: this.pcaPlot.selectedPCs && this.pcaPlot.selectedPCs.length > 0 ? this.pcaPlot.selectedPCs : [0]
            };
            this.regressionPlot.renderPlot(this.selectedFilters, pcData);
            this.mapRenderer.renderMap(this.selectedFilters, pcData);
        } else {
            this.regressionPlot.renderPlot(this.selectedFilters);
            this.mapRenderer.renderMap(this.selectedFilters);
        }

        this.tableRenderer.renderTable(this.selectedFilters);

        // Update PCA placeholder or clear data if filters change?
        this.pcaPlot.renderPlot(this.selectedFilters);
    }

    updateCancerOptions() {
        const gender = this.selectedFilters.gender;
        
        // Define available cancers
        let availableCancers =  Object.keys(this.dataManager.cancer_years[this.selectedFilters.level]) || [];
        
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
            // Ensure selectedCancerTypes is an array to avoid string iteration issues
            if (!Array.isArray(this.selectedFilters.selectedCancerTypes)) {
                this.selectedFilters.selectedCancerTypes = [this.selectedFilters.selectedCancerTypes];
            }
            
            this.selectedFilters.selectedCancerTypes = this.selectedFilters.selectedCancerTypes.filter(c => availableCancers.includes(c));
            if (this.selectedFilters.selectedCancerTypes.length === 0) {
                this.selectedFilters.selectedCancerTypes = [this.selectedFilters.cancer_type];
            }
        } else {
             this.selectedFilters.selectedCancerTypes = [this.selectedFilters.cancer_type];
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
        const filterList = Object.keys(this.dataManager.factor_years[this.selectedFilters.level] || {})
        
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
        let availableCancerYears = this.dataManager.cancer_years[this.selectedFilters.level][this.selectedFilters.cancer_type] || [];

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
        let availableFactorYears = this.dataManager.factor_years[this.selectedFilters.level][firstFactor] || [];

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

    async runPCA() {
        this.updateSelectedFilters();
        const factors = this.selectedFilters.factor;
        if (!factors || factors.length < 2) {
            alert("Please select at least 2 factors to run PCA.");
            return;
        }
        
        // Set PCA as active
        this.isPCAActive = true;
        
        // Lock factor filters
        this.factorSelect.disabled = true;
        this.factorSelect.parentElement.classList.add('disabled'); // Disable the entire select group for factors
        
        // Update button text and styling
        this.runPcaBtn.textContent = 'Remove PCs';
        this.runPcaBtn.classList.add('disabled'); // Disable the button while PCA is running
        
        // Show PC selection box
        this.pcSelectionGroup.classList.add('visible'); //  Make PC selection visible
        this.biplotSelectionGroup.classList.add('visible'); // Make BiPlot selection visible
        
        // Run PCA and wait for it to complete
        await this.pcaPlot.runPCA(this.selectedFilters);
        // Populate PC select after PCA runs
        this.populatePCSelect();
        
        console.log('[FilterManager] PCA activated - factor filters locked');
    }

    removePCA() {
        // Set PCA as inactive
        this.isPCAActive = false;
        
        // Unlock factor filters
        this.factorSelect.disabled = false;
        this.factorSelect.parentElement.classList.remove('disabled'); // Enable the entire select group for factors
        
        // Update button text and styling
        this.runPcaBtn.textContent = 'Run PCA';
        this.runPcaBtn.classList.remove('disabled'); // Re-enable the button
        
        // Hide PC selection box
        this.pcSelectionGroup.classList.remove('visible');
        this.biplotSelectionGroup.classList.remove('visible');
        
        // Clear PC select
        this.pcSelect.innerHTML = '';
        this.biplotXSelect.innerHTML = '';  
        this.biplotYSelect.innerHTML = '';
        
        // Clear PCA visualization
        this.pcaPlot.clearPCA();
        this.updateVisualization();
        
        console.log('[FilterManager] PCA deactivated - factor filters unlocked');
    }

    populatePCSelect() {
        const pcResults = this.pcaPlot.pcResults;
        const n_components = pcResults.loadings.length;
        const explainedVariance = pcResults.explained_variance_ratio || [];

        // Clear existing options
        this.pcSelect.innerHTML = '';

        // Add options for each PC
        for (let i = 0; i < n_components; i++) {
            const variance = explainedVariance[i] ? `(${(explainedVariance[i] * 100).toFixed(1)}%)` : '';

            const option = document.createElement('option');
            option.value = i;
            option.textContent = `PC${i + 1} ${variance}`;
            this.pcSelect.appendChild(option);

            const optionX = document.createElement('option');
            optionX.value = i;
            optionX.textContent = `PC${i + 1} ${variance}`;
            this.biplotXSelect.appendChild(optionX);

            const optionY = document.createElement('option');
            optionY.value = i;
            optionY.textContent = `PC${i + 1} ${variance}`;
            this.biplotYSelect.appendChild(optionY);
        }

        // Default BiPlot axes to PC1 vs PC2 (or PC1 if only one component)
        if (this.biplotXSelect && this.biplotYSelect) {
            const defaultX = 0;
            const defaultY = n_components > 1 ? 1 : 0;
            this.biplotXSelect.value = defaultX.toString();
            this.biplotYSelect.value = defaultY.toString();
            if (this.pcaPlot) {
                this.pcaPlot.setBiplotAxes(defaultX, defaultY);
            }
        }

        console.log('[FilterManager] PC select populated with', n_components, 'components');
    }

    showHeatmap() {
        const heatmapView = document.getElementById('PCA-container');
        const biplotView = document.getElementById('biplot-container');
        
        heatmapView.classList.add('active');
        biplotView.classList.remove('active');
        this.toggleHeatmapBtn.classList.add('active');
        this.toggleBiplotBtn.classList.remove('active');
    }

    showBiplot() {
        const heatmapView = document.getElementById('PCA-container');
        const biplotView = document.getElementById('biplot-container');
        
        heatmapView.classList.remove('active');
        biplotView.classList.add('active');
        this.toggleHeatmapBtn.classList.remove('active');
        this.toggleBiplotBtn.classList.add('active');
    }
}