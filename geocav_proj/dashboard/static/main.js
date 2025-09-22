import { MapRenderer } from "./MapRenderer.js";
import { RegressionPlot } from "./RegressionPlot.js";

document.addEventListener('DOMContentLoaded', () => {
    const mapRenderer = new MapRenderer();
    const regressionPlot = new RegressionPlot(mapRenderer);
    window.regressionPlot = regressionPlot;
});
