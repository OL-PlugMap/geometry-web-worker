import Worker from "./worker.js"


export async function processShapefile(element) {
    console.log("Process Shapefile", element)
    initWorkerHandler();
    return window.workerHandler.startProcessingShapefile(element);
}

export async function flattenShapes(shapes) {
    console.log("Flattening Shapes", shapes)
    initWorkerHandler();
    return window.workerHandler.startFlatteningShapes(shapes);
}

export async function promptAndProcessShapefile() {
    const elment = document.createElement("input");
    elment.type = "file";

    const prom = wrapPromise();

    elment.onchange = evt => {
        console.log("Got an event from input", evt, this)
        processShapefile(elment).then((shape) => {
            console.log("Got data", shape)
            prom.resolve(shape);
        }).catch((error) => {
            prom.reject(error);
        })
    }

    elment.click();

    return prom;
}



function wrapPromise() {
    let res, rej;

    let prom = new Promise((resolve,reject) => {
        res = resolve;
        rej = reject;
    })

    let p = prom;
    prom.resolve = res;
    prom.reject =  rej;

    return p;
}

function initWorkerHandler() {
    if(!window.workerHandler)
    {
        console.log("Init Worker Handler")
        window.workerHandler = new workerHandler();
    }
}

class workerHandler {
    constructor() {
        this.worker = new Worker();

        this.worker.onmessage = this.workerEventHandler.bind(this);

        let encoding = global["encoding-indexes"] || window["encoding-indexes"]

        console.log("Setting encoding", encoding)

        this.worker.postMessage({
            type: "initEncoding",
            encoding: encoding
          });

        this.ready = false;

        this.uploadPromise = null;
        this.flattenedPromise = null;

        this.debug = true;
        console.log("Initialized")
    }


    workerEventHandler(e) {
        if (this.debug) console.log("We got a worker message: \"" + e.data.type + "\"");

        switch (e.data.type) {
            case "encodingReady": {
                console.log("Encoding was loaded and now we are ready");
                this.ready = true;
            }; break;

            case "uploadProcessed": {
                console.log(this.uploadPromise);
                console.log(e.data.features);
                this.uploadPromise.resolve({ features: e.data.features, fileInfo: e.data.fileInfo });
            }; break;

            case "uploadError": {
                console.error("Upload errored", e.data.error);
                this.uploadPromise.reject({ messages: e.data.error, type: e.data.errorType });
            }

            case "flattened": {
                console.log("Flattened")
                this.flattenedPromise.resolve(e.data.geoJSON);
            }

            case "log": {
                console.log("WORKER:", e.data.msg)
            }; break;

            case "error": {
                console.error("WORKER:", e.data.error)
            }

            default: {
                if(this.debug)
                {
                    console.warn("Received a worker message we did not understand and will be ignored", e)
                }
            }
        }
    }

    //This tells the web worker to start processing the files attached to an input field
    //The parameter element should be an input element of type file
    async startProcessingShapefile(element) {
        console.log("Processing things", element)
        this.uploadPromise = wrapPromise();

        this.worker.postMessage({
            type: "processUpload",
            files: element.files
          });

        return this.uploadPromise;
    }

    //This tells the web worker to start flattening the passed in shapes
    //The parameter element should be an array of shapes in geojson
    async startFlatteningShapes(shapes) {
        console.log("Processing things", shapes)
        this.flattenedPromise = wrapPromise();

        this.worker.postMessage({
            type: "flatten",
            shapes: shapes
          });

        return this.flattenedPromise;
    }
}