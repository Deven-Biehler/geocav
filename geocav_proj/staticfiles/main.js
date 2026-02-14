import { MapRenderer } from "./MapRenderer.js";
import { FilterManager } from "./FilterManager.js";
import { DataManager } from "./DataManager.js";
import { RegressionPlot } from "./RegressionPlot.js";
import { TableRenderer } from "./TableRenderer.js";
import { PCAPlot } from "./PcaHeatmap.js";

document.addEventListener('DOMContentLoaded', async () => {
    let dataManager = new DataManager();
    await dataManager.readyPromise;
    let mapRendered = new MapRenderer(dataManager); // Map renderer pulls data via data manager and displays it
    let regressionPlot = new RegressionPlot(dataManager); // Regression plot to show trends based on selected filters
    let tableRenderer = new TableRenderer(dataManager); // Initialize the table renderer
    let pcaPlot = new PCAPlot(dataManager); // Initialize the mock heatmap
    new FilterManager(dataManager, mapRendered, regressionPlot, tableRenderer, pcaPlot); // Filter manager instructs the map renderer on what to display based on user selections
});