"use strict";

import { toMercator } from "@turf/projection";

import * as shp from "../node_modules/shpjs/dist/shp";





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



const log = msg => {
  postMessage({ type: "log", "msg": msg });
}

onmessage = e => 
{
  try
  {
    const msg = e.data;
    switch(msg.type)
    {
      case "processUpload": {
        log("Process Upload Top");
        try {
          let maxTries = 10;
          if(msg.files)
          {
            for (var i = 0; i < msg.files.length; i++)
            {
              log("Processing file " + i );
              var file = msg.files[i];

              const reader = new FileReader();
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
                      
                      postMessage({ type: "uploadProcessed", features: res.map(a => a.feature)});

                      //close();
                      reader.abort();

                    },
                    reason => {
                      maxTries --;
                      let msg = null; //reason.message;
                      var fatal = true;
                      switch (reason.message) {
                        case "forgot to pass buffer":
                          msg = [ "Could not open the file. Is it corrupt?" ] //"Shapefile reader needs a valid ArrayBuffer to read from.";
                          break;
                        case "I don't know that shp type":
                          msg = [`Tried to parse an invalid or unsupported shape type.`, `Please upload a shapefile with only features of the supported types:`, `Point, MultiPoint, LineString, MultiLineString, Polygon, or MultiPolygon.` ];
                          break;
                        case "no layers founds":
                          msg = [`The uploaded file must be a zip file containing, at minimum, the following extensions:`, `shp, dbf, prj.`];
                          break;
                        case "Can't find end of central directory : is this a zip file ? If it is, see http://stuk.github.io/jszip/documentation/howto/read_zip.html":
                          msg = [`This file does not look like a zip file or it is corrupt.`,  `The uploaded file must be a zip file containing, at minimum, the following extensions:`, `shp, dbf, prj.`]
                          break;
                        case "SyntaxError":
                            msg = [`This file does not look like a zip file or it is corrupt.`,  `The uploaded file must be a zip file containing, at minimum, the following extensions:`, `shp, dbf, prj.`]
                            break;
                        case "Failed to execute 'open' on 'XMLHttpRequest': Invalid URL":
                          //shp.js causes this for whatever reason

                          fatal = false;
                          break;
                        default:
                          debugger;
                          msg = [`Unable to parse the file. Unknown Error.`, `Additional information: ` + reason.message ];
                          fatal = false;
                          break;
                      }
                      //TODO: Return the error to elm land here
                      if(maxTries == 0)
                      {  msg = [`Exceeded maximum number of errors while parsing this file.`, `The uploaded file must be a zip file containing, at minimum, the following extensions:`, `shp, dbf, prj.`]
                        fatal = true;
                      }

                      //if(msg)
                      postMessage({ type: "uploadError", id: msg.id, error: msg || reason, fatal: fatal });

                      if(fatal)
                        reader.abort();
                    }
                  )
                  .catch((error) => {
                    postMessage({ type: "uploadError", error: error, fatal: true });
                  })
                    
                  
                },
                err =>
                {
                  postMessage({ type: "uploadError", error: err, fatal: true });
                  reader.abort();
                }
              );
              
              postMessage({ type: "openingFile", id: msg.id });
              reader.readAsArrayBuffer(file);
              //reader.readAsText(file);
            }
          }
          else
          {
            postMessage({ type: "log", "msg": "Message didnt have any files!" });
          }
        } catch (err) {
          debugger;
          postMessage({ type: "log", "msg": "Encountered an error", error: err });
        }
        postMessage({ type: "log", "msg": "Process Upload Bottom" });
      } break;
      

      default: {
        //Do nothing
      }
    }
  }
  catch(EXCEPT)
  {
    debugger;
    //close();
  }
};

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