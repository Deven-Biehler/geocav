// PCA Heatmap implementation
import { FACTORS_UNITS } from './config.js';

export class HeatmapPlot {
    constructor(dataManager) {
        this.dataManager = dataManager;
        this.containerId = 'heatmap-container';
        this.pcResults = null; // Store PCA results
        this.selectedPCs = []; // Track selected PCs for visualization
        
        // Dimensions
        this.margin = {top: 40, right: 30, bottom: 80, left: 100};
        this.width = 500 - this.margin.left - this.margin.right;
        this.height = 450 - this.margin.top - this.margin.bottom;
    }

    async runPCA(filters) {
        const container = d3.select("#" + this.containerId);
        container.html('<div style="text-align: center; padding: 20px;">Running PCA...</div>');

        try {
            const data = await this.dataManager.fetchPCAData(filters);
            this.pcResults = data; // Store results
            this.selectedPCs = []; // Reset selected PCs
            this.render(data);
        } catch (error) {
            container.html(`<div style="color: red; padding: 20px;">Error running PCA: ${error.message}</div>`);
        }
    }

    renderPlot(filters) {
        // Placeholder state when waiting for user action
        const container = d3.select("#" + this.containerId);
        const svgSelection = container.select("svg");
        const divSelection = container.select("div");

        // Check if error is present safely
        let hasError = false;
        if (!divSelection.empty()) {
            hasError = divSelection.text().indexOf("Error") !== -1;
        }

        if (svgSelection.empty() && !hasError) {
             container.html('<div style="text-align: center; padding: 20px; color: #666; display: flex; flex-direction: column; justify-content: center; height: 100%;"><div>PCA Analysis</div><div style="font-size: 0.8em; margin-top: 10px;">Select 2+ factors and click "Run PCA"</div></div>');
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
        container.html('<div style="text-align: center; padding: 20px; color: #666; display: flex; flex-direction: column; justify-content: center; height: 100%;"><div>PCA Analysis</div><div style="font-size: 0.8em; margin-top: 10px;">Select 2+ factors and click "Run PCA"</div></div>');
    }

    getSelectedPCs() {
        return this.selectedPCs;
    }

    setSelectedPCs(pcIndices) {
        this.selectedPCs = pcIndices;
    }
}