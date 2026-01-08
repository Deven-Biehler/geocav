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

    async renderPlot(selectedFilters) {
        /* Render regression plot based on selected filters */
        const data = await this.dataManager.fetchRegressionData(selectedFilters); // Fetch data based on filters
        d3.select('#regression-plot').selectAll('*').remove(); // Clear any existing plot
        const svg = d3.select('#regression-plot') // Create SVG container
            .append("svg")
                .attr('width', this.width + this.margin.left + this.margin.right)
                .attr('height', this.height + this.margin.top + this.margin.bottom)
            .append("g")
                .attr('transform', 'translate(' + this.margin.left + ',' + this.margin.top + ')');

        if (selectedFilters.factor.length > 1) {
            this.renderMultipleRegression(svg, data, selectedFilters.factor, selectedFilters);
        } else {
            this.renderSingleRegression(svg, data, selectedFilters.factor[0], selectedFilters);
        }
    }

    renderSingleRegression(svg, data, factor, selectedFilters) {
        /* Render single factor regression plot */
        console.log('[Regression Plot] Rendering single regression for factor:', factor);

        // Calculate actual data domains
        const xExtent = d3.extent(data, d => +d["factor_value"]);
        const yExtent = d3.extent(data, d => +d["cancer_rate"]);
        
        const x = d3.scaleLinear()
            .domain(xExtent)
            .range([0, this.width]);

        const y = d3.scaleLinear()
            .domain(yExtent)
            .range([this.height, 0]);

        const regressionLine = calculateLinearRegression(data, "factor_value", "cancer_rate");
        
        // Prepare labels
        let cancerLabel = selectedFilters.cancer_type + " Cancer Rate Per 100,000";
        if (selectedFilters.gender && selectedFilters.gender !== 'all') {
            cancerLabel += ` (${selectedFilters.gender})`;
        }
        if (selectedFilters.race && selectedFilters.race !== 'all') {
            cancerLabel += ` (${selectedFilters.race})`;
        }
        
        const factorUnit = FACTORS_UNITS[factor] || '';
        const factorLabel = factor.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') + (factorUnit ? ` (${factorUnit})` : '');

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
        const factorName = factor.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        addRegressionTitle(svg, `${selectedFilters.cancer_type} vs ${factorName} (${selectedFilters.level.charAt(0).toUpperCase() + selectedFilters.level.slice(1)})`, this.width);

        // Add data points
        addDataPoints(svg, data, x, y, "factor_value", "cancer_rate", this.colorScale);

        // Add R-squared label
        addRSquaredLabel(svg, regressionLine.rSquared);

        this.addTooltip(svg, factor);
    }

    renderMultipleRegression(svg, data, factors, selectedFilters) {
        console.log('[Regression Plot] Rendering multiple regression for factors:', factors);
        
        try {
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

            const xExtent = d3.extent(plotData, d => d.predicted);
            const yExtent = d3.extent(plotData, d => d.actual);
            
            const x = d3.scaleLinear().domain(xExtent).range([0, this.width]);
            const y = d3.scaleLinear().domain(yExtent).range([this.height, 0]);

            addPredictionIdentityLine(svg, x, y, xExtent);
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

        } catch (error) {
            console.error('Error rendering multiple regression plot:', error);
            svg.append("text")
                .attr("x", this.width / 2)
                .attr("y", this.height / 2)
                .style("text-anchor", "middle")
                .text("Error calculating regression");
        }
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
