# User Manual for Molecular and Network Analysis

This document details the technical implementation of the molecular analysis and network analysis modules.

##Overview

The Molecular and Network Analysis modules allow users to explore mutation-level data across cancer types. These tools provide interactive visualizations for:
* Mutational landscape
* Gene co-occurrence and mutual exclusivity
* Clinical associations
* Mutation burden and demographic associations
* Network-based relationships among genes

Common Features Across All Pages
* A Cancer Type selector is available at the top of each page
* Filters apply to all visualizations on the current page
* Plots are interactive (hover, zoom, pan)
* Each plot includes a Download as PNG option from the plot toolbar

##Mutational Landscape Page

###Purpose

Provides an overview of mutation distribution and gene-level mutation frequency across samples.

###Quick Start

1. Select a Cancer Type.
2. Choose optional filters:
* Mutation burden filter
* Impact
3. Click Apply Filters (if available).
4. Explore updated plots.

###Visualizations

1. Variant type distribution
2. Top mutated genes
3. Mutation burden (mutations per sample)
4. Mutated gene count (unique genes per sample)

##Gene Co-occurrence Page

###Purpose

Identifies gene pairs that co-occur or show mutual exclusivity within samples.

Includes:
* Raw co-occurrence frequency
* Fisher’s Exact Test–based significance

###Quick Start

1. Select a Cancer Type.
2. Choose up to 20 genes (optional).
* If none selected, top genes are used automatically.
3. Select optional Impact filter.
4. Select Raw co-occurence or Fisher OR (sig) for heatmap
5. Click Compute Heatmap.

##Clinical Distributions

###Purpose

Provides data distribution of clinical attributes:
* Age at diagnosis
* Pathological stage
* Treatment combination
* Vital status

###Quick Start

1. Select a Cancer Type.

##Demographic Associations Page

###Purpose

This page explores how mutation burden and gene mutation frequencies vary across:
* Age
* Gender
* Race
* Ethnicity
It combines mutation burden summaries with gene-level prevalence across demographic groups.

###Quick Start

1. Select a Cancer Type from the dropdown.
2. Choose optional filters:
* Genes (multi-select, max 20)
* Variant Classification
* Impact (e.g., HIGH, MODERATE)
3. Search & add gene if you're looking for a specific gene
4. Click Apply Filters.
5. Use Reset Filters to return to default top genes.

Visualizations
1. Age vs Mutation Burden
* Displays median mutation count across age bins.
2. Mutation Burden by Gender
* Boxplot of total mutation counts per gender.
3. Top Genes × Demographic Groups
Grouped bar plots showing mutation frequency across:
* Race
* Ethnicity
* Gender
* Age Group

##Network Analysis Page

###Purpose

Visualizes a sequence similarity network for each cancer type. The nodes represent the tumor sample and the edges represent the distance between them in terms of edit distance. The network is computed using a Nearest Neighbor model variant called DiWANN - Directed Weighted All Nearest Neighbors.

###Quick Start

1. Select a Cancer Type.
2. Click Display Network to visualize the network.
3. Click Cluster Network to cluster the network using Leiden algorithm.
4. Interact with the network visualization and see detailed node information on hover.
5. Click on Download PNG to download the network image.

##Molecular Data Source

Patient-level somatic mutation data (mutation annotation format) and associated clinical data is downloaded from the Cancer Genome Atlas (TCGA) database using the R package 'TCGAbiolinks'.

The TCGA cancer projects include:
* Breast - TCGA-BRCA
* Cervical - TCGA-CESC
* Colorectal - TCGA-COAD
* Esophageal - TCGA-ESCA
* Kidney - TCGA-KIRC
* Liver - TCGA-LIHC
* Lung - TCGA-LUAD
* Lymphoma - TCGA-DLBC
* Pancreatic - TCGA-PAAD
* Prostate - TCGA-PRAD
* Skin - TCGA-SKCM
* Thyroid - TCGA-THCA

##Data Load and Preprocessing Commands

###Load Molecular Data

The preprocess_from_config function does the required preprocessing and loads the maf data file into the webtool database.

An example on how to use the command:
python manage.py preprocess_from_config --cancer lung --truncate

###Load Network Metadata

The load_network_node_meta command loads the network meta data, seen on hovering over nodes on the network analysis page.

An example on how to use the command:
python manage.py load_network_node_meta --folder lung --cancer-name "Lung Cancer"

Make sure the molecular files for each cancer type are stored in seperate folders (e.g. lung, liver, pancreatic, etc.) for both the commands.

