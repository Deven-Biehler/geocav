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
        
        container.innerHTML = '<div style="text-align: center; padding: 20px;">Loading table data...</div>';

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
            container.innerHTML = `<div style="color: red; padding: 20px;">Error loading table data: ${error.message}</div>`;
        }
    }

    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        if (this.data.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">No data available for the current selection.</div>';
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

        // Generate rows
        const rows = displayData.map((row) => {
            const cells = this.columns.map(col => {
                let val = row[col.key];
                // Basic formatting for numbers
                if (typeof val === 'number') {
                     // Decide on precision based on magnitude? or just fixed 2
                     val = val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                }
                return `<td>${val !== undefined && val !== null ? val : 'N/A'}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        // Inject table HTML with styles
        container.innerHTML = `
            <style>
                .table-card {
                    width: 40%;
                    border: 1px solid #ccc;
                    background: #fff;
                    border-radius: 4px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    margin: 20px 0;
                    display: flex;
                    flex-direction: column;
                }
                .table-header {
                    background: #f8f9fa;
                    padding: 10px 15px;
                    border-bottom: 1px solid #ddd;
                    font-weight: bold;
                    color: #333;
                }
                .table-body {
                    max-height: 500px;
                    overflow-y: auto;
                }
                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-family: sans-serif;
                    font-size: 14px;
                }
                .data-table th, .data-table td {
                    padding: 10px 15px;
                    border-bottom: 1px solid #eee;
                    text-align: left;
                    color: #333;
                }
                .data-table th {
                    background: #fff;
                    position: sticky;
                    top: 0;
                    border-bottom: 2px solid #ddd;
                    font-weight: 600;
                    z-index: 1;
                    box-shadow: 0 2px 2px -1px rgba(0, 0, 0, 0.1);
                    cursor: pointer;
                    user-select: none;
                }
                .data-table th:hover {
                    background-color: #f0f0f0;
                }
                .data-table tr:nth-child(even) {
                    background-color: #f9f9f9;
                }
                .data-table tr:hover {
                    background-color: #f0f0f0;
                }
                .sort-icon {
                    margin-left: 5px;
                    font-size: 0.8em;
                    color: #888;
                }
            </style>
            <div class="table-card">
                <div class="table-header">
                    <strong>Data Table - ${this.filters && this.filters.level ? this.filters.level.charAt(0).toUpperCase() + this.filters.level.slice(1) : ''} Level</strong>
                    <span style="font-weight:normal; margin-left:10px;">(Showing ${displayData.length} records)</span>
                </div>
                <div class="table-body">
                    <table class="data-table">
                        <thead>
                            <tr>
                                ${this.columns.map(col => {
                                    let sortIcon = '↕';
                                    if (this.sortState.key === col.key) {
                                        sortIcon = this.sortState.direction === 'asc' ? '↑' : '↓';
                                    }
                                    return `<th data-key="${col.key}">${col.header} <span class="sort-icon">${sortIcon}</span></th>`;
                                }).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Attach event listeners for sorting
        const headers = container.querySelectorAll('.data-table th');
        headers.forEach(th => {
            th.addEventListener('click', () => {
                const key = th.getAttribute('data-key');
                if (key) {
                    this.handleSort(key);
                }
            });
        });
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