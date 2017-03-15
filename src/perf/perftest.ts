import * as odatajs from 'jaydata-odatajs';
import * as _ from 'lodash';
import fs = require('fs');
//import { CoordinatesTransformer, Row, EdmString, EdmTypes, EntityType, Property, ComplexType, Collection } from '../odata/Model';
import { processPathsToCollectionsElements, objectToArray } from '../utils/matrixOperations';
import {
    Collection,
    ModelItemList,
    Extension,
    ServiceMetadata,
    EntityType,
    ComplexType,
    Property,
    NavigationProperty,
    EntitySet,
    Parameter,
    EdmPrimitiveType,
    EdmString,
    EdmDouble,
    EdmBoolean,
    EdmDateTimeOffset,
    EdmTypes,
    CoordinatesTransformer
} from '../odata/Model';



    console.log('Performance testing started...');


    let serviceMetadata : ServiceMetadata = initMetadata();
        
    //let path: string = "..\\src\\perf\\1000.json";    
    let path: string = "..\\..\\src\\perf\\1.json";
    let json =  fs.readFileSync(path,'utf8');
    let entities = JSON.parse(json);        

    console.time('tomatrix');
    let parser = new Collection(serviceMetadata.EntitySets['Drugs'].entityType);
    let matrix = parser.toMatrix(entities);
    console.timeEnd('tomatrix');
        
    console.time('frommatrix');
    let coordinatesTransformer = new CoordinatesTransformer;
    let objects = parser.fromMatrix('nomatter', matrix,coordinatesTransformer);
    console.timeEnd('frommatrix');

    console.log('done');        




function initMetadata() : ServiceMetadata{
        let mpath: string = "..\\..\\src\\perf\\metadata.xml";
        let xml =  fs.readFileSync(mpath,'utf8');
        let metadata = odatajs.oData.parseMetadata(xml);        
        return new ServiceMetadata(metadata);        
}