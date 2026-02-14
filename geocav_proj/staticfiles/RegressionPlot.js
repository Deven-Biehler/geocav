import { FACTORS_UNITS } from './config.js';
import { calculateMultipleLinearRegression, calculateLinearRegression } from './mathUtils.js';
import { addRegressionAxes, addRegressionLabels, addRegressionTitle, addLinearRegressionLine, addPredictionIdentityLine, addDataPoints, addRSquaredLabel } from './plotUtils.js';

export class RegressionPlot {
    constructor(dataManager) {
        console.log('[Regression Plot] Initializing RegressionPlot');
        this.dataManager = dataManager;
        
        // Set up margins and dimensions
        this.margin = {top: 20, right: 30, bottom: 40, left: 50};
        this.width = 300;
        this.height = 280;
        this.colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    }

    async renderPlot(selectedFilters, pcData = null) {
        /* Render regression plot based on selected filters */
        try {
            let data = await this.dataManager.fetchRegressionData(selectedFilters); // Fetch data based on filters
            
            // If PCA is active, compute PC scores for each data point
            if (pcData && pcData.isPCA) {
                data = this.computePCForRegression(data, pcData);
            }
            
            d3.select('#regression-plot').selectAll('*').remove(); // Clear any existing plot
            const svg = d3.select('#regression-plot') // Create SVG container
                .append("svg")
                    .attr('width', this.width + this.margin.left + this.margin.right)
                    .attr('height', this.height + this.margin.top + this.margin.bottom)
                .append("g")
                    .attr('transform', 'translate(' + this.margin.left + ',' + this.margin.top + ')');

            if (pcData && pcData.isPCA) {
                // For PCA, always render single regression with PC score
                this.renderSingleRegression(svg, data, 'PC_score', selectedFilters, pcData);
            } else if (selectedFilters.factor.length > 1) {
                this.renderMultipleRegression(svg, data, selectedFilters.factor, selectedFilters);
            } else {
                this.renderSingleRegression(svg, data, selectedFilters.factor[0], selectedFilters);
            }
        } catch (error) {
            console.error('[RegressionPlot] Error rendering plot:', error);
            d3.select('#regression-plot').selectAll('*').remove();
            d3.select('#regression-plot')
                .append("div")
                .style("color", "red")
                .style("text-align", "center")
                .style("padding", "20px")
                .style("height", "100%")
                .style("display", "flex")
                .style("align-items", "center")
                .style("justify-content", "center")
                .html(`<strong>Error:</strong> ${error.message}`);
        }
    }

    computePCForRegression(data, pcData) {
        const pcResults = pcData.pcResults;
        const selectedPCs = pcData.selectedPCs;
        const pcIndex = selectedPCs[0]; // Use first selected PC
        const loadings = pcResults.loadings[pcIndex];
        const factorNames = pcResults.factor_names;
        const factorMeans = pcResults.factor_means || [];
        const factorStds = pcResults.factor_stds || [];
        
        console.log('[RegressionPlot] Computing PC scores for regression data');
        
        // Calculate means and stds from the data if not provided
        let computedMeans = factorMeans.length > 0 ? factorMeans : new Array(factorNames.length).fill(0);
        let computedStds = factorStds.length > 0 ? factorStds : new Array(factorNames.length).fill(1);
        
        // If means/stds not provided, compute them from the data
        if (computedMeans.length === 0 || computedMeans.every(m => m === 0)) {
            console.log('[RegressionPlot] Computing means and stds from regression data...');
            computedMeans = new Array(factorNames.length).fill(0);
            computedStds = new Array(factorNames.length).fill(0);
            const counts = new Array(factorNames.length).fill(0);
            
            // First pass: compute means
            data.forEach((point) => {
                factorNames.forEach((factorName, idx) => {
                    const value = point[factorName];
                    if (value !== undefined && value !== null && !isNaN(value)) {
                        computedMeans[idx] += value;
                        counts[idx]++;
                    }
                });
            });
            
            computedMeans = computedMeans.map((sum, idx) => counts[idx] > 0 ? sum / counts[idx] : 0);
            
            // Second pass: compute stds
            data.forEach((point) => {
                factorNames.forEach((factorName, idx) => {
                    const value = point[factorName];
                    if (value !== undefined && value !== null && !isNaN(value)) {
                        computedStds[idx] += Math.pow(value - computedMeans[idx], 2);
                    }
                });
            });
            
            computedStds = computedStds.map((sum, idx) => counts[idx] > 0 ? Math.sqrt(sum / counts[idx]) : 1);
        }
        
        // Compute PC score for each data point
        data.forEach((point) => {
            let pcScore = 0;
            
            factorNames.forEach((factorName, idx) => {
                const factorValue = point[factorName];
                const loading = loadings[idx];
                
                if (factorValue !== undefined && factorValue !== null && !isNaN(factorValue)) {
                    let standardizedValue = factorValue;
                    if (computedStds[idx] && computedStds[idx] !== 0) {
                        const mean = computedMeans[idx] || 0;
                        standardizedValue = (factorValue - mean) / computedStds[idx];
                    }
                    
                    pcScore += standardizedValue * loading;
                }
            });
            
            point['PC_score'] = pcScore;
        });
        
        return data;
    }

    renderSingleRegression(svg, data, factor, selectedFilters, pcData = null) {
        /* Render single factor regression plot */
        console.log('[Regression Plot] Rendering single regression for factor:', factor);

        // Calculate actual data domains
        const xExtent = d3.extent(data, d => +d[factor]);
        const yExtent = d3.extent(data, d => +d["cancer_rate"]);
        
        const x = d3.scaleLinear()
            .domain(xExtent)
            .range([0, this.width]);

        const y = d3.scaleLinear()
            .domain(yExtent)
            .range([this.height, 0]);

        const regressionLine = calculateLinearRegression(data, factor, "cancer_rate");
        
        // Prepare labels
        let cancerLabel = selectedFilters.cancer_type + " Cancer Rate Per 100,000";
        if (selectedFilters.gender && selectedFilters.gender !== 'all') {
            cancerLabel += ` (${selectedFilters.gender})`;
        }
        if (selectedFilters.race && selectedFilters.race !== 'all') {
            cancerLabel += ` (${selectedFilters.race})`;
        }
        
        let factorLabel;
        if (pcData && pcData.isPCA) {
            const pcIndex = pcData.selectedPCs[0];
            const explainedVariance = pcData.pcResults.explained_variance_ratio[pcIndex];
            const variancePercent = explainedVariance ? (explainedVariance * 100).toFixed(1) : '';
            factorLabel = `PC${pcIndex + 1}${variancePercent ? ` (${variancePercent}% variance explained)` : ''}`;
        } else {
            const factorUnit = FACTORS_UNITS[factor] || '';
            factorLabel = factor.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') + (factorUnit ? ` (${factorUnit})` : '');
        }

        const line = d3.line()
            .x(d => x(d.x))
            .y(d => y(d.y));

        // Generate points for regression line
        const regressionPoints = [
            { x: xExtent[0], y: regressionLine.slope * xExtent[0] + regressionLine.intercept },
            { x: xExtent[1], y: regressionLine.slope * xExtent[1] + regressionLine.intercept }
        ];

        // Add regression line and axes
        addLinearRegressionLine(svg, regressionPoints, line);
        addRegressionAxes(svg, x, y, this.height);
        addRegressionLabels(svg, factorLabel, cancerLabel, this.width, this.height, this.margin);

        // Add title
        let titleFactorName;
        if (pcData && pcData.isPCA) {
            const pcIndex = pcData.selectedPCs[0];
            titleFactorName = `PC${pcIndex + 1}`;
        } else {
            titleFactorName = factor.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        }
        addRegressionTitle(svg, `${selectedFilters.cancer_type} vs ${titleFactorName} (${selectedFilters.level.charAt(0).toUpperCase() + selectedFilters.level.slice(1)})`, this.width);

        // Add data points
        addDataPoints(svg, data, x, y, factor, "cancer_rate", this.colorScale);

        // Add R-squared label
        addRSquaredLabel(svg, regressionLine.rSquared, this.width, regressionLine.correlation);

        this.addTooltip(svg, factor);
    }

    renderMultipleRegression(svg, data, factors, selectedFilters) {
        console.log('[Regression Plot] Rendering multiple regression for factors:', factors);
        
        // Prepare data for multiple regression
        // Filter out data points with missing values
        const validData = data.filter(d => {
            if (d.cancer_rate == null) return false;
            for (const f of factors) {
                if (d[f] == null) return false;
            }
            return true;
        });

        if (validData.length < factors.length + 1) {
            throw new Error("Not enough data points for regression");
        }

        // X matrix: [1, x1, x2, ...]
        const X = validData.map(d => [1, ...factors.map(f => +d[f])]);
        // Y vector: [y]
        const Y = validData.map(d => +d.cancer_rate);

        const { beta, predictedY, rSquared } = calculateMultipleLinearRegression(X, Y);

        const n = validData.length;                    // number of observations
        const p = factors.length;                      // number of predictors (excluding intercept)

        let adjustedRSquared = rSquared;
        if (p > 1) {  // Only adjust if more than 1 predictor
            adjustedRSquared = 1 - (1 - rSquared) * (n - 1) / (n - p - 1);
        }
        
        if (adjustedRSquared < 0) adjustedRSquared = 0; // negative adjusted R² means poor fit

        // Plot Predicted vs Actual
        const plotData = validData.map((d, i) => ({
            actual: Y[i],
            predicted: predictedY[i],
            state: d.state,
            county: d.county
        }));

        // Calculate unified extent to make x and y scales equally sized
        const allValues = plotData.flatMap(d => [d.predicted, d.actual]);
        const extent = d3.extent(allValues);
        // Add 5% padding
        const padding = (extent[1] - extent[0]) * 0.05;
        const unifiedDomain = [extent[0] - padding, extent[1] + padding];

        const x = d3.scaleLinear().domain(unifiedDomain).range([0, this.width]);
        const y = d3.scaleLinear().domain(unifiedDomain).range([this.height, 0]);

        addPredictionIdentityLine(svg, x, y, unifiedDomain);
        addRegressionAxes(svg, x, y, this.height);
        addRegressionLabels(svg, "Predicted Cancer Rate", "Actual Cancer Rate", this.width, this.height, this.margin);
        addRegressionTitle(svg, `Multiple Regression (${factors.length} factors)`, this.width);

        addDataPoints(svg, plotData, x, y, "predicted", "actual", this.colorScale);
        addRSquaredLabel(svg, adjustedRSquared);

        // Tooltip for multiple regression
        const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0)
            .style("position", "absolute")
            .style("background-color", "white")
            .style("border", "solid")
            .style("border-width", "1px")
            .style("border-radius", "5px")
            .style("padding", "10px");
            
        svg.selectAll("circle")
            .on("mouseover", (event, d) => {
                tooltip.transition()
                    .duration(200)
                    .style("opacity", .9);
                tooltip.html(`
                    <strong>${d.county ? d.county + ', ' : ''}${d.state}</strong><br>
                    Actual: ${d.actual.toFixed(2)}<br>
                    Predicted: ${d.predicted.toFixed(2)}
                `)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", () => {
                tooltip.transition()
                    .duration(500)
                    .style("opacity", 0);
            });
    }



    addTooltip(svg, factorSlug) {
        const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0)
            .style("position", "absolute")
            .style("background-color", "white")
            .style("border", "solid")
            .style("border-width", "1px")
            .style("border-radius", "5px")
            .style("padding", "10px");
            
        svg.selectAll("circle")
            .on("mouseover", (event, d) => {
                tooltip.transition()
                    .duration(200)
                    .style("opacity", .9);
                tooltip.html(this.tooltipContent(d, factorSlug))
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", () => {
                tooltip.transition()
                    .duration(500)
                    .style("opacity", 0);
            });
    }



    tooltipContent(feature, factorSlug) {
        // Use the same color scale as the circles
        const color = this.colorScale(feature.state);
        let locationName = feature.state || 'Unknown Location';
        
        // Add county name if available
        if (feature.county) {
            locationName = `${feature.county}, ${feature.state}`;
        }
        
        const factorValue = feature["factor_value"] != null ? 
            (+feature["factor_value"]).toFixed(2) : 'No data';
        const cancerValue = feature["cancer_rate"] != null ?
            (+feature["cancer_rate"]).toFixed(2) : 'No data';
        
        const factorUnit = factorSlug ? (FACTORS_UNITS[factorSlug] || '') : '';
        const factorUnitLabel = factorUnit ? ` ${factorUnit}` : '';
        const cancerUnitLabel = (feature["cancer_rate"] != null) ? ' (per 100,000)' : '';

        const tooltipContent = `
            <strong style="color: ${color};">${locationName}</strong><br>
            ${this.formatLabel("factor_value")}: ${factorValue}${factorUnitLabel}<br>
            ${this.formatLabel("cancer_rate")}: ${cancerValue}${cancerUnitLabel}
        `;
        return tooltipContent;
    }

    formatLabel(text) {
        // Replace underscores with spaces and capitalize each word
        return text
            .replace(/_/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }
}
