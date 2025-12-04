# Geospatial Dashboard: Technical Implementation Details

This document details the technical implementation of the geospatial dashboard, focusing on the algorithms, data structures, and visualization logic used to render maps and plots.

## 1. Data Architecture & Flow

The dashboard relies on a decoupled architecture where the frontend `DataManager` orchestrates data retrieval and preparation for the visualization components.

### 1.1 Data Retrieval (`DataManager.js`)
Data is fetched from the backend via two primary endpoints:
1.  `/get_geojson`: Returns the geographic boundaries (State or County polygons).
2.  `/get_data`: Returns statistical data (Cancer Incidence and Factor Measurements).

### 1.2 Data Merging Strategy
To ensure efficient rendering, statistical data is merged directly into the GeoJSON structure before being passed to the map renderers.

*   **Key Generation**: A unique key is generated for each record to match statistical data with GeoJSON features.
    *   *State Level*: `StateFIPS`
    *   *County Level*: `StateFIPS` + `CountyFIPS`
*   **Merging**: The `addGeoJSONProperties` method iterates through the GeoJSON features and injects `cancer_rate` and `factor_value` directly into the feature object. This allows O(1) access to data during the rendering loop of thousands of polygons.

## 2. Visualization Logic

### 2.1 Choropleth Map (`ChoroplethMap.js`)

The Choropleth map implements a **Bivariate Analysis** visualization when both a cancer type and an environmental factor are selected.

#### 2.1.1 Statistical Calculations
Before rendering, the class calculates global statistics for the current dataset to normalize colors:

1.  **Pearson Correlation**: Calculates the linear correlation coefficient ($r$) between the selected cancer rates and factor values across all regions.
2.  **Linear Regression Model**: Computes a global trend line ($y = mx + b$) where $y$ is the cancer rate and $x$ is the factor value.
    *   Slope ($m$) = $r \times \frac{\sigma_{cancer}}{\sigma_{factor}}$
    *   Intercept ($b$) = $\mu_{cancer} - (m \times \mu_{factor})$
3.  **Residuals**: For each region, the "Deviation from Trend" is calculated:
    *   $Predicted = (m \times FactorValue) + b$
    *   $Residual = ActualCancerRate - Predicted$

#### 2.1.2 Color Scaling Logic
The coloring strategy changes based on the user's selection:

*   **Univariate (Single Variable)**:
    *   Uses a linear scale from **White** to **Red**.
    *   Opacity is fixed at 0.8.
    *   Formula: $Intensity = \frac{Value - Min}{Max - Min}$

*   **Bivariate (Correlation Mode)**:
    *   Uses a **Diverging Color Scale** based on the calculated *Residuals*.
    *   **Red**: Region has a *higher* cancer rate than predicted by the factor (Positive Residual).
    *   **Blue**: Region has a *lower* cancer rate than predicted by the factor (Negative Residual).
    *   **White**: Region follows the expected trend (Near-zero Residual).
    *   Normalization: The residual is normalized against the maximum absolute residual in the dataset to ensure the color scale is symmetric around zero.

### 2.2 Regression Plot (`RegressionPlot.js`)

The regression plot visualizes the correlation between the selected factor (X-axis) and cancer type (Y-axis).

#### 2.2.1 Linear Regression Algorithm
The plot calculates the "Line of Best Fit" using the Least Squares method:

*   **Slope ($m$)**:
    $$m = \frac{n(\sum xy) - (\sum x)(\sum y)}{n(\sum x^2) - (\sum x)^2}$$
*   **Intercept ($b$)**:
    $$b = \frac{\sum y - m(\sum x)}{n}$$
*   **Coefficient of Determination ($R^2$)**:
    $$R^2 = 1 - \frac{SS_{res}}{SS_{tot}}$$
    Where $SS_{res}$ is the sum of squared residuals and $SS_{tot}$ is the total sum of squares.

#### 2.2.2 Rendering
*   **Library**: D3.js
*   **Points**: Each geographic unit (State/County) is plotted as a circle.
*   **Trend Line**: A SVG path is drawn using the calculated $m$ and $b$ across the extent of the X-axis.
*   **Coloring**: Points are colored using a categorical color scale (`d3.schemeCategory10`) mapped to the State name, allowing users to visually cluster data by region.

### 2.3 Dot Density Map (`DotDensityMap.js`)

This visualization combines a heatmap with a "Top Cases" filter.

#### 2.3.1 Heatmap Generation
*   **Library**: `Leaflet.heat`
*   **Data Source**: Uses the `factor_value` of each region.
*   **Normalization**: Values are normalized to a 0-1 range.
*   **Rendering**: Draws a heatmap overlay where the intensity corresponds to the environmental factor's concentration.

#### 2.3.2 Top Cases Filter
*   **Logic**:
    1.  Sorts all regions by `cancer_rate` in descending order.
    2.  Slices the top $N\%$ of regions (controlled by a slider, default 20%).
*   **Rendering**: Places a `L.circleMarker` at the centroid of each region in the top percentile. This allows users to see if the "hotspots" of the environmental factor (Heatmap) align with the "hotspots" of cancer incidence (Dots).

### 2.4 Pie Map (`PieMap.js`)

Visualizes the distribution of multiple cancer types simultaneously for each region.

#### 2.4.1 SVG Generation
*   **Library**: D3.js + Leaflet
*   **Process**:
    1.  Iterates through every geographic feature.
    2.  Extracts rates for all selected cancer types.
    3.  Uses `d3.pie()` to calculate arc angles based on the relative proportions of cancer rates.
    4.  Uses `d3.arc()` to generate SVG path data.
    5.  Embeds the generated SVG into a Leaflet `L.divIcon`.
*   **Interactivity**: Custom event listeners are attached to the SVG paths to trigger Leaflet tooltips, as standard Leaflet markers do not support sub-element events easily.

## 3. Backend Data Processing (`views.py`)

The backend is responsible for standardizing the data structure before sending it to the frontend.

### 3.1 `organize_data` Function
This function transforms the raw database querysets into a dictionary keyed by FIPS codes.

*   **Input**: `CancerIncidence` QuerySet, `FactorMeasurement` QuerySet.
*   **Output**:
    ```json
    {
        "cancer_data": {
            "FIPS_CODE": { "rate": 123.45, "state": "...", "county": "..." }
        },
        "factor_data": {
            "FIPS_CODE": { "rate": 45.67, "state": "...", "county": "..." }
        }
    }
    ```
*   **Purpose**: This dictionary structure allows the frontend `DataManager` to merge data into GeoJSON features in O(1) time per feature, avoiding nested loops which would degrade performance with 3000+ counties.
