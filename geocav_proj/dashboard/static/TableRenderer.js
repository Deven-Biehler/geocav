export class TableRenderer {
    constructor(dataManager) {
        this.dataManager = dataManager;
        this.containerId = 'table-container';
        this.data = [];
        this.columns = [];
        this.sortState = { key: null, direction: 'asc' };
        this.filters = null;
    }

    async renderTable(filters) {
        this.filters = filters;
        const container = document.getElementById(this.containerId);
        if (!container) return;
        
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-message';
        loadingDiv.textContent = 'Loading table data...';
        container.innerHTML = '';
        container.appendChild(loadingDiv);

        try {
            // Re-use fetchRegressionData as it prepares the merged data structure we need
            // Note: This relies on DataManager caching data from previous calls (e.g. by MapRenderer)
            // or fetching it if missing.
            this.data = await this.dataManager.fetchRegressionData(filters);
            
            // Determine columns based on filters
            this.columns = [];
            const isCountyLevel = filters.level === 'county';
            
            this.columns.push({ header: 'State', key: 'state' });
            if (isCountyLevel) {
                this.columns.push({ header: 'County', key: 'county' });
            }
            
            // Cancer Rate Column
            this.columns.push({ header: `${filters.cancer_type} Rate`, key: 'cancer_rate' });
            
            // Factor Columns
            const factors = Array.isArray(filters.factor) ? filters.factor : [filters.factor];
            factors.forEach(f => {
                if (f && f !== 'None') {
                    // Prettify header: Replace underscores with spaces
                    const label = f.replace(/_/g, ' ');
                    this.columns.push({ header: label, key: f });
                }
            });

            this.render();
        } catch (error) {
            console.error("TableRenderer Error:", error);
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = `Error loading table data: ${error.message}`;
            container.innerHTML = '';
            container.appendChild(errorDiv);
        }
    }

    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        if (this.data.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state-message';
            emptyDiv.textContent = 'No data available for the current selection.';
            container.innerHTML = '';
            container.appendChild(emptyDiv);
            return;
        }

        // Sort data
        let displayData = [...this.data];
        if (this.sortState.key) {
            displayData.sort((a, b) => {
                let valA = a[this.sortState.key];
                let valB = b[this.sortState.key];

                // Handle null/undefined
                if (valA === valB) return 0;
                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;

                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                if (valA < valB) return this.sortState.direction === 'asc' ? -1 : 1;
                if (valA > valB) return this.sortState.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        // Build table using DOM methods
        container.innerHTML = '';
        const card = this.createTableCard(displayData);
        container.appendChild(card);

        // Attach event listeners for sorting
        const headers = card.querySelectorAll('.data-table th');
        headers.forEach(th => {
            th.addEventListener('click', () => {
                const key = th.getAttribute('data-key');
                if (key) {
                    this.handleSort(key);
                }
            });
        });
    }

    createTableCard(displayData) {
        // Create card container
        const card = document.createElement('div');
        card.className = 'table-card';

        // Create header
        const header = this.createTableHeader(displayData.length);
        card.appendChild(header);

        // Create scrollable body with table
        const body = document.createElement('div');
        body.className = 'table-body';

        const table = this.createDataTable(displayData);
        body.appendChild(table);

        card.appendChild(body);
        return card;
    }

    createTableHeader(recordCount) {
        const header = document.createElement('div');
        header.className = 'table-header';

        const title = document.createElement('strong');
        const levelText = this.filters && this.filters.level
            ? this.filters.level.charAt(0).toUpperCase() + this.filters.level.slice(1)
            : '';
        title.textContent = `Data Table - ${levelText} Level`;
        header.appendChild(title);

        const info = document.createElement('span');
        info.className = 'table-header-info';
        info.textContent = `(Showing ${recordCount} records)`;
        header.appendChild(info);

        return header;
    }

    createDataTable(displayData) {
        const table = document.createElement('table');
        table.className = 'data-table';

        // Create header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        this.columns.forEach(col => {
            const th = document.createElement('th');
            th.setAttribute('data-key', col.key);
            th.style.cursor = 'pointer';

            // Create header text
            const headerSpan = document.createElement('span');
            headerSpan.textContent = col.header;
            th.appendChild(headerSpan);

            // Add sort icon
            const sortIcon = document.createElement('span');
            sortIcon.className = 'sort-icon';
            if (this.sortState.key === col.key) {
                sortIcon.textContent = this.sortState.direction === 'asc' ? '↑' : '↓';
            } else {
                sortIcon.textContent = '↕';
            }
            th.appendChild(sortIcon);

            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create body rows
        const tbody = document.createElement('tbody');
        displayData.forEach(row => {
            const tr = document.createElement('tr');

            this.columns.forEach(col => {
                const td = document.createElement('td');
                let val = row[col.key];

                // Format numbers
                if (typeof val === 'number') {
                    val = val.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                }

                td.textContent = val !== undefined && val !== null ? val : 'N/A';
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        return table;
    }

    handleSort(key) {
        if (this.sortState.key === key) {
            // Toggle direction
            this.sortState.direction = this.sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // New column, set default sort
            this.sortState.key = key;
            this.sortState.direction = 'asc';
        }
        this.render();
    }
}