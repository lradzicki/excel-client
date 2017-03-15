//TODO
//- prevent actions with multiple Excel bindable parametrs - for now this complex scenario is not supported 
import { Enum, enumType } from '../utils/utils';
import * as _ from 'lodash';
import { Edm } from './Edm';
import { isPrimitiveType, isArray, processPathsToCollectionsElements } from '../utils/matrixOperations';
import { isEmptyMatrixCell } from '../utils/utils';
import moment = require('moment');

export type PrimitiveTypes = string | number | boolean;
export type PrimitiveTypesWithObjects = string | number | boolean | {};
export type PrimitiveTypesWithObjectsAndCollections = PrimitiveTypesWithObjects | PrimitiveTypesWithObjects[];
export type PropertyWithPath = { path: string; property: Property | NavigationProperty };

export class PrimitiveValueFilter {
    constructor(public filterBy?: FilterBy,
        public value?: string | number,
    ) { }
}

export interface QueryParameters {
    filter: Filter;
    top: number;
    select: string[];
}

export class Filter {
    public theValue: PrimitiveValueFilter | Filter[];
    public property: Property | NavigationProperty;

    public asEntityFilter(
        property: Property | NavigationProperty,
        theValue: Filter[] = []): Filter {
        this.property = property;
        this.theValue = theValue;
        return this;
    }
    public asPrimitiveValueFilter(
        property: Property | NavigationProperty,
        theValue: PrimitiveValueFilter = new PrimitiveValueFilter(FilterBy.eq, null)): Filter {
        this.property = property;
        this.theValue = theValue;
        return this;
    }

    public toUri(propertyPrefix: string = ''): string {
        let propertyPath = propertyPrefix ? `${propertyPrefix}/${this.property.name}` : this.property.name;

        return this.theValue instanceof PrimitiveValueFilter
            ? this.theValue.filterBy.toUri(
                propertyPath,
                this.property.type,
                this.theValue.filterBy,
                this.theValue.value)

            : `${_.join(
                _.map(
                    this.theValue as Filter[], nestedFilter =>
                        nestedFilter.toUri(propertyPath)
                ), ' and ')}`

    }
}

export class ComparisonOperator {
    constructor(public name: string) { }
    public toUri(
        propertyPath: string,
        propertyType: ComplexType
            | EdmTypes
            | Collection,
        filterBy: FilterBy,
        value: string | number): string {

        return `${propertyPath} ${this.extractOperator(filterBy)} ${this.parseValue(propertyType, value)}`;
    }
    protected parseValue(
        propertyType: ComplexType
            | EdmTypes
            | Collection,
        value: string | number): string | number {

        let parsedValue = propertyType.parseValue(value) as string | number;
        return typeof parsedValue == 'string'
            ? `'${parsedValue}'`
            : parsedValue;
    }
    protected extractOperator(filterBy: FilterBy): string {
        return _.find(_.keys(FilterBy), key => FilterBy[key] == filterBy);
    }
}

export class StringFunction extends ComparisonOperator {
    public toUri(
        propertyPath: string,
        propertyType: ComplexType
            | EdmTypes
            | Collection,
        filterBy: FilterBy,
        value: string | number): string {
        return `${this.extractOperator(filterBy)} (${propertyPath}, ${this.parseValue(propertyType, value)})`;
    }
}

export const FilterBy = new Enum<ComparisonOperator | StringFunction>()
    .generate({
        'eq': new ComparisonOperator('Equals'),
        'ne': new ComparisonOperator('Not Equals'),
        'gt': new ComparisonOperator('Greater Than'),
        'ge': new ComparisonOperator('Greater Than or Equal'),
        'lt': new ComparisonOperator('Less Than'),
        'le': new ComparisonOperator('Less Than or Equal'),
        'startswith': new StringFunction('Starts With'),
        'endswith': new StringFunction('Ends With'),
        'contains': new StringFunction('Contains')
    }); export type FilterBy = enumType<typeof FilterBy>;

export class CoordinatesTransformer {
    coordinates: { [pathToPrimitiveValue: string]: [number, number] } = {};

    setValCoordinates(itemId: PrimitiveTypes, pathToValue: string, row: number, col: number): void {
        this.coordinates[itemId + '.' + pathToValue] = [row, col];
    }
    getValCoordinates(itemId: PrimitiveTypes, pathToValue: string): [number, number] {
        return this.coordinates[itemId + '.' + pathToValue];
    }
}

export class Row extends Array<PrimitiveTypes> {
    public excelIndex: number = -1;
    constructor(...values: PrimitiveTypes[]) {
        super(...values);

        (<any>Object).setPrototypeOf(this, Row.prototype);

        if (values && values.length == 1) {
            this[0] = values[0];
        }
    }
    setExcelIndex(index: number): Row {
        this.excelIndex = index;
        return this;
    }
}

interface MatrixSplitter {
    split(data: Row[]): Row[][];
}

class ByArrayIndexSplitter implements MatrixSplitter {
    split(data: Row[]): Row[][] {
        let headers: string[];
        let dataRows: any[];
        return (_.isEmpty(data)
            || _.isEmpty((headers = _.head(data) as string[]))
            || _.isEmpty((dataRows = _.tail(data)))
        )
            ? null
            : _.map(dataRows, row => [headers, row]);
    }
}

class ByIndexColumnSplitter implements MatrixSplitter {
    constructor(public indexColumn: string) {
    }
    split(data: Row[]): Row[][] {
        let paths = _.head(data);
        let indexColumnInData = _.head(paths);
        if (indexColumnInData != this.indexColumn)
            throw new Error(`Indexing column ${this.indexColumn} is missing in the first position in the matrix data`);
        let dataRows = _.tail(data);
        let uniqueIds = _.uniq(_.map(dataRows, _.head));
        let groupedRows = _.groupBy(dataRows, row => _.head(row));

        return _.map(uniqueIds, id =>
            [...[_.clone(paths)], ..._.get(groupedRows, id) as Row[]]
        );
    }
}

export abstract class EdmPrimitiveType implements ValueParser {
    constructor(public name: string) {
    }
    readonly splitter: MatrixSplitter = new ByArrayIndexSplitter();
    abstract parseValue(value: PrimitiveTypesWithObjectsAndCollections): PrimitiveTypesWithObjectsAndCollections;

    toMatrix(data: PrimitiveTypesWithObjectsAndCollections, columns?: string[]): Row[] {
        return [new Row(...columns), new Row(...data as PrimitiveTypes[])];
    }

    fromMatrix(column: string, rawData: Row[], coordinates?: CoordinatesTransformer): PrimitiveTypesWithObjectsAndCollections {
        let headers: string[];
        let dataRows: any[][];
        if (!_.isEmpty(rawData)
            && !_.isEmpty((headers = _.head(rawData) as string[]))
            && !_.isEmpty((dataRows = _.tail(rawData)))
        ) {
            let matchingHeaderIndex = _.indexOf(headers, column);
            if (dataRows.length > 1) throw new Error(`Too many values for singular property of type ${this}`)
            if (matchingHeaderIndex >= 0)
                return this.parseValue(dataRows[0][matchingHeaderIndex]);

            else return null;
        }
    }
}

export class EdmString extends EdmPrimitiveType {
    constructor() { super('Edm.String') }
    parseValue(value: PrimitiveTypes): PrimitiveTypes {
        return typeof value == 'string' || value == null || value == undefined
            ? value
            : value.toString();
    }
}

export class EdmDouble extends EdmPrimitiveType {
    constructor() { super('Edm.Double') }
    parseValue(value: PrimitiveTypes): PrimitiveTypes {
        return typeof value == 'number' || value == null || value == undefined
            ? value
            : parseFloat(value.toString());
    }
}

export class EdmInt32 extends EdmPrimitiveType {
    constructor() { super('Edm.Int32') }
    parseValue(value: PrimitiveTypes): PrimitiveTypes {
        return value == null || value == undefined
            ? value
            : typeof value == 'number'
                ? _.floor(value)
                : parseInt(value.toString());
    }
}

export class EdmBoolean extends EdmPrimitiveType {
    constructor() { super('Edm.Boolean') }
    parseValue(value: PrimitiveTypes): PrimitiveTypes {
        return typeof value == 'boolean' || value == null || value == undefined
            ? value
            : value.toString() == 'true';
    }
}

export class EdmDateTimeOffset extends EdmPrimitiveType {
    constructor() { super('Edm.DateTimeOffset') }
    parseValue(value: PrimitiveTypes): PrimitiveTypes {
        return _.isEmpty(value) ? null : value.toString();
    }
}

export class EdmDate extends EdmPrimitiveType {
    // TODO - probably not the best place to do this
    readonly excelMinDatePlusOneDay = new Date('1900-01-01');

    constructor() { super('Edm.Date') }
    parseValue(value: PrimitiveTypes): PrimitiveTypes {
        if (typeof value == 'number')
            // - 2 means we substract two days because:
            // - Excel actually starts with date 1900-1-0 where '0' day is not really a date
            // - Excel repeats Lotus 123 bug where 1900 was a leap year - it wasn't
            return moment(this.excelMinDatePlusOneDay).add(value - 2, 'days').format('YYYY-MM-DD');

        else if (typeof value == 'string' && !_.isEmpty(value))
            return moment(value).format('YYYY-MM-DD')

        return null;
    }
}


export const EdmTypes = new Enum<EdmPrimitiveType>()
    .generate({
        'String': new EdmString,
        'Double': new EdmDouble,
        'Int32': new EdmInt32,
        'Boolean': new EdmBoolean,
        'DateTimeOffset': new EdmDateTimeOffset,
        'Date': new EdmDate
    });

export type EdmTypes = enumType<typeof EdmTypes>;
export type EdmKind = EdmTypes | 'ComplexType' | 'EntityType' | 'Collection(PrimitiveType)' | 'Collection(ComplexType)';

export interface ValueParser {
    name: string;
    parseValue(value: PrimitiveTypesWithObjectsAndCollections): PrimitiveTypesWithObjectsAndCollections;
    fromMatrix(fromHeader: string, matrix: Row[], coordinates?: CoordinatesTransformer): PrimitiveTypesWithObjectsAndCollections;
    toMatrix(data: PrimitiveTypesWithObjectsAndCollections, selectedHeaders?: string[]): Row[];
}

type HttpVerbs = 'GET' | 'POST';

export interface ModelResolver {
    namespace: string;
    resolveEntitySet: (string) => EntitySet;
    resolveEntityType: (string) => EntityType;
    resolveComplexType: (string) => ComplexType;
}

export class ModelItemList<TModelItem> {
    [x: string]: TModelItem;
}

export class EdmTyped {
    constructor(public type:
        ComplexType
        | EntityType
        | EdmTypes
        | Collection) {

    }
    typeKind(): EdmKind {
        return this.type instanceof EntityType
            ? 'EntityType'
            : this.type instanceof ComplexType
                ? 'ComplexType'
                : this.type instanceof Collection
                    ? this.type.elementType instanceof ComplexType
                        ? 'Collection(ComplexType)'
                        : 'Collection(PrimitiveType)'
                    : this.type;
    }
}

export class Parameter extends EdmTyped {
    constructor(
        public name: string,
        public type:
            ComplexType
            | EntityType
            | EdmTypes
            | Collection,
        public nullable: boolean = true,
        public value: PrimitiveTypesWithObjectsAndCollections = undefined) {
        super(type);
    }
    static fromOdataJs(odataProperty: any, modelResolver: ModelResolver
    ): Parameter {
        return new Parameter(
            odataProperty.name,
            Edm.resolveType(odataProperty.type, modelResolver),
            Edm.isNullable(odataProperty));
    }
    bindFromRawData(rawData: Row[]) {
        this.value = this.type.fromMatrix(this.name, rawData);
    }
}

export class Extension {
    constructor(
        public Name: string,
        public Url: string,
        public HttpMethod: HttpVerbs,
        public Bound: EntitySet | EntityType | ComplexType | EdmPrimitiveType | Collection | void,
        public Parameters: Parameter[],
        public Returns:
            ComplexType
            | EntityType
            | EdmTypes
            | Collection
    ) { }
    static fromOdataJs(odataExtension: any, httpMethod: HttpVerbs, modelResolver: ModelResolver): Extension {

        let bound: EntitySet | EntityType | ComplexType | EdmPrimitiveType | Collection | void = undefined;
        if (odataExtension.isBound) {
            let boundType = Edm.resolveType(odataExtension.parameter[0].type, modelResolver);
            bound =
                boundType instanceof Collection && boundType.elementType instanceof EntityType
                    ? boundType.elementType.entitySet
                    : boundType;
        }
        let returnType = null;
        if (odataExtension.returnType) {
            returnType = Edm.resolveType(odataExtension.returnType.type, modelResolver);
        }
        let extension = new Extension(
            odataExtension.name,
            `${bound ? bound['name'] : ''}/${modelResolver.namespace}.${odataExtension.name}()`,
            httpMethod,
            bound,
            _.map(_.tail(odataExtension.parameter), p => Parameter.fromOdataJs(p, modelResolver)),
            returnType
        );
        if (bound) {
            (bound['extensions'] as Extension[]).push(extension); //introduce interface maybe? ExtensibleType?
        }
        return extension;
    }
}


export class Collection implements ValueParser {
    constructor(
        public elementType: EdmTypes | ComplexType,
        public name = `Collection(${elementType.name})`) {
    }
    parseValue(value: PrimitiveTypesWithObjectsAndCollections): PrimitiveTypesWithObjectsAndCollections {
        return _.map((value as PrimitiveTypesWithObjects[]), val => this.elementType.parseValue(val))
    }
    toMatrix(data: PrimitiveTypesWithObjectsAndCollections, columns?: string[]): Row[] {
        if (!_.isArray(data)) throw new Error('Collection parser can parse only arrays');
        let rows = [];
        let paths;
        console.time('tomatrix-loop');
        let matrix = _.flatMap(data, (item, index) => {
            let matrix = this.elementType.toMatrix(item, columns);
            paths = _.head(matrix);
            return _.tail(matrix);
        });
        let finalMatrix: Row[] = [paths, ...matrix];
        let allRowsHaveTheSameLength = _.union(_.map(finalMatrix, (row: Row) => row.length)).length == 1;
        if (!allRowsHaveTheSameLength)
            throw new Error('Collection.toMatrix: Some rows of the matrix have different length than others!');            
        return finalMatrix;
    }
    fromMatrix(column: string, matrix: Row[], coordinates?: CoordinatesTransformer): PrimitiveTypesWithObjects[] {
        return _.map(this.elementType.splitter.split(matrix),
            chunk => this.elementType.fromMatrix(column, chunk, coordinates));
    }

    //this maybe should be somewhere else?
    parseManyValuesForKeys(rawData: Row[]): any[] {
        if (this.elementType instanceof EntityType) {
            let column = this.elementType.name;
            let objects: PrimitiveTypesWithObjects[] = this.fromMatrix(column, rawData);
            let key: Property = this.elementType.key;
            return _.filter(_.map(objects, obj => _.get(obj, key.name)), p => p /*not undefined*/);
        }
    }
}

export class Property extends EdmTyped {
    constructor(
        public name: string,
        public type: ComplexType
            | EdmTypes
            | Collection,
        public nullable: boolean = true,
    ) {
        super(type);
    }
    static fromOdataJs(odataProperty: any, modelResolver: ModelResolver): Property {
        return new Property(
            odataProperty.name,
            Edm.resolveType(odataProperty.type, modelResolver),
            Edm.isNullable(odataProperty));
    }
}

export class NavigationProperty extends EdmTyped {
    constructor(
        public name: string,
        public getType: () => EntityType = null,
        public getTarget: () => EntitySet = null,
        public type: EntityType | Collection = null,
        public target: EntitySet = null) { super(type); }

    initNavigation() {
        if (this.getType)
            this.type = this.getType();
        if (this.getTarget)
            this.target = this.getTarget();
        return this;
    }
    static fromOdataJs(
        odataProperty: any,
        modelResolver: ModelResolver
    ) {
        return new NavigationProperty(
            odataProperty.name,
            () => Edm.resolveType(odataProperty.type, modelResolver) as EntityType
        )
    }

}


export class ComplexType implements ValueParser {
    constructor(
        public name: string,
        public properties: ModelItemList<Property>,
        public navigationProperties: ModelItemList<NavigationProperty>,
    ) {
    }
    readonly splitter: MatrixSplitter = new ByIndexColumnSplitter('#index');

    allProperties(): (Property | NavigationProperty)[] {
        return [..._.values(this.properties), ..._.values(this.navigationProperties)];
    }
    static fromOdataJs(
        namespace: string,
        odataComplexType: any, modelResolver: ModelResolver
    ): ComplexType {
        if (!odataComplexType)
            throw new Error('Empty complex type odatajs definition passed');
        return new ComplexType(
            `${namespace}.${odataComplexType.name}`,
            odataComplexType.property
                ? _.keyBy<Property>(
                    odataComplexType.property
                        .map(p => Property.fromOdataJs(p, modelResolver))
                    , 'name')
                : null,
            odataComplexType.navigationProperty
                ? _.keyBy<NavigationProperty>(
                    odataComplexType.navigationProperty
                        .map(p => NavigationProperty.fromOdataJs(p, modelResolver))
                    , 'name')
                : null

        )
    }

    findNavPropertyByPath(path: string): NavigationProperty {
        let pathToSegments = function (pathToSplit: string): string[] {
            return _.split(pathToSplit, '/');
        }
        let segmentsToPath = function (segments: string[]): string {
            return _.join(segments, '/');
        }

        if (_.isEmpty(path))
            throw new Error('EntityType.findNavPropertyByPath: Empty path passed');

        let pathSegments = pathToSegments(path);

        let thisEntityTypePropertyName = _.head(pathSegments);

        let nestedTypesPropertyNames = _.tail(pathSegments);

        if (_.isEmpty(nestedTypesPropertyNames))
            return this.navigationProperties[thisEntityTypePropertyName];
        else {
            let nestedComplexProperty = this.properties[thisEntityTypePropertyName];

            if (!(nestedComplexProperty.type instanceof ComplexType))
                throw Error('EntityType.findNavPropertyByPath: Invalid complex path leading to non complex type property');

            return (nestedComplexProperty.type as ComplexType).findNavPropertyByPath(segmentsToPath(nestedTypesPropertyNames));
        }

    }


    propertiesFoundInData(data: PrimitiveTypesWithObjectsAndCollections): (Property | NavigationProperty)[] {
        let propsInData = _.keys(data);

        return _.intersectionWith(
            this.allProperties(),
            propsInData,
            (prop: Property, propInData: string) => prop.name == propInData);

    }

    /// TODO - a few recursive methods below - they all seem to be using different approach to recursion - consider refactoring [MB]



    // It breaks circular dependency of complex types
    // if multi level deep expand is used not all demanded columns might be returned by this method 
    propertiesWithPaths(visitedComplexTypesOnPath: string[] = [], pathPrefix: string = ''): PropertyWithPath[] {
        if (_.includes(visitedComplexTypesOnPath, this.name))
            return null;
        else
            visitedComplexTypesOnPath = [this.name, ...visitedComplexTypesOnPath];

        return _.filter(_.flatMapDeep<PropertyWithPath>(
            this.allProperties(),
            (prop: Property | NavigationProperty) => {
                let newPathPrefix = `${pathPrefix}${prop.name}.`;

                return prop.type instanceof ComplexType
                    ? [(prop.type as ComplexType).propertiesWithPaths(visitedComplexTypesOnPath, newPathPrefix)]
                    : prop.type instanceof Collection && prop.type.elementType instanceof ComplexType
                        ? [(prop.type.elementType as ComplexType)
                            .propertiesWithPaths(visitedComplexTypesOnPath, newPathPrefix)]
                        : { path: (pathPrefix + prop.name), property: prop }
            }), path => path != null);
    }

    // It breaks circular dependency of complex types
    // if multi level deep expand is used not all demanded columns might be returned by this method 
    propertiesWithPathsAndIndices(
        outProps: string[],
        selectedProps?: string[],
        visitedComplexTypesOnPath: string[] = [],
        pathPrefix: string = '') {

        if (_.includes(visitedComplexTypesOnPath, this.name))
            return;
        else
            visitedComplexTypesOnPath = [this.name, ...visitedComplexTypesOnPath];

        //selectedProps works only for top level - one level down an empty list is passed
        let propsSelectedOrAll: (Property | NavigationProperty)[] =
            _.isEmpty(selectedProps)
                ? this.allProperties()
                : _.intersectionWith(
                    this.allProperties(),
                    selectedProps,
                    (prop: Property, selectedProp: string) => prop.name == selectedProp);

        _.each(
            propsSelectedOrAll,
            (prop: Property | NavigationProperty) => {
                let typeToRecurse = prop.type;
                if (prop.type instanceof Collection) {
                    outProps.push(`${pathPrefix}${prop.name}#index`);
                    if (prop.type.elementType instanceof ComplexType)
                        typeToRecurse = prop.type.elementType
                }
                if (typeToRecurse instanceof ComplexType) {
                    typeToRecurse.propertiesWithPathsAndIndices(
                        outProps,
                        [], //no seleceted props on levels below first
                        visitedComplexTypesOnPath,
                        `${pathPrefix}${prop.name}.`);
                }
                else
                    outProps.push(`${pathPrefix}${prop.name}`);
            });
    }

    //wraps data that is enty in a colletion in object {__index:index, __item:item} where index is an index of item in data array
    wrapCollectionItemsWithIndices(data: PrimitiveTypesWithObjectsAndCollections) {
        _.each(
            this.propertiesFoundInData(data),
            (prop: Property | NavigationProperty) => {
                if (prop.type instanceof ComplexType)
                    [(prop.type as ComplexType).wrapCollectionItemsWithIndices(data[prop.name])];

                if (prop.type instanceof Collection) {
                    if (prop.type.elementType instanceof ComplexType) {
                        _.each(data[prop.name], item => [((prop.type as Collection).elementType as ComplexType)
                            .wrapCollectionItemsWithIndices(item)]);
                    }
                    data[prop.name] = _.map(data[prop.name], (item, index) => {
                        return { __index: index, __item: item }
                    })
                }
            });
    }

    parseValue(rawObject: PrimitiveTypesWithObjectsAndCollections): PrimitiveTypesWithObjectsAndCollections {
        if (!rawObject) return null;

        rawObject = _.pick(rawObject, _.map(this.allProperties(), 'name')); //get rid of non standard props;

        if (_.isEmpty(_.keys(rawObject))) return null; //none of the rawObject properties matched the type

        return _.mapValues(rawObject, (value, key, object) => (this.properties[key] || this.navigationProperties[key]).type.parseValue(value));
    }


    removeInvalidColumns(matrix: Row[]) {
        let paths = _.head(matrix) as string[];
        let dataRows = _.tail(matrix);

        let validProperties: string[] = _.map(this.propertiesWithPaths(), p => p.path);
        let invalidColumns =
            _.filter(
                _.map(paths, (path, index) =>
                    _.includes(validProperties, path) || _.endsWith(path, '#index') ? -1 : index),
                col => col >= 0);

        _.pullAt(paths, invalidColumns);
        _.each(dataRows, row => _.pullAt(row, invalidColumns));
    }

    fromMatrix(column: string, matrix: Row[], coordinates?: CoordinatesTransformer): PrimitiveTypesWithObjects {
        let columns = _.head(matrix) as string[];
        let dataRows = _.tail(matrix);

        let columnsWithIndices = processPathsToCollectionsElements(columns);
        let output = {};
        _.each(dataRows, row => {
            _.each(columnsWithIndices, (columnToBecomPath, colIndex) => {
                if (_.endsWith(columnToBecomPath, '#index')) {
                    if (coordinates)
                        coordinates.setValCoordinates(_.head(row), `${columnToBecomPath}[${row[colIndex]}]`, row.excelIndex, colIndex);
                    return;
                }

                let matchingIndexes = columnToBecomPath.match(/\[\d+\]/g);
                _.each(matchingIndexes, matchingIndex => {
                    columnToBecomPath = _.replace(columnToBecomPath, matchingIndex, `[${row[parseInt(_.trim(matchingIndex, '[]'))]}]`);
                });
                if (!isEmptyMatrixCell(row[colIndex])) {
                    let isValueAlreadyThere = _.get(output, columnToBecomPath); //this should properties be doing!
                    if (isValueAlreadyThere == undefined) {
                        _.set(output, columnToBecomPath, row[colIndex]); //this should properties be doing!

                        if (coordinates)
                            coordinates.setValCoordinates(_.head(row), columnToBecomPath, row.excelIndex, colIndex);
                    }
                }
            })
        });
        return !_.isEmpty(output) ? this.parseValue(output) : null;
    }
    toMatrix(object: PrimitiveTypesWithObjectsAndCollections, columns?: string[]): Row[] {

        if (_.isArray(object)) throw new Error('Complex type will not convert array to matrix');
        if (isPrimitiveType(object))
            throw new Error('Complex type will not convert primitive types');

        this.wrapCollectionItemsWithIndices(object);
        let rowsAsObjects = [];
        let headersWithIndices: string[] = [];
        this.propertiesWithPathsAndIndices(headersWithIndices, columns);

        let indexColumn = (this.splitter as ByIndexColumnSplitter).indexColumn;
        let index = _.get(object, indexColumn);

        while (!_.isEmpty(object)) {
            let rowAsObject = {};

            //pre initialize properties - refactor this stuff? - order matters!! 
            //otherwise index column might be last or null!!
            rowAsObject[indexColumn] = index;
            _.each(headersWithIndices, prop => {
                if (prop != indexColumn)
                    rowAsObject[prop] = null;
            });

            this.fillOneRow(object, rowAsObject);

            rowsAsObjects.push(rowAsObject);
        };


        let headers = new Row(..._.keys(rowsAsObjects[0]));
        let matrixOfRows = _.map(rowsAsObjects, rowAsObject => {
            let primitiveValues: PrimitiveTypes[] = _.map(headers, (header: string) =>
                rowAsObject[header] == undefined
                    ? null
                    : rowAsObject[header]
            );
            return new Row(...primitiveValues);
        });
        let finalMatrix = [headers, ...matrixOfRows];
        // is this still required after header filtering above?
        this.removeInvalidColumns(finalMatrix);
        return finalMatrix;
    }
    fillOneRow(obj: any, row: {}, pathPrefix: string = '') {
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
                    this.fillOneRow(head['__item'], row, newPathPrefix);
                    if (_.isEmpty(head['__item']))
                        _.pullAt(array, 0);
                }
                if (_.isEmpty(array)) {
                    _.unset(obj, key);
                }
            } else {
                this.fillOneRow(elem, row, newPathPrefix);
                if (_.isEmpty(elem))
                    _.unset(obj, key);
            }
        };
    }

}

export class EntityType extends ComplexType {
    constructor(
        public key: Property,
        public name: string,
        public properties: ModelItemList<Property>,
        public navigationProperties: ModelItemList<NavigationProperty>,
        public entitySet: EntitySet = null,
        public extensions: Extension[] = []
    ) {
        super(name, properties, navigationProperties);
        this.splitter = new ByIndexColumnSplitter(this.key.name);
    }
    readonly splitter: MatrixSplitter;

    static fromOdataJs(
        namespace: string,
        odataEntityType: any, modelResolver: ModelResolver
    ): EntityType {
        let complexType = super.fromOdataJs(
            namespace,
            odataEntityType,
            modelResolver
        );
        if (_.isEmpty(odataEntityType.key))
            throw new Error('Odata metadata is invalid. Entity Type should have a proper key definition');
        let keyPropertyName = odataEntityType.key[0].propertyRef[0].name;
        return new EntityType(
            complexType.properties[keyPropertyName],
            complexType.name,
            complexType.properties,
            complexType.navigationProperties);
    }
}

export class EntitySet {

    constructor(
        public name: string,
        public entityType: EntityType,
        public extensions: Extension[] = [],
        public kinds: string[] = [],
        public businessLines: string[] = []) {
    }
    static fromOdataJs(odataEntitySet: any, modelResolver: ModelResolver): EntitySet {
        let entitySet = new EntitySet(
            odataEntitySet.name,
            modelResolver.resolveEntityType(odataEntitySet.entityType)
        );
        entitySet.entityType.entitySet = entitySet;

        if (odataEntitySet.navigationPropertyBinding) {
            odataEntitySet.navigationPropertyBinding
                .forEach(npb => {
                    let navProp = entitySet.entityType.findNavPropertyByPath(npb.path);
                    if (!navProp)
                        throw new Error();
                    navProp.getTarget = () => modelResolver.resolveEntitySet(npb.target);
                });
        }



        entitySet.kinds =
            _.map(
                _.filter(
                    odataEntitySet.annotation,
                    (annotation: { term: string, string: string }) => _.endsWith(annotation.term, 'Kind')
                ), (annotation: { string: string }) => annotation.string);

        entitySet.businessLines =
            _.map(
                _.filter(
                    odataEntitySet.annotation,
                    (annotation: { term: string, string: string }) => _.endsWith(annotation.term, 'BusinessLine')
                ), (annotation: { string: string }) => annotation.string);

        return entitySet;
    }
}

export class ServiceMetadata implements ModelResolver {
    odatajsMetadata: any;
    schema: any;
    unboundActions: Extension[];
    unboundFunctions: Extension[];
    namespace: string;
    namespaceAlias: string;
    EntitySets: ModelItemList<EntitySet> = {};
    EntityTypes: ModelItemList<EntityType> = {};
    ComplexTypes: ModelItemList<ComplexType> = {};

    resolveEntitySet(name: string): EntitySet {
        let odataEntitySet = _.find(this.schema.entityContainer.entitySet, { name: name });
        if (!odataEntitySet) return null;
        return this.EntitySets[name]
            || (this.EntitySets[name] = EntitySet.fromOdataJs(
                odataEntitySet,
                this,
            ))
    }
    private stripNamespace(name: string): string {
        if (_.startsWith(name, this.namespace))
            return _.replace(name, `${this.namespace}.`, '');
        if (_.startsWith(name, this.namespaceAlias))
            return _.replace(name, `${this.namespaceAlias}.`, '');
    }

    resolveEntityType(name: string): EntityType {
        let nameWithoutNamespace = this.stripNamespace(name);
        let odataEntityType = _.find(this.schema.entityType, { name: nameWithoutNamespace });
        if (!odataEntityType) return null;

        return this.EntityTypes[nameWithoutNamespace]
            || (this.EntityTypes[nameWithoutNamespace] = EntityType.fromOdataJs(
                this.namespace,
                odataEntityType,
                this as ModelResolver
            ))
    }
    resolveComplexType(name: string): ComplexType {
        let nameWithoutNamespace = this.stripNamespace(name);
        let odataComplexTypeOrEnum =
            _.find(this.schema.complexType, { name: nameWithoutNamespace })
            || _.find(this.schema.enumType, { name: nameWithoutNamespace });
        return this.ComplexTypes[nameWithoutNamespace]
            || (this.ComplexTypes[nameWithoutNamespace] = ComplexType.fromOdataJs(
                this.namespace,
                odataComplexTypeOrEnum,
                this as ModelResolver
            ))
    }
    constructor();
    constructor(odatajsMetadata?: any);
    constructor(odatajsMetadata?: any) {
        if (!odatajsMetadata) {
            return;
        }
        this.odatajsMetadata = odatajsMetadata;
        this.schema = odatajsMetadata.dataServices.schema[0];
        this.namespace = this.schema.namespace;
        this.namespaceAlias = this.schema.alias;

        this.schema.entityContainer.entitySet.forEach(es => this.resolveEntitySet(es.name));

        this.unboundActions = _.filter(_.map(this.schema.action, odataAction =>
            Extension.fromOdataJs(
                odataAction,
                'POST',
                this as ModelResolver
            )), a => a.Bound == undefined)

        this.unboundFunctions = _.filter(_.map(this.schema.function, odataFunction =>
            Extension.fromOdataJs(
                odataFunction,
                'GET',
                this as ModelResolver
            )), a => a.Bound == undefined)

        _.each(
            _.flatMap(
                this.EntityTypes,
                et => _.values(et.navigationProperties)),
            (navProp: NavigationProperty) => navProp.initNavigation());
    }
}