// PCA Heatmap implementation
import { FACTORS_UNITS } from './config.js';

export class PCAPlot {
    constructor(dataManager) {
        this.dataManager = dataManager;
        this.containerId = 'PCA-container';
        this.biplotContainerId = 'biplot-container';
        this.pcResults = null; // Store PCA results
        this.selectedPCs = []; // Track selected PCs for visualization
        this.biplotSelection = { x: 0, y: 1 }; // Default BiPlot axes
        
        // Heatmap Dimensions
        this.margin = {top: 40, right: 30, bottom: 80, left: 100};
        this.width = 500 - this.margin.left - this.margin.right;
        this.height = 450 - this.margin.top - this.margin.bottom;

        // BiPlot dimensions
        this.biplotMargin = { top: 50, right: 30, bottom: 70, left: 80 };
        this.biplotWidth = 520 - this.biplotMargin.left - this.biplotMargin.right;
        this.biplotHeight = 460 - this.biplotMargin.top - this.biplotMargin.bottom;
    }

    async runPCA(filters) {
        const container = d3.select("#" + this.containerId);
        container.html('<div style="text-align: center; padding: 20px;">Running PCA...</div>');

        try {
            const data = await this.dataManager.fetchPCAData(filters);
            this.pcResults = data; // Store results
            this.currentFilters = filters; // Store filters for later use
            this.selectedPCs = []; // Reset selected PCs
            this.biplotSelection = { x: 0, y: Math.min(1, (data.loadings?.length || 1) - 1) };
            this.render(data);
            this.renderBiPlot(data, filters);
        } catch (error) {
            container.html(`<div style="color: red; padding: 20px;">Error running PCA: ${error.message}</div>`);
        }
    }

    renderPlot(filters) {
        // Placeholder state when waiting for user action
        const container = d3.select("#" + this.containerId);
        const svgSelection = container.select("svg");
        const divSelection = container.select("div");

        // Show placeholder for BiPlot container too
        const biplotContainer = d3.select("#" + this.biplotContainerId);
        const biplotSvg = biplotContainer.select("svg");
        const biplotDiv = biplotContainer.select("div");

        // Check if error is present safely
        let hasError = false;
        if (!divSelection.empty()) {
            hasError = divSelection.text().indexOf("Error") !== -1;
        }

        if (svgSelection.empty() && !hasError) {
             container.html('<div style="text-align: center; padding: 20px; color: #666; display: flex; flex-direction: column; justify-content: center; height: 100%;"><div>PCA Analysis</div><div style="font-size: 0.8em; margin-top: 10px;">Select 2+ factors and click "Run PCA"</div></div>');
        }

        // Mirror placeholder for BiPlot
        let biplotHasError = false;
        if (!biplotDiv.empty()) {
            biplotHasError = biplotDiv.text().indexOf("Error") !== -1;
        }

        if (biplotSvg.empty() && !biplotHasError) {
            biplotContainer.html('<div style="text-align: center; padding: 20px; color: #666; display: flex; flex-direction: column; justify-content: center; height: 100%;"><div>BiPlot</div><div style="font-size: 0.8em; margin-top: 10px;">Run PCA, then pick X and Y PCs</div></div>');
        }
    }

    renderBiPlot(results, filters) {
        const container = d3.select("#" + this.biplotContainerId);
        container.selectAll("*").remove(); // Clear previous content

        if (!results || !results.pc_scores || results.pc_scores.length === 0) {
            container.html('<div style="text-align: center; padding: 20px; color: #666;">Run PCA to see the BiPlot.</div>');
            return;
        }

        const totalComponents = results.loadings ? results.loadings.length : 0;
        if (totalComponents < 2) {
            container.html('<div style="text-align: center; padding: 20px; color: #666;">At least two principal components are needed for a BiPlot.</div>');
            return;
        }

        const xIndex = Math.min(this.biplotSelection.x ?? 0, totalComponents - 1);
        const yIndex = Math.min(this.biplotSelection.y ?? 1, totalComponents - 1);

        if (xIndex === yIndex) {
            container.html('<div style="text-align: center; padding: 20px; color: #666;">Select two different PCs for X and Y.</div>');
            return;
        }

        const pcScores = results.pc_scores;
        const loadings = results.loadings;
        const factorNames = results.factor_names || [];
        const explainedVariance = results.explained_variance_ratio || [];
        const geoKeys = results.geo_keys || [];
        const metadata = results.metadata || {};
        const cancerRates = results.cancer_rates || {};

        const xLabel = `PC${xIndex + 1} ${(explainedVariance[xIndex] ? (explainedVariance[xIndex] * 100).toFixed(1) : '0.0')}%`;
        const yLabel = `PC${yIndex + 1} ${(explainedVariance[yIndex] ? (explainedVariance[yIndex] * 100).toFixed(1) : '0.0')}%`;

        // Build point data with metadata for tooltips
        const points = pcScores.map((row, i) => {
            const key = geoKeys[i] || `unit_${i}`;
            const meta = metadata[key] || {};
            const labelParts = [];
            if (meta.county) labelParts.push(meta.county);
            if (meta.state) labelParts.push(meta.state);
            const label = labelParts.length ? labelParts.join(', ') : key;
            return {
                key,
                x: row[xIndex],
                y: row[yIndex],
                label,
                cancerRate: cancerRates[key]
            };
        });

        const loadingVectors = factorNames.map((name, idx) => ({
            name,
            x: loadings[xIndex][idx],
            y: loadings[yIndex][idx]
        }));

        const maxScore = Math.max(
            d3.max(points, d => Math.abs(d.x)) || 1,
            d3.max(points, d => Math.abs(d.y)) || 1,
            1
        );
        const maxLoadingLen = d3.max(loadingVectors, l => Math.sqrt(l.x * l.x + l.y * l.y)) || 1;
        const loadingScale = (maxScore * 0.85) / maxLoadingLen;

        const scaledLoadings = loadingVectors.map(l => ({
            ...l,
            x: l.x * loadingScale,
            y: l.y * loadingScale
        }));

        // Combine points and loadings for domain calculation
        const xValues = points.map(p => p.x).concat(scaledLoadings.map(l => l.x)).concat([0]);
        const yValues = points.map(p => p.y).concat(scaledLoadings.map(l => l.y)).concat([0]);

        const xExtent = d3.extent(xValues);
        const yExtent = d3.extent(yValues);
        const xPad = ((xExtent[1] - xExtent[0]) || 1) * 0.1;
        const yPad = ((yExtent[1] - yExtent[0]) || 1) * 0.1;

        const xScale = d3.scaleLinear()
            .domain([xExtent[0] - xPad, xExtent[1] + xPad])
            .range([0, this.biplotWidth]);

        const yScale = d3.scaleLinear()
            .domain([yExtent[0] - yPad, yExtent[1] + yPad])
            .range([this.biplotHeight, 0]);

        const svg = container
            .append("svg")
            .attr("width", this.biplotWidth + this.biplotMargin.left + this.biplotMargin.right)
            .attr("height", this.biplotHeight + this.biplotMargin.top + this.biplotMargin.bottom);

        const g = svg.append("g")
            .attr("transform", `translate(${this.biplotMargin.left},${this.biplotMargin.top})`);

        // Arrowhead definition for loadings
        svg.append("defs")
            .append("marker")
            .attr("id", "biplot-arrow")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 8)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", "#444");

        // Axes
        g.append("g")
            .attr("transform", `translate(0, ${this.biplotHeight})`)
            .call(d3.axisBottom(xScale));

        g.append("g")
            .call(d3.axisLeft(yScale));

        // Axis labels
        g.append("text")
            .attr("x", this.biplotWidth / 2)
            .attr("y", this.biplotHeight + this.biplotMargin.bottom - 20)
            .attr("text-anchor", "middle")
            .attr("font-size", 12)
            .text(xLabel);

        g.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -this.biplotHeight / 2)
            .attr("y", -this.biplotMargin.left + 15)
            .attr("text-anchor", "middle")
            .attr("font-size", 12)
            .text(yLabel);

        // Reference axes at origin
        g.append("line")
            .attr("x1", xScale(0))
            .attr("x2", xScale(0))
            .attr("y1", 0)
            .attr("y2", this.biplotHeight)
            .attr("stroke", "#ccc")
            .attr("stroke-width", 1);

        g.append("line")
            .attr("x1", 0)
            .attr("x2", this.biplotWidth)
            .attr("y1", yScale(0))
            .attr("y2", yScale(0))
            .attr("stroke", "#ccc")
            .attr("stroke-width", 1);

        // Color scale for cancer rates if available
        const rateValues = Object.values(cancerRates).filter(v => v !== null && v !== undefined);
        const colorScale = rateValues.length > 0
            ? d3.scaleLinear().domain(d3.extent(rateValues).reverse()).range(['#ff0000', '#0057b8'])
            : null;

        // Tooltip
        let tooltip = d3.select("#pca-biplot-tooltip");
        if (tooltip.empty()) {
            tooltip = d3.select("body").append("div")
                .attr("id", "pca-biplot-tooltip")
                .style("position", "absolute")
                .style("background-color", "white")
                .style("border", "1px solid #ddd")
                .style("padding", "8px")
                .style("border-radius", "4px")
                .style("pointer-events", "none")
                .style("font-size", "12px")
                .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)");
        }

        // Draw points
        g.selectAll(".biplot-point")
            .data(points)
            .join("circle")
            .attr("class", "biplot-point")
            .attr("cx", d => xScale(d.x))
            .attr("cy", d => yScale(d.y))
            .attr("r", 4)
            .attr("fill", d => colorScale ? colorScale(d.cancerRate) : "#4682b4")
            .attr("opacity", 0.85)
            .on("mouseover", function(event, d) {
                d3.select(this).attr("r", 6).attr("stroke", "#000").attr("stroke-width", 1);
                const rateText = d.cancerRate !== null && d.cancerRate !== undefined
                    ? `<div>Cancer rate: ${d.cancerRate.toFixed(2)}</div>`
                    : '';
                tooltip.style("opacity", 1)
                    .html(`<strong>${d.label}</strong><div>${xLabel}: ${d.x.toFixed(3)}</div><div>${yLabel}: ${d.y.toFixed(3)}</div>${rateText}`)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px");
            })
            .on("mousemove", function(event) {
                tooltip.style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px");
            })
            .on("mouseleave", function() {
                d3.select(this).attr("r", 4).attr("stroke", null);
                tooltip.style("opacity", 0);
            });

        // Draw loadings as arrows
        g.selectAll(".biplot-loading")
            .data(scaledLoadings)
            .join("line")
            .attr("class", "biplot-loading")
            .attr("x1", xScale(0))
            .attr("y1", yScale(0))
            .attr("x2", d => xScale(d.x))
            .attr("y2", d => yScale(d.y))
            .attr("stroke", "#444")
            .attr("stroke-width", 1.2)
            .attr("marker-end", "url(#biplot-arrow)")
            .attr("opacity", 0.9);

        // Loading labels
        g.selectAll(".biplot-loading-label")
            .data(scaledLoadings)
            .join("text")
            .attr("class", "biplot-loading-label")
            .attr("x", d => xScale(d.x))
            .attr("y", d => yScale(d.y))
            .attr("dx", d => d.x >= 0 ? 6 : -6)
            .attr("dy", d => d.y >= 0 ? -6 : 12)
            .attr("text-anchor", d => d.x >= 0 ? "start" : "end")
            .attr("font-size", 11)
            .attr("fill", "#222")
            .text(d => d.name.replace(/_/g, ' '));

        // Optional legend for cancer rate coloring
        if (colorScale) {
            const legendHeight = 120;
            const legendWidth = 12;
            const legendMarginTop = 10;
            const legend = container.append("div")
                .style("display", "flex")
                .style("gap", "8px")
                .style("align-items", "center")
                .style("margin-top", "10px");

            const legendSvg = legend.append("svg")
                .attr("width", legendWidth + 30)
                .attr("height", legendHeight + 20);

            const legendScale = d3.scaleLinear()
                .domain(d3.extent(rateValues))
                .range([legendHeight, 0]);

            const legendAxis = d3.axisRight(legendScale)
                .ticks(5)
                .tickSize(4);

            // Gradient
            const defs = legendSvg.append("defs");
            const gradientId = "biplot-gradient";
            const gradient = defs.append("linearGradient")
                .attr("id", gradientId)
                .attr("x1", "0%")
                .attr("x2", "0%")
                .attr("y1", "0%")
                .attr("y2", "100%");

            const stops = d3.range(0, 1.01, 0.2);
            stops.forEach(s => {
                gradient.append("stop")
                    .attr("offset", `${s * 100}%`)
                    .attr("stop-color", colorScale(legendScale.invert(s * legendHeight)));
            });

            legendSvg.append("rect")
                .attr("x", 5)
                .attr("y", 10)
                .attr("width", legendWidth)
                .attr("height", legendHeight)
                .style("fill", `url(#${gradientId})`)
                .style("stroke", "#ccc");

            legendSvg.append("g")
                .attr("transform", `translate(${legendWidth + 8}, 10)`)
                .call(legendAxis)
                .selectAll("text")
                .style("font-size", 10);

            const cancerName = filters?.cancer_type || "Cancer";
            legend.append("div")
                .style("font-size", "12px")
                .style("color", "#444")
                .text(`${cancerName} incidence rate`);
        }
    }

    render(results) {
        const container = d3.select("#" + this.containerId);
        container.selectAll("*").remove();

        container.append("h3")
            .style("text-align", "center")
            .text("PCA Loadings Heatmap");
        
        // Prepare data for heatmap
        const loadings = results.loadings; // [[fac1_pc1, ...], [fac1_pc2...]]
        const factors = results.factor_names;
        const n_components = loadings.length;
        const explainedVariance = results.explained_variance_ratio || [];
        
        const pcs = Array.from({length: n_components}, (_, i) => {
            const variance = explainedVariance[i] ? `(${(explainedVariance[i] * 100).toFixed(1)}%)` : '';
            return `PC${i+1} ${variance}`;
        });

        // Flatten data
        const data = [];
        loadings.forEach((row, i) => {
            row.forEach((val, j) => {
                data.push({
                    group: factors[j],
                    variable: pcs[i],
                    value: val
                });
            });
        });

        this.svg = container
            .append("svg")
            .attr("width", this.width + this.margin.left + this.margin.right)
            .attr("height", this.height + this.margin.top + this.margin.bottom)
            .append("g")
            .attr("transform", `translate(${this.margin.left},${this.margin.top})`);

        this.xScale = d3.scaleBand().range([0, this.width]).padding(0.01);
        this.yScale = d3.scaleBand().range([0, this.height]).padding(0.01);
        
        // Diverging color scale for loadings (-1 to 1)
        this.colorScale = d3.scaleSequential(d3.interpolateRdBu).domain([1, -1]); // Red for pos, Blue for neg (or vice versa)

        this.xScale.domain(factors);
        this.yScale.domain(pcs);

         // Draw X Axis (Factors) - Rotated text
        this.svg.append("g")
            .style("font-size", 10)
            .attr("transform", `translate(0, ${this.height})`)
            .call(d3.axisBottom(this.xScale))
            .selectAll("text")
                .style("text-anchor", "end")
                .attr("dx", "-.8em")
                .attr("dy", ".15em")
                .attr("transform", "rotate(-45)");

        // Draw Y Axis (PCs)
        this.svg.append("g")
            .style("font-size", 12)
            .call(d3.axisLeft(this.yScale));

        // Tooltip
        let tooltip = d3.select("#pca-tooltip");
        if(tooltip.empty()) {
            tooltip = d3.select("body").append("div")
                .attr("id", "pca-tooltip")
                .style("opacity", 0)
                .style("position", "absolute")
                .style("background-color", "white")
                .style("border", "1px solid #ddd")
                .style("padding", "8px")
                .style("border-radius", "4px")
                .style("pointer-events", "none")
                .style("font-size", "12px")
                .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)");
        }

        // Draw Squares
        this.svg.selectAll()
            .data(data, d => d.group + ':' + d.variable)
            .join("rect")
            .attr("x", d => this.xScale(d.group))
            .attr("y", d => this.yScale(d.variable))
            .attr("width", this.xScale.bandwidth())
            .attr("height", this.yScale.bandwidth())
            .style("fill", d => this.colorScale(d.value))
            .style("stroke-width", 1)
            .style("stroke", "#eee") 
            .on("mouseover", function(event, d) {
                d3.select(this).style("stroke", "black").style("z-index", 100);
                tooltip.style("opacity", 1)
                       .html(`<strong>${d.variable}</strong><br>Factor: ${d.group.replace(/_/g, ' ')}<br>Loading: ${d.value.toFixed(3)}`)
                       .style("left", (event.pageX + 10) + "px") 
                       .style("top", (event.pageY - 10) + "px");
            })
            .on("mousemove", function(event) {
                tooltip.style("left", (event.pageX + 10) + "px") 
                       .style("top", (event.pageY - 10) + "px");
            })
            .on("mouseleave", function(event, d) {
                d3.select(this).style("stroke", "#eee");
                tooltip.style("opacity", 0);
            });
    }

    clearPCA() {
        const container = d3.select("#" + this.containerId);
        container.selectAll("*").remove();
        this.pcResults = null;
        this.selectedPCs = [];
        this.biplotSelection = { x: 0, y: 1 };
        container.html('<div style="text-align: center; padding: 20px; color: #666; display: flex; flex-direction: column; justify-content: center; height: 100%;"><div>PCA Analysis</div><div style="font-size: 0.8em; margin-top: 10px;">Select 2+ factors and click "Run PCA"</div></div>');

        const biplotContainer = d3.select("#" + this.biplotContainerId);
        biplotContainer.selectAll("*").remove();
        biplotContainer.html('<div style="text-align: center; padding: 20px; color: #666; display: flex; flex-direction: column; justify-content: center; height: 100%;"><div>BiPlot</div><div style="font-size: 0.8em; margin-top: 10px;">Run PCA to enable BiPlot axes</div></div>');
    }

    getSelectedPCs() {
        return this.selectedPCs;
    }

    setSelectedPCs(pcIndices) {
        this.selectedPCs = pcIndices;
    }

    getBiplotAxes() {
        return this.biplotSelection;
    }

    setBiplotAxes(xIndex, yIndex) {
        this.biplotSelection = {
            x: xIndex ?? 0,
            y: yIndex ?? 1
        };

        if (this.pcResults) {
            this.renderBiPlot(this.pcResults);
        }
    }
}