# User Manual
The purpose of this guide is to show an example use-case on the geospatial dashboard which can be replicated to distill further insights.

## Quick-Start Guide
This will get you quickly started with any of the map views. For further explination, look for the relevant section below.
**Single Variable Regression Choropleth**
1. Select various filters found in the filter box on the top-left such as geographic level, cancer-type, factor, gender, and race. More information about filters can be found in Chapter 2.
2. Select the desired years out of the availible cancer years and factor years found in the timeline box on the bottom-left.
3. Press "Visualize" button in the filter box.
4. View map / zoom in/out.
5. View regression in bottom right.
**Multiple Regression Choropleth**
To visualize multiple regression, select multiple factors from the list by holding the control key and clicking the desired factors.

**PCA Example Use-Case**
1. Hold control and select multiple factors from the filter box. Ensure that each factor has at least one common year.
2. Press "Run PCA" button in the filter box.
3. Find PCA loading table and Biplot at the bottom of the page.
4. Visualize regression results with each principle component by selecting a PC from the selector box and clicking "Visualize".

**Pie Map**
1. Select the Pie map view from the filter box.
2. Hold control and select multiple cancer types.
3. Select any other relevant filters such as geographic level, sex, and race.
4. Filter by year in the bottom left.
5. Press "Visualize" button from the filter box to view pie charts in each geographic region.

**Heat Map**
1. Select Heat map view from the filter box.
2. Select a cancer type and a factor from the filter box along with geographic level, sex, and race.
3. Filter by year in the bottom left.
4. Press "Visualize".
5. In the legend box (top right), move the slider to view the top x% incidence cases on top of the factor heat map. 

## Chapter 1: Map Selection
Currently, we support 3 visualization options:
**Regression Choropleth:** This map acts as the core analysis tool, providing bivariate insights, correlation and explained varaince.
**Pie Map:** A supporting map that gives a focused view of the highest incidence rates per region and the sex differences.
**Heat Map** A supporting map that provides a closer look at local correlations in cancer incidence rates and a geographic factor.

## Chapter 2: Filters
The **Geospatial Dashboard** works on a number of filters that control the appearence of various visualizations. In combination they aim to provide a holistic and interpretable view of the dataset.

### Geographic Level
**State:** Provides a look at data with less spatial granualarity, and more temporal granularity. This selection also has the benefit of being more stable in 1-year increments due to a larger sample size.
**County** More spatial granularity, but temporal dimension is grouped into 5-year periods for stability.

### Cancer Type
By default, the tool provides incidence rates for Bladder, BrainCNS, Breast, Cervical, Colorectal, Esophageal, Kidney, Leukemia, Liver, Lung, Lymphoma, MyeloidLeukemia, Pancreatic, Prostate, Melenoma, Testicular, Thyroid. sourced from the CDC. Cancer types can be added manually, view Chapter 5 for more details.

### Factors
By default, the tool provides various environmental, health, lifestyle, and index factors. view Chapter 5 for details on how to add new factors.

| Category | Factor | Unit |
|---|---|---|
| **Environmental** | Air Quality (AQI) | Index |
| | Air Toxins Concentration | Micrograms per cubic meter (µg/m³) |
| | Annual Sunlight Exposure | Hours |
| | Annual UV Daily Dose | Joules per square meter (J/m²) |
| | Radon Levels Pre Mitigation 10Y | Picocuries per liter (pCi/L) |
| **Health** | Coronary Heart Disease | Percentage (%) |
| | Depression | Percentage (%) |
| | Diabetes | Percentage (%) |
| | Heart Stroke | Percentage (%) |
| | High Blood Pressure | Percentage (%) |
| | High Cholesterol | Percentage (%) |
| | Hospitalization Gender | Hospitalizations per 100,000 |
| | Hospitalization | Hospitalizations per 100,000 |
| | No Health Insurance | Percentage (%) |
| **Lifestyle** | Binge Drinking | Percentage (%) |
| | No Physical Activity | Percentage (%) |
| | Obesity | Percentage (%) |
| | Short Sleep | Percentage (%) |
| | Smoking | Percentage (%) |
| | Opioid Dispensing Rate | Prescriptions per 100 people |
| **Index** | Social Vulnerability Index | Score (0–1) |

### Sex
This allows you to filter the data by sex. Currently, the options are:
*   **ALL:** Aggregated data for both sexes.
*   **Male:** Data specific to the male population.
*   **Female:** Data specific to the female population.

### Race
For county-level data, race data is limited to preserve privacy and statistical stability.
*   **All Races:** Aggregated data for all racial groups.
*   **White (includes Hispanic):**
*   **Black (includes Hispanic):**
*   **Hispanic (all races):**
*   **Aisian Pacific Islander (includes Hispanic):**
*   **American Indian/Alaskan Native (includes Hispanic):**

For state-level data, more granular race filters may be available depending on the specific dataset.

### Years
**Cancer Year Selection:** This filter allows you to select the specific time period for the cancer incidence data.
*   **State Level:** Data is available in 1-year increments.
*   **County Level:** Data is aggregated into 5-year periods (e.g., 2016-2021) to ensure stability. For county, years are labled by their starting year and are assumed to include the following 5 years.

**Factor Year Selection:** Many environmental and socioeconomic factors are collected at different intervals. This filter allows you to match the factor data year as closely as possible to your selected cancer incidence year.
*   **State Level:** Data is available in 1-year increments.
*   **County Level:** Data is aggregated into 5-year periods (e.g., 2016-2021) to ensure stability. For county, years are labled by their starting year and are assumed to include the following 5 years.
Due to the inconsistant data availibility, details on how 5-year periods were generated are included in the Chapter 5.

## Chapter 3: Principal Component Analysis

Principal Component Analysis (PCA) is a dimensionality reduction technique that transforms a set of correlated factors into a smaller set of uncorrelated variables called **Principal Components (PCs)**. This is useful when you want to understand the combined effect of many factors on cancer incidence rates without running separate regressions for each one.

### Running PCA
1. Select **two or more factors** from the Factor multi-select list in the filter box (hold Ctrl and click to select multiple).
2. Set your desired Geographic Level, Cancer Type, Sex, Race, and Year filters.
3. Click the **"Run PCA"** button. The dashboard will compute PCA on the standardized (zero-mean, unit-variance) factor values across all geographic units for the selected year.
4. Once complete, the **Loadings Heatmap** and **BiPlot** will appear in the bottom-right panel.

### Loadings Heatmap
The Loadings Heatmap displays the contribution (loading) of each original factor to each principal component. Each cell in the grid shows how strongly a factor is associated with a given PC:
- A **high positive value** (dark warm color) means the factor increases along that PC direction.
- A **high negative value** (dark cool color) means the factor decreases along that PC direction.
- A **value near zero** means the factor contributes little to that PC.

Use the heatmap to interpret what each PC represents conceptually. For example, if PC1 has high loadings for Obesity, Diabetes, and No Physical Activity, it likely captures an overall "metabolic health" axis.

### BiPlot
The BiPlot overlays the PC scores for each geographic unit (points) with loading vectors (arrows) for each original factor, in a 2D space defined by two selected PCs.

- **Points** represent individual states or counties. Their position reflects their score on the two selected PCs.
- **Arrows** represent the original factors. Their direction and length indicate how much each factor contributes to the two PCs and whether factors are correlated (arrows pointing in similar directions are positively correlated).
- **Hovering** over a point shows the geographic unit's name and cancer rate.

To change the BiPlot axes:
1. Use the **BiPlot Axes** selectors in the filter box to choose the X and Y principal components.
2. The BiPlot will update automatically.

### Visualizing Regression with a Principal Component
After running PCA, you can use any PC as the independent variable in the regression choropleth map:
1. Select one PCs from the **Principal Components** selector that appears in the filter box after running PCA.
2. Click **"Visualize"**.
3. The choropleth map will color regions by their PC score, and the regression plot will show the relationship between the PC score and the cancer incidence rate, including the R² value and correlation coefficient.
---

## Chapter 4: Tabular View

The **Tabular View** appears at the bottom-left of the dashboard and displays the underlying data used to generate the current map and regression plot in a structured, sortable table.

### What the Table Shows
After clicking **"Visualize"**, the table is populated with the same merged dataset used by the map and regression plot. The columns displayed depend on the current filter selections:

| Column | Description |
|---|---|
| **State** | The state name for each geographic unit. |
| **County** | The county name (County level only). |
| **[Cancer Type] Rate** | The cancer incidence rate per 100,000 population for the selected cancer type, sex, race, and year. |
| **[Factor Name(s)]** | One column per selected factor, showing the factor value for that geographic unit and year. |

All numeric values are formatted to two decimal places. Missing values are displayed as `N/A`.

### Sorting
The table supports sorting by any column:
- Click a **column header** to sort by that column in ascending order.
- Click the **same header again** to reverse to descending order.
- The active sort column is indicated by an arrow icon (↑ for ascending, ↓ for descending). All other columns show a neutral icon (↕) to indicate they are sortable.

### Record Count
The table header shows the total number of records currently displayed, e.g. `(Showing 51 records)` for state-level data or up to ~3,000 records for county-level data.

### Relationship to Other Views
The table always reflects the same filter state as the map and regression plot. Changing filters and clicking **"Visualize"** again will refresh the table alongside the other visualizations.


## Chapter 5: Advanced

### Data Pipeline Overview

Data is loaded into the Django database using the `load_data` management command:

```bash
python manage.py load_data
```

---

### Data Ingestion (`load_data` management command)

This command is defined in `dashboard/management/commands/load_data.py` and performs the following steps in order:

#### 1. Clear Existing Data
All existing records are deleted from the database before reloading to prevent duplicates.

#### 2. Load Factor Measurements
The command scans two directories:
- `data/Factors/County_Level/` — Each `.csv` file represents one factor. The filename (minus `.csv`) becomes the factor name. Each row creates a `FactorMeasurement` record with `geographic_level = County`, `state`, `county`, `statefp`, `countyfp`, `factor_value`, `start_year`, and `end_year`. All county-level factor records default to `gender = All` and `race = All`.
- `data/Factors/State_Level/` — Same structure, but with a single `Year` column. Records are stored with `start_year = Year` and `end_year = Year` and `geographic_level = State`.

#### 3. Load Cancer Incidence
The command scans six sub-folders under `data/Cancer/`:

| Sub-folder | Geographic Level | Stratification |
|---|---|---|
| `county_level/county/` | County | All (no sex/race breakdown) |
| `county_level/county_gender/` | County | By Sex (column: `Sex`) |
| `county_level/county_race/` | County | By Race (column: `Race Ethnicity`) |
| `state_level/state/` | State | All |
| `state_level/state_gender/` | State | By Sex |
| `state_level/state_race/` | State | By Race |

Each `.csv` filename (minus `.csv`) is used as the cancer type name. `CancerType`, `Gender`, and `Race` objects are created via `get_or_create` as needed.

#### Database Models

| Model | Description |
|---|---|
| `CancerType` | Lookup table for cancer type names |
| `Factor` | Lookup table for factor names |
| `Gender` | Lookup table for gender values (`All`, `Male`, `Female`) |
| `Race` | Lookup table for race/ethnicity values |
| `CancerIncidence` | One record per geographic unit × cancer type × gender × race × year period |
| `FactorMeasurement` | One record per geographic unit × factor × year period |

### Adding New Data

#### Adding a New Factor
1. Prepare a CSV file in the correct schema (see Stage 1 output format above).
   - **County-level:** Columns `StateFIPS, State, CountyFIPS, County, Value, Start Year, End Year`
   - **State-level:** Columns `StateFIPS, State, Year, Value`
2. Place the file in the appropriate directory:
   - `geocav_proj/data/Factors/County_Level/<FactorName>.csv`
   - `geocav_proj/data/Factors/State_Level/<FactorName>.csv`
3. Re-run the ingestion command: `python manage.py load_data`

The factor will automatically appear in the Factor dropdown on the dashboard.

#### Adding a New Cancer Type
1. Prepare a CSV file for each applicable stratification (all, gender, race) in the correct schema:
   - **County-level (all):** `StateFIPS, State, CountyFIPS, County, Start Year, End Year, Value`
   - **County-level (gender):** same + `Sex`
   - **County-level (race):** same + `Race Ethnicity`
   - **State-level (all):** `StateFIPS, State, Year, Value`
   - **State-level (gender):** same + `Sex`
   - **State-level (race):** same + `Race Ethnicity`
2. Name the file `<CancerTypeName>.csv` (the filename becomes the display name in the dashboard).
3. Place the file in the appropriate sub-folder under `geocav_proj/data/Cancer/`.
4. Re-run: `python manage.py load_data`

The new cancer type will automatically populate in the Cancer Type dropdown.