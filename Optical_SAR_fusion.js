// ------------------------------------------------------------------------
// Prerequisites

// Process Sentinel-1A IW GRD data in advance. 

// Prepare the Sentinel-1 Analysis Ready Data (ARD) in a separate environment.

// Import the prepared S1A ARD dataset from your Earth Engine Assets.


// Feature Preparation


// Create a third band using the VV and VH backscatter bands:

// VV / VH ratio — Highlights surface scattering relative to vegetation volume scattering

// Provides better separation of built-up areas, bare soil, and croplands

// ------------------------------------------------------------------------------------------ 

//************************************************************** 
// Assets
//**************************************************************
var roi = ee.FeatureCollection("projects/ee-my-gebeyehuab/assets/ChokeMount"), 
LULCpts = ee.FeatureCollection("projects/ee-my-gebeyehuab/assets/choke_mt_gcp");

// Import pre-processed Sentinel-1 SAR image
//var s1sar = ee.Image(
//  "users/Gebeyehu_A/COPERNICUS_S1_GRD_FLOAT_S1A_IW_GRDH_1SDV_20190106T030918_20190106T030943_025351_02CE5B_4008"
//); 
 
 
// Visualization parameters 
var rgbVis = {
  min: 0.0,
  max: 3000,
  bands: ['B4', 'B3', 'B2'],  // Natural color composite
};

// Define year and date range
var year = 2019;
var startDate = ee.Date.fromYMD(year, 1, 1);
var endDate = startDate.advance(1, 'year');

// Sentinel-2 Collection
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED');

// Apply filters
var filtered = s2
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
  .filter(ee.Filter.date(startDate, endDate))
  .filterBounds(roi);

// Load Cloud Score+ dataset
var csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
var csPlusBands = csPlus.first().bandNames();

// Link Cloud Score+ bands with Sentinel-2 images
var filteredS2WithCs = filtered.linkCollection(csPlus, csPlusBands);

// Function to mask pixels with low Cloud Score+
function maskLowQA(image) {
  var qaBand = 'cs';
  var clearThreshold = 0.5;
  var mask = image.select(qaBand).gte(clearThreshold);
  return image.updateMask(mask);
}

// Apply mask
var filteredMasked = filteredS2WithCs
  .map(maskLowQA)
  .select('B.*');

// Create median composite
var composite = filteredMasked.median();

// Display composite
Map.addLayer(composite.clip(roi), rgbVis, 'Sentinel-2 Composite');


// Import pre-processed Sentinel-1 SAR image from your EE assest
// create the third band from  VV/VH ratio
//Combine VV, VH, and VV/VH into a single SAR composite

var s1sar = ee.Image('projects/ee-my-gebeyehuab/assets/S1_composite_choke/S1A_IW_GRDH_20240109');

// Select VV polarization
var VV = s1sar.select('VV');
print('VV band', VV);

// Select VH polarization
var VH = s1sar.select('VH');
print('VH band', VH);

// Compute VV/VH ratio
var VV_VH = VV.divide(VH).rename('VV_VH');
print('VV/VH ratio', VV_VH);

// Combine VV, VH, and VV/VH into a single SAR composite
var SAR_composite = VV
  .addBands(VH)
  .addBands(VV_VH);

print('SAR composite', SAR_composite);


// Visualization parameters for Sentinel-1 SAR composite (VV, VH, VV/VH)
var sarVis = {
  bands: ['VV', 'VH', 'VV_VH'],
  min: [-20, -25, 0],
  max: [0, -5, 10]
};

// Display Sentinel-1 SAR composite clipped to the ROI
Map.addLayer(
  SAR_composite.clip(roi),
  sarVis,
  'Sentinel-1 SAR Composite (VV, VH, VV/VH)'
);





var S2S1_composite = composite.addBands(SAR_composite);



//**************************************************************
// Training Data
//**************************************************************
// Use uploaded Ground Control Points (LULCpts) as training data
// The GCPs must have a 'landcover' property defined
var training = S2S1_composite.sampleRegions({
  collection: LULCpts, 
  properties: ['lucode17'], 
  scale: 10
});

//**************************************************************
// Classification
//**************************************************************
// Train Random Forest Classifier
var classifier = ee.Classifier.smileRandomForest({
  numberOfTrees: 50
}).train({ 
  features: training,  
  classProperty: 'lucode17', 
  inputProperties: S2S1_composite.bandNames()
});

// Classify the composite
var classified = S2S1_composite.classify(classifier);

//**************************************************************
// Visualization
//**************************************************************
Map.centerObject(roi);

// Define palette (adjust order to match your class labels)
var palette = ['#cc6d8f', // Urban
              '#ffc107', // Bare
              '#1e88e5', // Water
              '#004d40'  // Vegetation
];

// Add classified map
Map.addLayer(classified.clip(roi), {min: 0, max: 3, palette: palette}, 'LULC Classification');


//**************************************************************
// Accuracy Assessment
//**************************************************************

// Split the GCP dataset into training and validation sets
// (70% for training, 30% for validation)
var withRandom = LULCpts.randomColumn('random', 42); // seed = 42 for reproducibility
var trainingGcp = withRandom.filter(ee.Filter.lt('random', 0.7));
var validationGcp = withRandom.filter(ee.Filter.gte('random', 0.7));

// Redefine training with the training subset
var training = S2S1_composite.sampleRegions({
  collection: trainingGcp,
  properties: ['lucode17'],
  scale: 10
});

// Retrain classifier with training subset
var classifier = ee.Classifier.smileRandomForest({
  numberOfTrees: 50
}).train({
  features: training,
  classProperty: 'lucode17',
  inputProperties: S2S1_composite.bandNames() 
});

// Classify composite
var classified = composite.classify(classifier); 

// Validation using independent subset
var validation = S2S1_composite.sampleRegions({
  collection: validationGcp,
  properties: ['lucode17'],
  scale: 10,
  tileScale: 16
});

// Classify validation points
var validated = validation.classify(classifier);

// Confusion Matrix
var confusionMatrix = validated.errorMatrix('lucode17', 'classification'); 
print('Confusion Matrix', confusionMatrix);
print('Overall Accuracy', confusionMatrix.accuracy());
print('Kappa Coefficient', confusionMatrix.kappa()); 
print('Producer\'s Accuracy', confusionMatrix.producersAccuracy());
print('User\'s Accuracy', confusionMatrix.consumersAccuracy());  



// Export classified raster to Asset
Export.image.toAsset({
  image: classified,
  description: 'RF_classified_2019',     // Task name in Tasks tab
  assetId: 'users/Gebeyehu_A/RF_classified_2019', // Change to your asset path
  region: roi,
  scale: 30,
  maxPixels: 1e13,
  crs: 'EPSG:32637' 
});

