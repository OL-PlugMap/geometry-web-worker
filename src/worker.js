"use strict";

import { toMercator } from "@turf/projection";

import * as shp from "../node_modules/shpjs/dist/shp";


import simplify from "@turf/simplify"
import unkinkPolygon from "@turf/unkink-polygon";
import booleanWithin from "@turf/boolean-within";
import union from "@turf/union";
import difference from "@turf/difference";
import buffer from "@turf/buffer";



/**
 * This worker script is responsible for calculating the area of project areas.
 * It can be run in parallel on more than one cpu core, and off the main thread,
 * so that when the app starts we don't have to block the UI and wait for up to
 * 50 project areas to be calculated.
 *
 * We could not use OpenLayers here due to it being architected in such a way that
 * certain modules break in a WebWorker environment (b/c source code accesses `window`,
 * which is not available in this context and immediately causes an exception to be thrown),
 * thus we rely on mapbox/wellknown and js to do the work.
 */



// This is our main message handling function. It should redirect all the messages to their appropriate functions
onmessage = e => 
{
  try
  {
    const msg = e.data;
    switch(msg.type)
    {
      case "processUpload": {
        log("Process Upload Top");
        processShapefileMsg(msg);
        log("Process Upload Bottom" );
      } break;
      
      case "flatten": {
        log("Flatten Shapes Top");
        processFlattenShapeMsg(msg);
        log("Flatten Shapes Bottom");
      }; break;

      default: {
        //Do nothing
      }
    }
  }
  catch(EXCEPT)
  {
    error("Unhandled onmessage error", EXCEPT)
  }
};





const log = msg => {
  postMessage({ type: "log", "msg": msg });
}

const error = (msg,err) => {
  postMessage({ type: "error", "msg": msg, "error": err });
}

const processShapefileMsg = msg => {
  try {
    let maxTries = 10;
    if(msg.files)
    {
      for (var i = 0; i < msg.files.length; i++)
      {
        log("Processing file " + i );
        var file = msg.files[i];

        const reader = new FileReader();
        const fileName = file.name;
        const fileType = file.type;
        const fileSize = file.size;

        reader.addEventListener(
          "load",
          evt => {
            postMessage({ type: "processingFile", id: msg.id });
            
            postMessage({ type: "processingFeatures", id: msg.id });

            shp(evt.target.result).then(
              geojsons => {

                if(!Array.isArray(geojsons))
                  geojsons = [ geojsons ];

              
                let res = [];
                for(let geojson of geojsons)  
                {
                  let isGeographic = isGeometryGeographicHack(geojson);
                  if (isGeographic) {
                    geojson = toMercator(geojson);
                  }
                  
                  for(var feat of geojson.features)
                  {
                    res.push(
                      {
                        feature: feat
                      }
                    )
                  }
                }
                
                postMessage({ type: "uploadProcessed", features: res.map(a => a.feature), fileInfo: { name: fileName, type: fileType, size: fileSize } });

                //close();
                reader.abort();

              },
              reason => {
                maxTries --;
                let errorType = -1;
                let msg = null;
                var fatal = true;

                switch (reason.message) {
                  case "Failed to execute 'open' on 'XMLHttpRequest': Invalid URL":
                    //shp.js causes this for whatever reason
                    msg = [ 'Couldnt open file.' ]
                    errorType = 0;
                    fatal = false;
                    break;
                  case "forgot to pass buffer":
                    errorType = 1;
                    msg = [ "Could not open the file. Is it corrupt?" ] //"Shapefile reader needs a valid ArrayBuffer to read from.";
                    break;
                  case "Can't find end of central directory : is this a zip file ? If it is, see http://stuk.github.io/jszip/documentation/howto/read_zip.html":
                    errorType = 2;
                    msg = [`This file does not look like a zip file or it is corrupt.`,  `The uploaded file must be a zip file containing, at minimum, the following extensions:`, `shp, dbf, prj.`]
                    break;
                  case "SyntaxError":
                    errorType = 3;
                      msg = [`This file does not look like a zip file or it is corrupt.`,  `The uploaded file must be a zip file containing, at minimum, the following extensions:`, `shp, dbf, prj.`]
                      break;
                  case "no layers founds":
                    errorType = 10;
                    msg = [`The uploaded file must be a zip file containing, at minimum, the following extensions:`, `shp, dbf, prj.`];
                    break;
                  case "I don't know that shp type":
                    errorType = 11;
                    msg = [`Tried to parse an invalid or unsupported shape type.`, `Please upload a shapefile with only features of the supported types:`, `Point, MultiPoint, LineString, MultiLineString, Polygon, or MultiPolygon.` ];
                    break;
                  default:
                    msg = [`Unable to parse the file. Unknown Error.`, `Additional information: ` + reason.message ];
                    fatal = false;
                    break;
                }
                //TODO: Return the error to elm land here
                if(maxTries == 0)
                { 
                  errorType = 100; 
                  msg = [`Exceeded maximum number of errors while parsing this file.`, `The uploaded file must be a zip file containing, at minimum, the following extensions:`, `shp, dbf, prj.`]
                  fatal = true;
                }

                //if(msg)
                postMessage({ type: "uploadError", id: msg.id, error: msg || reason, errorType : errorType, fatal: fatal });

                if(fatal)
                  reader.abort();
              }
            )
            .catch((error) => {
              postMessage({ type: "uploadError", error: [ error ], errorType: -1, fatal: true });
            })
              
            
          },
          err =>
          {
            postMessage({ type: "uploadError", error: [ err ], errorType: -1, fatal: true });
            reader.abort();
          }
        );
        
        postMessage({ type: "openingFile", id: msg.id });
        reader.readAsArrayBuffer(file);
      }
    }
    else
    {
      log("Message didnt have any files!");
    }
  } catch (err) {
    debugger;
    error("Unhandled error in upload shapefile", err );
  }
}

const flattened = (id, shape, source) => {
  postMessage({
    type: "flattened",
    id: id,
    geoJSON: shape,
    source: source
  });
}

const defaultFlattenShapeParams = {
  vertexCutoff: 5000
}

// Params are optional
// shapes is an array of geojson feature

const processFlattenShapeMsg = msg => {
  
  log("Getting the params")

  let params = msg.params || defaultFlattenShapeParams;

  let shapes = msg.shapes;

  if(!Array.isArray(shapes))
  {
    if(shapes.type == "FeatureCollection")
    {
      shapes = shapes.features;
    }
  }

  if(!Array.isArray(shapes))
  {
    error("Passed in param was not an array of features or a feature collection. Cannot process", shapes);
  }

  let flat = null;
          
  if(shapes.length > 1) //If we have more than one feature, merge it
  {
    log(`Processing ${shapes.length} shapes`)
    let featsToMerge = [];

    
    for(var f of shapes)
    {
      log(`Processing ${f}`);
      if (f.geometry.type === 'MultiPolygon') {
        for(var r of f.geometry.coordinates)
        {
          let f = polygon(r)
          f = simplifyIfGreaterThan(params.vertexCutoff, f, 50, 1, 2);
          featsToMerge.push(f)
        }
      } else {
        f = simplifyIfGreaterThan(params.vertexCutoff, f, 50, 1, 2);
        featsToMerge.push(f);
      }
    }

    
    log("Merging shapes")
    flat = mergeFeatures(featsToMerge, params, false);
  }
  else if(shapes.length > 0)
  {
    flat = shapes[0]
  }

  if(!flat)
  {
    log("Didnt get a flat shape :(")
    flattened(msg.id, null, msg.source);
  }
  else
  {

    log("Simplifying the flattened area");
    flat = simplifyIfGreaterThan(params.vertexCutoff, flat, 50, 1, 2);
    
    log("Returning flat shape")
    flattened(msg.id, flat, msg.source);
        
  }
}

function isGeometryGeographicHack(geojson) {
  switch (geojson.features[0].geometry.type) {
    case "Point":
      return isCoordinateGeographicHack(
        geojson.features[0].geometry.coordinates[0]
      );

    case "MultiPoint":
      return isCoordinateGeographicHack(
        geojson.features[0].geometry.coordinates[0][0]
      );

    case "LineString":
      return isCoordinateGeographicHack(
        geojson.features[0].geometry.coordinates[0][0]
      );

    case "MultiLineString":
      return isCoordinateGeographicHack(
        geojson.features[0].geometry.coordinates[0][0][0]
      );

    case "Polygon":
      return isCoordinateGeographicHack(
        geojson.features[0].geometry.coordinates[0][0][0]
      );

    case "MultiPolygon":
      return isCoordinateGeographicHack(
        geojson.features[0].geometry.coordinates[0][0][0][0]
      );

    default:
      throw new Error(`Tried to parse an invalid or unsupported shape type.
      To create a project area, please upload a shapefile with only features 
      of the supported types: Point, MultiPoint, LineString, MultiLineString, 
      Polygon, or MultiPolygon.`);
  }
}

function isCoordinateGeographicHack(x) {
  let value = Math.abs(x);
  return value > -10000 && value < 10000;
}



const POINT = "Point";
const LINE = "LineString";
const POLYGON = "Polygon";
const MULTI_POINT = "MultiPoint";
const MULTI_LINE = "MultiLineString";
const MULTI_POLYGON = "MultiPolygon";
const CIRCLE = "Circle";

function simplifyIfGreaterThan(limit, geojson, itr, tol, tolIncr, lastCount, dupeCountCount) {
  
  if (!limit) {
    limit = 1000;
  }

  if(itr == undefined)
    itr = 100;

  if(tol == undefined)
    tol = 0.1;
  
  if(tolIncr == undefined)
    tolIncr = 0.1;

  if(itr == 0)
    return geojson;


  let verticeCount;
  switch (geojson.geometry.type) {
    case POLYGON:
      verticeCount = geojson.geometry.coordinates[0].length;
      break;

    case MULTI_POLYGON:
      verticeCount = 0;
      for (let geo of geojson.geometry.coordinates) {
        for (let coords of geo) {
          verticeCount += coords.length;
        }
      }
      break;

    default:
      verticeCount = 0;
      break;
  }

  if(lastCount == undefined)
    lastCount = 9999999999;

  if(lastCount == verticeCount)
  {
    
    if(dupeCountCount == undefined)
      dupeCountCount = 0;
    dupeCountCount ++;

    if(dupeCountCount > 3) //If we have had the same count for the last three attempts were probably not going to reduce anumore
      return geojson;
  }
  else
  {
    dupeCountCount = undefined;
  }

  if (verticeCount >= limit) {
    try
    {
      return simplifyIfGreaterThan(limit, simplify(geojson, { tolerance: tol }), itr - 1, tol * tolIncr, tolIncr, verticeCount, dupeCountCount);
    }
    catch(ex) {
      return geojson;
    }
  }
  else
  {
    return geojson;
  }
}


function mergeFeatures(features, skipRemove) {
  if (!features || !features.length) return null;

  if (features.length == 1) {
    return skipRemove ? features[0] : removeIntersections(features[0]).features[0]; ; //Union one feature is one feature
  }
  let hb = features.shift();
  let head = skipRemove ? hb : removeIntersections(hb).features[0];
  if(!head)
    head = hb;

  //head = this.removeIntersections(head).features();

  for (let feature of features) {
    var uk_feature = skipRemove ? feature : removeIntersections(feature).features[0];
    try
    {
      head = union(head, uk_feature);
    } catch(ex)
    {
      debugger;
      try
      {
        let f1 = buffer(head,0.1);
        let f2 = buffer(uk_feature,0.1);
        head = union(f1, f2);
      }
      catch(ex2)
      {
        debugger;
        //Dunno what to do here
        // console.warn("Unable to merge features");
        // console.warn(ex)
        // console.warn(ex2)
      }
    }
  }

  return head;
}

