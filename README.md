# geometry-web-worker
## Web worker based geometry utils

---
This package adds some geometry processing utilities to a web worker to keep it off the main thread for webpages

It includes processing shapefiles from shpjs, unkinking and flattening shapes from turfjs, converting wkt and esri to ol

---

### Sample Usage


```javascript
import { promptAndProcessShapefile } from 'geometry-web-worker'

promptAndProcessShapefile().then(features => 
    { 
        //Features is an array of features
    })
    .catch((err) => 
    { 
        
    });
```