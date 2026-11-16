# Multi-Sensor Optical–SAR Data Fusion (Sentinel-1 & Sentinel-2) for Land Use and Land Cover (LULC) Classification in the Choke Mountains, Ethiopia

## Overview
This repository provides the workflow and implementation for **Optical–SAR Data Fusion** integrating **Sentinel-1 C-band Synthetic Aperture Radar (SAR)** and **Sentinel-2 Multispectral Instrument (MSI)** imagery to map Land Use and Land Cover (LULC) across the **Choke Mountains**, located in the **Upper Blue Nile (Abay) Basin, Northwestern Ethiopia**.

Persistent cloud cover during the *Kiremt* (main rainy) season, steep Afroalpine elevation gradients, and complex smallholder agro-ecosystems make single-sensor optical mapping challenging in the Ethiopian highlands. By fusing Sentinel-1 structural/backscatter features with Sentinel-2 spectral and red-edge indices, this pipeline overcomes cloud-gap limitations and significantly improves class separability between spectrally similar land covers (e.g., Afroalpine moorlands, degraded grasslands, croplands, and *Eucalyptus* plantations).

> **Note on SAR Pre-Processing Dependency:** The complete workflow relies on a separate upstream **Sentinel-1 Analysis-Ready Data (ARD)** pre-processing pipeline implemented via **`s1_ard.js`** (v1.2, Mullissa et al., 2021) in Google Earth Engine (GEE) prior to feature extraction and optical–SAR fusion.

---

## Study Area: Choke Mountains
* **Location:** East Gojjam Zone, Amhara Region, Upper Blue Nile (Abay) Basin, Northwestern Ethiopia.
* **Elevation Gradient:** ~2,100 m to over 4,050 m a.s.l. (known as the *"Water Tower of the Upper Blue Nile"*).
* **Agro-Ecological Zones:** Spans moist *Weyna Dega* (midland), *Dega* (highland), and *Wurch* (Afroalpine) zones, serving as the headwaters for major Abay tributaries (including the Muga, Chemoga, Gedeb, and Bersa watersheds).
* **Key Mapping Challenges:** Frequent cloud cover, terrain shadow effects, fragmented smallholder plots, and seasonal phenological shifts.

---

## Data Sources
* **Sentinel-1 (SAR):** Level-1 Ground Range Detected (GRD) Interferometric Wide (IW) swath mode, dual-polarization (**VV** and **VH**), 10m spatial resolution—pre-processed into Analysis-Ready Data (ARD) using `s1_ard.js`.
  * *Derived Features:* Terrain-corrected backscatter coefficients ($\gamma^0_{VV}$, $\gamma^0_{VH}$), cross-polarization ratio ($VH/VV$), Radar Vegetation Index (RVI), and GLCM texture metrics.
* **Sentinel-2 (Optical):** Level-2A Surface Reflectance, 10m and 20m bands (Blue, Green, Red, Red Edge 1–3, NIR, SWIR 1–2).
  * *Derived Indices:* NDVI, EVI, NDWI, NDBI, and Bare Soil Index (BSI).
* **Topographic Data:** Copernicus / SRTM 30m Digital Elevation Model (DEM) used for radiometric slope correction in `s1_ard.js` and auxiliary terrain predictors (elevation, slope, aspect, TPI).
* **Reference Data:** Ground-truth GPS points and high-resolution imagery polygons stratified across elevation zones for model training and validation.

---

## Methodology & Fusion Workflow

### Stage 1: Sentinel-1 SAR ARD Pre-Processing (External Pipeline — `s1_ard.js`)
Before running the fusion and classification scripts, raw Sentinel-1 GRD collections must be processed into Analysis-Ready Data using the dedicated GEE pipeline:
* **Pipeline Script:** `s1_ard.js` (Version `v1.2` | Date: `2021-03-10` | License: MIT)
* **Authors:** Mullissa A., Vollrath A., Braun C., Slagter B., Balling J., Gou Y., Gorelick N., Reiche J.
* **Description:** Generates an analysis-ready Sentinel-1 image collection tailored for rugged terrain.
* **Core Operations Applied:**
  1. Additional border noise removal.
  2. Multi-temporal / spatial speckle filtering (e.g., Refined Lee, Quegan & Yu).
  3. **Radiometric Terrain Normalization (Volume/Surface model)** using the 30m DEM—essential for mitigating foreshortening, layover, and slope-induced backscatter distortion across the steep Choke Mountains.
  4. Export/handoff of calibrated $\gamma^0_{VV}$ and $\gamma^0_{VH}$ bands (in linear or $dB$ scale) to GEE Assets or GeoTIFFs for Stage 3 fusion.

### Stage 2: Sentinel-2 Optical Pre-Processing
1. Cloud and cloud-shadow masking via the Scene Classification Layer (SCL) / `s2cloudless`.
2. Resampling 20m Red Edge and SWIR bands to 10m resolution.
3. Temporal compositing (median/percentile composites) and calculation of vegetation, water, and bare soil indices (NDVI, EVI, NDWI, NDBI, BSI).

### Stage 3: Feature-Level Data Fusion
* Co-registration and layer stacking of the `s1_ard.js` outputs (VV, VH, polarization ratios, GLCM textures), Sentinel-2 spectral bands/indices, and DEM topographic derivatives onto a unified **10m spatial grid**.
* Feature importance ranking (Mean Decrease in Impurity / Permutation Importance) to eliminate redundant predictors.

### Stage 4: Classification & Benchmarking
* **Classifiers:** Random Forest (RF), Gradient Tree Boost (GTB), or Support Vector Machine (SVM).
* **Experimental Comparison:** Evaluates classification performance across feature combinations:
  1. *Sentinel-1 ARD Only* (`s1_ard.js` outputs)
  2. *Sentinel-2 Optical Only*
  3. *Fused Optical + SAR ARD*
  4. *Fused Optical + SAR ARD + Topographic (DEM)*
* **Target LULC Classes:**
  1. Cultivated Land (Smallholder Cropland)
  2. Natural Forest / Church Forests
  3. Plantation Forest (*Eucalyptus* spp.)
  4. Afroalpine Moorland / *Erica* Shrubland
  5. Grassland / Grazing Land
  6. Wetland / Marshy Area
  7. Built-up / Settlements
  8. Bare Land / Degraded Rock Outcrops
  9. Water Bodies

### Stage 5: Accuracy Assessment
* Stratified 70/30 train-test split across agro-ecological zones.
* Evaluated using **Overall Accuracy (OA)**, **Kappa Coefficient**, **F1-Score**, **Producer’s Accuracy (PA)**, and **User’s Accuracy (UA)**.

---

## Repository Structure
```text
choke-mountains-optical-sar-lulc/
├── data/
│   ├── boundary/             # Choke Mountains / watershed boundary (.shp / .gpkg)
│   ├── samples/              # Stratified ground-truth training & validation data
│   └── ancillary/            # DEM and agro-ecological zone masks
├── scripts/
│   ├── 01_s1_ard_wrapper/          # Reference/config for external s1_ard.js (v1.2) GEE pipeline
│   ├── 02_s2_optical_processing.py # Cloud masking, compositing, spectral indices
│   ├── 03_feature_fusion.py        # Stacking S1 ARD + S2 Optical + DEM layers
│   ├── 04_classification.py        # RF/GTB/SVM training (S1 vs S2 vs Fused)
│   └── 05_accuracy_assessment.py   # Confusion matrices, F1-scores, area stats
├── outputs/
│   ├── composites/           # Analysis-ready fused multi-band stacks
│   ├── maps/                 # Classified LULC GeoTIFFs (Optical, SAR, Fused)
│   └── metrics/              # Accuracy comparison tables & feature importance plots
├── environment.yml           # Conda dependencies
└── README.md
