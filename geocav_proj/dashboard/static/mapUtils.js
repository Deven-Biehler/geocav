import { LEGEND_STYLES } from './plotUtils.js';

export function getDivergingColor(normalizedValue) {
    // Clamp normalized value to [-1, 1]
    const normalized = Math.max(-1, Math.min(1, normalizedValue));

    let r, g, b;
    if (normalized > 0) {
        // White to Red (Higher than expected/mean)
        r = 255;
        g = Math.round(255 * (1 - normalized));
        b = Math.round(255 * (1 - normalized));
    } else {
        // White to Blue (Lower than expected/mean)
        const absNorm = Math.abs(normalized);
        r = Math.round(255 * (1 - absNorm));
        g = Math.round(255 * (1 - absNorm));
        b = 255;
    }
    return `rgb(${r}, ${g}, ${b})`;
}

export function getCorrelationColor(feature, selectedFilters, dataMean, dataStd, factorMean, factorStd, stats, maxAbsResidual) {
    const cancerValue = feature.cancer_rate; // Cancer rate value
    const factorName = selectedFilters.factor[0];

    // Case 1: Only Cancer Type selected (Factor is None)
    if (factorName == 'None') {
        if (cancerValue == null) return '#cccccc';
        // Use Mean +/- 2 SD for Diverging Scale
        const normalized = (cancerValue - dataMean) / (2 * dataStd);
        return getDivergingColor(normalized);
    }
    
    // Case 2: Only Factor selected (Cancer Type is None)
    if (selectedFilters.cancer_type == 'None') {
        const val = feature[factorName];
        if (val == null) return '#cccccc';
        // Use Mean +/- 2 SD for Diverging Scale
        const normalized = (val - factorMean) / (2 * factorStd);
        return getDivergingColor(normalized);
    }

    // Case 3: Correlation (Both selected)
    if (cancerValue == null) return '#cccccc';

    let predicted;
    if (stats && stats.isMultiple) {
            for (const f of selectedFilters.factor) {
                if (feature[f] == null) return '#cccccc';
            }
            const row = [1, ...selectedFilters.factor.map(f => +feature[f])];
            predicted = row.reduce((sum, val, idx) => sum + val * stats.beta[idx], 0);
    } else {
            const val = feature[factorName];
            if (val == null) return '#cccccc';
            predicted = (stats.slope * val) + stats.intercept;
    }

    const residual = cancerValue - predicted;
    const normalized = residual / (maxAbsResidual || 1);
    
    return getDivergingColor(normalized);
}

export function createBivariatePopupContent(feature, selectedFilters, stats, maxAbsResidual, FACTORS_UNITS) {
    const county_name = feature.properties.NAME || '';
    const state_name = feature.properties.name || feature.properties.state_name || '';
    const name = county_name ? `${county_name}, ${state_name}` : state_name;
    const cancerValue = feature.cancer_rate;
    
    // Build popup content based on selected filters
    let popupContent = `<div class="map-popup"><h4>${name}</h4>`;
    
    // Only show cancer type if it's selected
    if (selectedFilters.cancer_type != 'None') {
        popupContent += `<p><strong>${selectedFilters.cancer_type}:</strong> ${cancerValue != null ? cancerValue.toFixed(2) : 'N/A'} per 100,000</p>`;
    }
    
    const factors = Array.isArray(selectedFilters.factor) ? selectedFilters.factor : [selectedFilters.factor];
    const factor = factors[0];

    // Only show factor if it's selected
    if (factor != 'None') {
        if (factors.length > 1) {
            popupContent += `<p><strong>Factors:</strong></p><ul style="padding-left: 20px; margin: 5px 0;">`;
            factors.forEach(f => {
                const unit = FACTORS_UNITS[f] || '';
                const val = feature[f] != null ? feature[f].toFixed(2) : 'N/A';
                popupContent += `<li>${f.replace(/_/g, ' ')}: ${val}${unit ? ' ' + unit : ''}</li>`;
            });
            popupContent += `</ul>`;
        } else {
            const unit = FACTORS_UNITS[factor] || '';
            const val = feature[factor];
            const valueDisplay = val != null ? val.toFixed(2) : 'N/A';
            popupContent += `<p><strong>${factor.replace(/_/g, ' ')}:</strong> ${valueDisplay}${unit ? ' ' + unit : ''}</p>`;
        }
    }
    
    // Only show correlation if both are selected
    if (selectedFilters.cancer_type != 'None' && factor != 'None') {
        
        if (stats && stats.isMultiple) {
                // Check if all factors are present
                const allFactorsPresent = factors.every(f => feature[f] != null);
                
                if (allFactorsPresent && cancerValue != null) {
                    const row = [1, ...factors.map(f => +feature[f])];
                    const predicted = row.reduce((sum, val, idx) => sum + val * stats.beta[idx], 0);
                    const residual = cancerValue - predicted;
                    popupContent += `<p><strong>Expected Rate:</strong> ${predicted.toFixed(2)}</p>`;
                    popupContent += `<p><strong>Deviation:</strong> ${residual > 0 ? '+' : ''}${residual.toFixed(2)}</p>`;
                    popupContent += `<p style="font-size: 10px; color: #666;">(Limit [2σ]: +/- ${maxAbsResidual.toFixed(1)} per 100k)</p>`;
                }
        } else if (cancerValue != null && feature[factor] != null && stats) {
                const val = feature[factor];
                const predicted = (stats.slope * val) + stats.intercept;
                const residual = cancerValue - predicted;
                popupContent += `<p><strong>Expected Rate:</strong> ${predicted.toFixed(2)}</p>`;
                popupContent += `<p><strong>Deviation:</strong> ${residual > 0 ? '+' : ''}${residual.toFixed(2)}</p>`;
                popupContent += `<p style="font-size: 10px; color: #666;">(Limit [2σ]: +/- ${maxAbsResidual.toFixed(1)} per 100k)</p>`;
        }
    }
    
    popupContent += `</div>`;
    return popupContent;
}

export function getDeviationLegendContent(legendTitle, r2, rangeVal) {
    return `
    <h4>${legendTitle}</h4>
    <div style="${LEGEND_STYLES.container}">
        <strong>Model Fit (Adjusted R²):</strong> ${r2}<br>
        <strong>Deviation Limit:</strong> +/- ${rangeVal} per 100k<br>
        <span style="${LEGEND_STYLES.subText}">(Calculated as 2 Standard Deviations)</span><br>
        <em>Whiter map indicates better model fit</em>
    </div>
    <div style="${LEGEND_STYLES.flexColumn}">
        <div style="${LEGEND_STYLES.flexRow}">
            <div style="${LEGEND_STYLES.colorBox('#ff0000')}"></div>
            <span>> +${rangeVal} (Higher Rate)</span>
        </div>
        <div style="${LEGEND_STYLES.flexRow}">
            <div style="${LEGEND_STYLES.colorBox('#ffffff')}"></div>
            <span>Expected Rate</span>
        </div>
        <div style="${LEGEND_STYLES.flexRow}">
            <div style="${LEGEND_STYLES.colorBox('#0000ff')}"></div>
            <span>< -${rangeVal} (Lower Rate)</span>
        </div>
    </div>
    `;
}

export function getStandardLegendContent(title, lowVal, highVal, meanVal) {
    return `
        <h4>${title}</h4>
        <div style="margin-bottom: 5px; font-size: 10px; color: #666;">
            Range: Mean +/- 2 SD
        </div>
        <div style="${LEGEND_STYLES.flexColumn}">
            <div style="${LEGEND_STYLES.flexRow}">
                <div style="${LEGEND_STYLES.colorBox('#ff0000')}"></div>
                <span>> ${highVal} (High)</span>
            </div>
            <div style="${LEGEND_STYLES.flexRow}">
                <div style="${LEGEND_STYLES.colorBox('#ffffff')}"></div>
                <span>${meanVal} (Mean)</span>
            </div>
            <div style="${LEGEND_STYLES.flexRow}">
                <div style="${LEGEND_STYLES.colorBox('#0000ff')}"></div>
                <span>< ${lowVal} (Low)</span>
            </div>
        </div>
    `;
}
