import { FACTORS_UNITS } from './config.js';

export function addRegressionAxes(svg, x, y, height) {
    svg.append('g')
        .attr('transform', 'translate(0,' + height + ')')
        .call(d3.axisBottom(x));
    
    svg.append('g')
        .call(d3.axisLeft(y));
}

export function addRegressionLabels(svg, xLabel, yLabel, width, height, margin) {
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height + margin.bottom - 5)
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text(xLabel);

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -margin.left + 15)
        .attr("x", -height / 2)
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text(yLabel);
}

export function addRegressionTitle(svg, title, width) {
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", -5)
        .style("text-anchor", "middle")
        .style("font-size", "14px")
        .text(title);
}

export function addLinearRegressionLine(svg, points, lineGenerator) {
    svg.append("path")
        .datum(points)
        .attr("fill", "none")
        .attr("stroke", "#ff0000")
        .attr("stroke-width", 2)
        .attr("d", lineGenerator);
}

export function addPredictionIdentityLine(svg, x, y, extent) {
    svg.append("line")
        .attr("x1", x(extent[0]))
        .attr("y1", y(extent[0]))
        .attr("x2", x(extent[1]))
        .attr("y2", y(extent[1]))
        .attr("stroke", "#ccc")
        .attr("stroke-dasharray", "4");
}

export function addDataPoints(svg, data, x, y, xKey, yKey, colorScale) {
    svg.append('g')
        .selectAll('dot')
        .data(data)
        .enter()
        .append('circle')
            .attr('cx', (d) => x(+d[xKey]))
            .attr('cy', (d) => y(+d[yKey]))
            .attr('r', 3)
            .style('fill', (d) => colorScale(d.state));
}

export function addRSquaredLabel(svg, rSquared, width, correlation = null) {
    svg.append("text")
        .attr("x", 10)
        .attr("y", 20)
        .style("font-size", "12px")
        .text(`Adjusted R² = ${rSquared.toFixed(5)}`);

    if (correlation !== null && correlation !== undefined) {
         svg.append("text")
        .attr("x", 10)
        .attr("y", 35)
        .style("font-size", "12px")
        .text(`Correlation (r) = ${correlation.toFixed(5)}`);
    }
}

export const LEGEND_STYLES = {
    container: "margin-bottom: 8px; font-size: 11px; color: #333; line-height: 1.4;",
    subText: "color: #666;",
    flexColumn: "display: flex; flex-direction: column; gap: 5px; font-size: 12px;",
    flexRow: "display: flex; align-items: center; gap: 5px;",
    colorBox: (color) => `background: ${color}; width: 20px; height: 20px; border: 1px solid #999;`
};


