import { MapRenderer } from "./MapRenderer.js";
import { FilterManager } from "./FilterManager.js";
import { DataManager } from "./DataManager.js";
import { RegressionPlot } from "./RegressionPlot.js";
import { TableRenderer } from "./TableRenderer.js";
import { HeatmapPlot } from "./PcaHeatmap.js";

document.addEventListener('DOMContentLoaded', () => {
    let dataManager = new DataManager();
    let mapRendered = new MapRenderer(dataManager); // Map renderer pulls data via data manager and displays it
    let regressionPlot = new RegressionPlot(dataManager); // Regression plot to show trends based on selected filters
    let tableRenderer = new TableRenderer(dataManager); // Initialize the table renderer
    let heatmapPlot = new HeatmapPlot(dataManager); // Initialize the mock heatmap
    new FilterManager(mapRendered, regressionPlot, tableRenderer, heatmapPlot); // Filter manager instructs the map renderer on what to display based on user selections
});