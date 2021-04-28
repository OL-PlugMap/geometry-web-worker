# geometry-web-worker
## Web worker based geometry utils

---
This package adds some geometry processing utilities to a web worker to keep it off the main thread for webpages. The worker has been tested on chromium based browsers (chrome and edge) and probably will not work with internet explorer.

This package includes:
1) processing shapefiles from shpjs
1) unkinking and flattening shapes from turfjs
1) converting wkt and esri to ol (WIP)

---

### Shapefile Processing

Motivation: When using shpjs on large or complex shapefiles it may cause the browser to appear to "lock up" and become unresponsive. This is due to the heavy processing inside of the main thread which is also responsible for the ui. Moving this to a web worker provides a better user experience.

The worker has the ability to prompt, open, and extract features from a shapefile with the help of shpjs.

When you call promptAndProcessShapefile an input element is injected into the document and clicked. Once a file has been selected the contents are passed to the web worker which will extract the features within. This function returns a promise.

The returned promise from promptAndProcessShapefile will resolve with an array of features that have been extracted.

The rejection is still being worked on but should provide an explination as to why the file cannot be processed soon.

---

### Shape Flattening

Motivation: Often when users are drawing a shape in a web based map application they will create overlapping or kinked (aka bowties and such) shapes. The flattening process resolves both of these.

Note: Currently the process will simplify if the input shapes have over 5000 verticies. Additionally if the flattened shape has over 5000 verticies it will also attempt simplification. The ability to turn this on or off as well as adjusting the simplification cutoff will be coming soon. Additionally the processor does its best job at unkinking and as a result occasionally erases any holes within a polygon.

When calling flattenShapes either a GeoJSON FeatureCollection or an Array of GeoJSON features should be passed in. The contained features should have a geometry type of Polygon or MultiPolygon This function returns a promise.

The returned promise is resolved with a Feature. If the provided areas are all overlapping the resulting shape should be a polygon. If there are any disconnected areas it should result in a MultiPolygon.


---

### Sample Usage


```javascript
/*
    Processing a shapefile
*/

import { promptAndProcessShapefile } from 'geometry-web-worker'

promptAndProcessShapefile().then(features => 
    { 
        //Features is an array of features
    })
    .catch((err) => 
    { 
        
    });


/*
    Flattening a feature collection
*/

let featureCollection = {
	"type": "FeatureCollection",
	"features": [{
		"type": "Feature",
		"properties": {},
		"geometry": {
			"type": "Polygon",
			"coordinates": [
				[
					[-113.115234375, 41.413895564677304],
					[-113.2635498046875, 41.23238023874139],
					[-113.038330078125, 41.091772220976644],
					[-112.8021240234375, 41.20758898181025],
					[-112.96142578125, 41.413895564677304],
					[-113.115234375, 41.413895564677304]
				]
			]
		}
	}, {
		"type": "Feature",
		"properties": {},
		"geometry": {
			"type": "Polygon",
			"coordinates": [
				[
					[-112.69775390625, 41.44684402008925],
					[-112.9888916015625, 41.261291493919884],
					[-112.8131103515625, 40.992337919312305],
					[-112.60986328125, 41.0130657870063],
					[-112.69775390625, 41.44684402008925]
				]
			]
		}
	}, {
		"type": "Feature",
		"properties": {},
		"geometry": {
			"type": "Polygon",
			"coordinates": [
				[
					[-113.1536865234375, 40.87614141141369],
					[-113.1427001953125, 40.8595252289932],
					[-113.17565917968749, 40.74725696280421],
					[-112.9449462890625, 40.56389453066509],
					[-112.664794921875, 40.58058466412761],
					[-112.5604248046875, 40.713955826286046],
					[-112.6812744140625, 40.851215574282456],
					[-112.9449462890625, 40.867833841384936],
					[-113.1536865234375, 40.87614141141369]
				]
			]
		}
	}]
};

import { flattenShapes } from 'geometry-web-worker'

flattenShapes(featureCollection).then(flattenedFeature =>
    {
        // Flattened Feature should be a single feature that contains the
        // union of all the features in the provided feature collection
    });

```