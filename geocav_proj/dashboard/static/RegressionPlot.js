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
        const data = await this.dataManager.fetchRegressionData(selectedFilters);
        // Clear any existing plot
        d3.select('#regression-plot').selectAll('*').remove();

        const svg = d3.select('#regression-plot')
            .append("svg")
                .attr('width', this.width + this.margin.left + this.margin.right)
                .attr('height', this.height + this.margin.top + this.margin.bottom)
            .append("g")
                .attr('transform', 'translate(' + this.margin.left + ',' + this.margin.top + ')');

        // Store reference to this for use in callback
        const selectedFactor = selectedFilters.factor;
        console.log('[Regression Plot] Rendering regression plot for factor:', selectedFactor, 'and cancer type:', selectedFilters.cancer_type, 'at level:', selectedFilters.level);

        try {
            console.log('[Regression Plot] Regression plot data fetched:', data);

            // Calculate actual data domains
            const xExtent = d3.extent(data, d => +d["factor_value"]);
            const yExtent = d3.extent(data, d => +d["cancer_rate"]);
            
            const x = d3.scaleLinear()
                .domain(xExtent)
                .range([0, this.width]);

            const y = d3.scaleLinear()
                .domain(yExtent)
                .range([this.height, 0]);

            const regressionLine = this.calculateLinearRegression(data, "factor_value", "cancer_rate");
            const gender = selectedFilters.gender
            const race = selectedFilters.race
            const cancerLabel = selectedFilters.cancer_type + " Cancer Rate Per 100,000" + (gender && gender !== 'all' ? ` (${gender})` : '') + (race && race !== 'all' ? ` (${race})` : '');
            const factorLabel = selectedFilters.factor.replace(/_/g, ' ');

            const line = d3.line()
                .x(d => x(d.x))
                .y(d => y(d.y));

            // Generate points for regression line
            const regressionPoints = [
                { x: xExtent[0], y: regressionLine.slope * xExtent[0] + regressionLine.intercept },
                { x: xExtent[1], y: regressionLine.slope * xExtent[1] + regressionLine.intercept }
            ];

            svg.append("path")
                .datum(regressionPoints)
                .attr("fill", "none")
                .attr("stroke", "#ff0000")
                .attr("stroke-width", 2)
                .attr("d", line);

            // Add axes
            svg.append('g')
                .attr('transform', 'translate(0,' + this.height + ')')
                .call(d3.axisBottom(x));
            
            svg.append("text")
                .attr("x", this.width / 2)
                .attr("y", this.height + this.margin.bottom - 5)
                .style("text-anchor", "middle")
                .style("font-size", "12px")
                .text(factorLabel);

            svg.append("text")
                .attr("transform", "rotate(-90)")
                .attr("y", -this.margin.left + 15)
                .attr("x", -this.height / 2)
                .style("text-anchor", "middle")
                .style("font-size", "12px")
                .text(cancerLabel);

            svg.append('g')
                .call(d3.axisLeft(y));

            // Add title
            svg.append("text")
                .attr("x", this.width / 2)
                .attr("y", -5)
                .style("text-anchor", "middle")
                .style("font-size", "14px")
                .text(`${selectedFilters.cancer_type} vs ${selectedFilters.factor} (${selectedFilters.level.charAt(0).toUpperCase() + selectedFilters.level.slice(1)})`);

            // Add dots
            svg.append('g')
                .selectAll('dot')
                .data(data)
                .enter()
                .append('circle')
                    .attr('cx', (d) => x(+d["factor_value"]))
                    .attr('cy', (d) => y(+d["cancer_rate"]))
                    .attr('r', 3)
                    .style('fill', (d) => this.colorScale(d.state));

            svg.append("text")
                .attr("x", 10)
                .attr("y", 20)
                .style("font-size", "12px")
                .text(`R² = ${regressionLine.rSquared.toFixed(5)}`);

            // Tooltip
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
                    tooltip.html(this.tooltipContent(d))
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 28) + "px");
                })
                .on("mouseout", () => {
                    tooltip.transition()
                        .duration(500)
                        .style("opacity", 0);
                });
        } catch (error) {
            console.error('Error rendering regression plot:', error);
            svg.append("text")
                .attr("x", this.width / 2)
                .attr("y", this.height / 2)
                .style("text-anchor", "middle")
                .text("Error loading data");
        }
    }

    calculateLinearRegression(data, xKey, yKey) {
        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        for (let i = 0; i < n; i++) {
            sumX += +data[i][xKey];
            sumY += +data[i][yKey];
            sumXY += +data[i][xKey] * +data[i][yKey];
            sumXX += +data[i][xKey] * +data[i][xKey];
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        const meanY = sumY / n;
        let totalSumSquares = 0;
        let residualSumSquares = 0;

        for (let i = 0; i < n; i++) {
            const predictedY = intercept + slope * data[i][xKey];
            totalSumSquares += (data[i][yKey] - meanY) ** 2;
            residualSumSquares += (data[i][yKey] - predictedY) ** 2;
        }

        const rSquared = 1 - (residualSumSquares / totalSumSquares);

        return { slope, intercept, rSquared };
    }

    tooltipContent(feature) {
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
        
        const tooltipContent = `
            <strong style="color: ${color};">${locationName}</strong><br>
            ${this.formatLabel("factor_value")}: ${factorValue}<br>
            ${this.formatLabel("cancer_rate")}: ${cancerValue}
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
