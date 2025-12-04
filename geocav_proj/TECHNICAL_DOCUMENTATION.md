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

#### 2.4.2 Dynamic Sizing
To visualize the magnitude of cancer incidence across regions, the pie charts are dynamically sized.

*   **Total Rate Calculation**: For each region, the sum of incidence rates for all selected cancer types is calculated.
*   **Global Maximum**: The maximum total incidence rate ($MaxTotal$) across all displayed regions is determined.
*   **Radius Scaling**: The radius of each pie chart is scaled proportional to the square root of its total rate to ensure the *area* of the chart represents the magnitude accurately.
    *   Formula: $Radius = \sqrt{\frac{TotalRate}{MaxTotal}} \times MaxRadius$
    *   **Max Radius**: 40px (for the region with the highest incidence).
    *   **Min Radius**: 1px (to ensure visibility for regions with low but non-zero incidence).
*   **Zero Handling**: Regions with a total rate of 0 are skipped and not rendered.

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

## 3. Configuration & Dataset Updates

The dashboard is designed to be data-driven, meaning that adding new cancer types, environmental factors, or updating data years can be done primarily through the configuration file `dashboard/static/config.js`.

### 3.1 Updating `dashboard/static/config.js`

This file acts as the central registry for all frontend options.

#### 3.1.1 Adding a New Cancer Type
To add a new cancer type (e.g., "Thyroid"):

1.  **Update `CANCER_TYPES_CONFIG`**:
    *   Add "Thyroid" to the `COMMON`, `FEMALE_ONLY`, or `MALE_ONLY` array as appropriate.
    *   Add "Thyroid" to the `ORDER` array to determine its position in the dropdown.
2.  **Update `cancerColorScale`**:
    *   Add "Thyroid" to the `.domain()` array.
    *   Add a corresponding color hex code to the `.range()` array.
3.  **Update Available Years**:
    *   Add a "Thyroid" key to `STATE_CANCER_AVAILABLE_YEARS` with the list of available years (e.g., `[2011, 2012, ...]`).
    *   Add a "Thyroid" key to `COUNTY_CANCER_AVAILABLE_YEARS` with the list of available years.

#### 3.1.2 Adding a New Environmental/Health Factor
To add a new factor (e.g., "Water Quality"):

1.  **Update `FACTORS`**:
    *   Add "Water_Quality" to the `FACTORS` array.
2.  **Update `FACTORS_UNITS`**:
    *   Add a key-value pair: `"Water_Quality": "mg/L"`.
3.  **Update Filter Lists**:
    *   Add "Water_Quality" to `STATE_FACTOR_FILTERS` if data exists at the state level.
    *   Add "Water_Quality" to `COUNTY_FACTOR_FILTERS` if data exists at the county level.
4.  **Update Available Years**:
    *   Add a "Water_Quality" key to `STATE_FACTORS_AVAILABLE_YEARS` with the list of available years.
    *   Add a "Water_Quality" key to `COUNTY_FACTORS_AVAILABLE_YEARS` with the list of available years.

#### 3.1.3 Updating Data Years
To update the years for an existing dataset:

1.  Locate the relevant key in `STATE_CANCER_AVAILABLE_YEARS`, `COUNTY_CANCER_AVAILABLE_YEARS`, `STATE_FACTORS_AVAILABLE_YEARS`, or `COUNTY_FACTORS_AVAILABLE_YEARS`.
2.  Append the new year to the array (e.g., change `[2016]` to `[2016, 2020]`).

### 3.2 Backend Considerations
While the frontend configuration controls the UI, the backend (`dashboard/views.py`) is dynamic and will query the database for whatever parameters are sent. Therefore, **no backend code changes are required** when adding new data types, provided:
1.  The new data has been correctly loaded into the database (`CancerIncidence` or `FactorMeasurement` models).
2.  The `CancerType` or `Factor` names in the database match the strings used in `config.js` (case-insensitive matching is handled, but exact spelling is required).
