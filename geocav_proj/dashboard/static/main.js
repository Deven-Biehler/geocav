import { MapRenderer } from "./MapRenderer.js";
import { FilterManager } from "./FilterManager.js";
import { DataManager } from "./DataManager.js";
import { RegressionPlot } from "./RegressionPlot.js";

document.addEventListener('DOMContentLoaded', () => {
    let dataManager = new DataManager();
    let mapRendered = new MapRenderer(dataManager); // Map renderer pulls data via data manager and displays it
    let regressionPlot = new RegressionPlot(dataManager); // Regression plot to show trends based on selected filters
    new FilterManager(mapRendered, regressionPlot); // Filter manager instructs the map renderer on what to display based on user selections
});
