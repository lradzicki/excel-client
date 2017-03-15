import * as _ from 'lodash';
import { ModelItemList, EntitySet, Row, EdmTypes, ComplexType, EntityType, Collection } from '../odata/Model';

export function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
    let newObj: any = {};
    for (let k of keys) {
        newObj[k] = obj[k];
    }
    return newObj;
}

export function mkenum<X extends string, K extends string>(...x: X[])
    : {[K in X]: K} {
    let o: any = {}
    for (let k in x)
        o[k] = k;
    return o
}

export type enumType<T> = T[keyof T];


export class Enum<T> {
    generate<X extends { [i: string]: T }, K extends string>(x: X)
        : {[K in (keyof X)]: T} {
        let o: any = {}
        for (let k in x)
            o[k] = x[k];
        return o
    }
}


/// very suspicious at least around compact usage - row with all falses will be removed
export function removeEmptyRowsFromMultiArray(array: Row[]): Row[] {
    return _.compact(_.map(array, row => _.isEmpty(_.compact(row)) ? null : row));
}

export function analyzeMatrixHeadersForColors(headers: string[]): { indices: number[], complexTypes: number[] } {
    let colors = {
        indices: [],
        complexTypes: []
    }

    _.each(headers, (header, index) => {
        if (_.endsWith(header, '#index'))
            colors.indices.push(index);
        else if (_.includes(header, '.'))
            colors.complexTypes.push(index);
    });

    return colors;
}
export function isEmptyMatrixCell(cell: any) {
    return (cell == null || cell == undefined || (typeof cell == 'string' && _.isEmpty(cell)));
}

export function joinPathElements(...pathElements: (string | number)[]): string {
    return _.trimStart(_.join(_.map(pathElements, element => _.isNumber(element) ? `[${element}]` : `.${element}`), ''), '.');
}

export function isPrimitiveOrCollectionOfPrimitives(type: ComplexType
    | EntityType
    | EdmTypes
    | Collection): boolean {

    return this.type instanceof EntityType
        ? false
        : this.type instanceof ComplexType
            ? false
            : this.type instanceof Collection
                ? this.type.elementType instanceof ComplexType
                    ? false
                    : true
                : true;
}

export function entitySetsByBussinessAndKind(entitySets: ModelItemList<EntitySet>): any {
    function entitySetsToVals(entitySets: EntitySet[]) {
        return _.map(entitySets, (entitySet: EntitySet) => ({ value: entitySet.name, label: entitySet.name }))
    }
    return _.chain(entitySets)
        .values()
        .groupBy('businessLines')
        .flatMap((entitySetsByBL, bl) => (
            _.isEmpty(bl)
                ? entitySetsToVals(entitySetsByBL)
                : {
                    value: bl,
                    label: bl,
                    children: _.chain(entitySetsByBL)
                        .groupBy('kinds')
                        .flatMap((entitySetsByKind, kind) => (
                            _.isEmpty(kind)
                                ? entitySetsToVals(entitySetsByKind)
                                : {
                                    value: kind,
                                    label: kind,
                                    children: entitySetsToVals(entitySetsByKind)
                                }))
                        .value()
                }))
        .value();
}