# User Manual
The purpose of this guide is to show an example use-case on the geospatial dashboard which can be replicated to distill further insights.

## Quick-Start Guide
**Single Variable Regression Choropleth**
1. Select various filters found in the filter box on the top-left such as geographic level, cancer-type, factor, gender, and race. More information about filters can be found in Chapter 2.
2. Select the desired years out of the availible cancer years and factor years found in the timeline box on the bottom-left.
3. Press "Visualize" button in the filter box.
4. View map / zoom in/out.
5. View regression in bottom right.
**Multiple Regression Choropleth**
To visualize multiple regression, select multiple factors from the list by holding the control key and clicking the desired factors.

**PCA Example Use-Case**

**Pie Map**

**Heat Map**

## Chapter 1: Map Selection
Currently, we support 3 visualization options:
**Regression Choropleth:** This map acts as the core analysis tool, providing bivariate insights, correlation and explained varaince.
**Pie Map:** A supporting map that gives a focused view of the highest incidence rates per region and the sex differences.
**Heat Map** A supporting map that provides a closer look at local correlations in cancer incidence rates and a geographic factor.

## Chapter 2: Filters
The **Geospatial Dashboard** works on a number of filters that control the appearence of various visualizations. Each one aimed at providing a holistic and interpretable view of the dataset.

### Geographic Level
**State:** Provides a look at data with less spatial granualarity, and more temporal granularity. This selection also has the benefit of being more stable in 1-year increments due to a larger sample size.
**County** More spatial granularity, but temporal dimension is grouped into 5-year periods for stability.

### Cancer Type
By default, the tool provides incidence rates for Breast, Esophageal, Kidney, Liver, Lung, Pancreatic, Prostate, and Melenoma cancer sourced from the CDC.
**Note:** Breast cancer is only availible after filtering for "Female" and Prostate is only availible after filtering for "Male".

### Factors
By default, the tool provides various environmental, health, lifestyle, and index factors.

**Environmental**
Air Quality (AQI)
Air Toxins Concentration (Micrograms per cubic meter (µg/m³))
Annual Sunlight Exposure (Hours)
Annual UV DailyDose (Joules per square meter (J/m²))
Radon Levels Pre Mitigation 10Y (Picocuries per liter (pCi/L))
**Health** 
Coronary Heart disease (Percentage (%))
Depression (Percentage (%))
Diabetes (Percentage (%))
Heart stroke (Percentage (%))
High Blood Pressure (Percentage (%))
High Cholesterol (Percentage (%))
Hospitalization Gender (Hospitalizations per 100,000)
Hospitalization (Hospitalizations per 100,000)
No Health Insurance (Percentage (%))
**Lifestyle**
Binge Drinking (Percentage (%))
No Physical Activity (Percentage (%))
Obesity (Percentage (%))
Short Sleep (Percentage (%))
Smoking (Percentage (%))
Opioid Dispensing Rate (Prescriptions per 100 people)

**Index**
Social Vulnerability Index (Score (0-1))

### Sex
This allows you to filter the data by sex. Currently, the options are:
*   **ALL:** Aggregated data for both sexes.
*   **Male:** Data specific to the male population.
*   **Female:** Data specific to the female population.

### Race
For county-level data, race data is limited to preserve privacy and statistical stability.
*   **All Races:** Aggregated data for all racial groups.
*   ****

For state-level data, more granular race filters may be available depending on the specific dataset.

### Years
**Cancer Year Selection:** This filter allows you to select the specific time period for the cancer incidence data.
*   **State Level:** Data is available in 1-year increments.
*   **County Level:** Data is aggregated into 5-year periods (e.g., 2016-2021) to ensure stability. For county, years are labled by their starting year and are assumed to include the following 5 years.

**Factor Year Selection:** Many environmental and socioeconomic factors are collected at different intervals. This filter allows you to match the factor data year as closely as possible to your selected cancer incidence year.
*   **State Level:** Data is available in 1-year increments.
*   **County Level:** Data is aggregated into 5-year periods (e.g., 2016-2021) to ensure stability. For county, years are labled by their starting year and are assumed to include the following 5 years.
Due to the inconsistant data availibility, details on how 5-year periods were generated are included in the Chapter 5.

## Chapter 3: Principle Component Analysis


## Chapter 4: Tabular View


## Chapter 5: Advanced
### Data Merging
### Modularity
### Code Base
### New Data