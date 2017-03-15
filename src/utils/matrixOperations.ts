import * as _ from 'lodash';

export enum ChangeType {
    changed,
    new,
    deleted
}

export class PrimitiveValChange {
    constructor(public value: any,public changeType: ChangeType ) { }
}


// if the array contains two entries like 'prop#index' and 'prop' 
// then the latter is replaced with 'prop[x]' where x is array index of 'prop#index'
// works for paths like 'prop.otherProp.someOtherProp' too.
export function processPathsToCollectionsElements(paths: string[]): string[] {
    let indexMappings: { propName: string, index: number }[] = [];

    _.each(paths, (path, index) => {
        if (_.endsWith(path, '#index')) {
            let propName = _.replace(path, '#index', '');
            indexMappings.push({ propName: propName, index: index });
        }
    });
    //sort with longest paths so that replacing is easier
    indexMappings = _.reverse(_.sortBy(indexMappings, mapping => _.split(mapping.propName, '.').length));

    let indexedPaths = _.map(paths as string[], (path, index) => {
        if (_.endsWith(path, '#index')) return path;
        let newPath = path;
        _.each(indexMappings, (mapping: { propName: string, index: number }) => {
            if (path == mapping.propName || _.startsWith(path, `${mapping.propName}.`)) {
                newPath = _.replace(newPath, mapping.propName, `${mapping.propName}[${mapping.index}]`)
            }
        });
        return newPath;
    })
    return indexedPaths;
}


//this function takes an object and depending on the number of collections creates at least two rows of data:
// - paths to properties
// - data
// If there are non single value collections in the input then more than row of data is produced otherwise only one
export function objectToArray(item: {}): (string | number | boolean)[][] {
    let rows = [];

    while (!_.isEmpty(item)) {
        let row = {};
        oneRowOfObjectData(item, row);
        rows.push(row);
    };
    let paths = _.keys(rows[0]);
    let matrix = _.map(rows, row => {
        let x = _.map(paths, path =>
            row[path] == undefined
                ? null : row[path]
        );
        return x;
    }
    );
    return [paths, ...matrix];
}


// this function takes an object and recursively traverses its properties and collections 
// and takes first suitable element of every structure and appends to the row - then removes its
// if called many times it will reduce object to nothing producing rows.
export function oneRowOfObjectData(obj: any, row: {}, pathPrefix: string = '') {
    for (let key in obj) {
        let newPathPrefix = `${pathPrefix}${key}.`;
        let elem = obj[key];
        if (isPrimitiveType(elem)) {
            row[(pathPrefix + key)] = elem;
            _.unset(obj, key);
        }
        else if (_.isArray(elem)) {
            let array = elem;
            let head = _.head(array);
            if (head && isPrimitiveType(head['__item'])) {
                row[(pathPrefix + key + '#index')] = head['__index'];
                row[(pathPrefix + key)] = head['__item'];
                _.pullAt(array, 0);
            }
            else if (head) {
                row[(pathPrefix + key + '#index')] = head['__index'];
                oneRowOfObjectData(head['__item'], row, newPathPrefix);
                if (_.isEmpty(head['__item']))
                    _.pullAt(array, 0);
            }
            if (_.isEmpty(array)) {
                _.unset(obj, key);
            }
        } else {
            oneRowOfObjectData(elem, row, newPathPrefix);
            if (_.isEmpty(elem))
                _.unset(obj, key);
        }
    };
}

export function isPrimitiveType(elem: any) {
    return _.isNumber(elem) || _.isString(elem) || _.isBoolean(elem) || elem instanceof PrimitiveValChange;
}

export function isArray(elem: any) {
    return _.isArray(elem) || (elem && _.isArray(elem['__item']));
}
