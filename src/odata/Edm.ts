import * as _ from 'lodash';
import { Collection, EdmTypes, ModelResolver, EntityType, EntitySet, ComplexType } from './Model';

export class Edm {
    static isPrimitiveType(typeName: string): boolean {
        return _.startsWith(typeName, 'Edm.');
    }
    static stripEdmPrefix(typeName: string): string {
        if (this.isPrimitiveType(typeName)) {
            typeName = typeName.replace('Edm.', '');
        }
        return typeName;
    }
    static isCollection(typeName: string): boolean {
        return _.startsWith(typeName, 'Collection(');
    }
    static isCollectionOfEdmType(typeName: string): boolean {
        return Edm.isCollection(typeName)
            && Edm.isPrimitiveType(Edm.extractCollectionElementType(typeName))
    }
    static extractCollectionElementType(typeName: string): string {
        if (_.startsWith(typeName, 'Collection')) {
            typeName = _.trimEnd(_.replace(typeName, 'Collection(', ''), ')')
        }
        return typeName;
    }
    static resolveType(type: any, modelResolver: ModelResolver): EdmTypes | EntityType | ComplexType | Collection {
        let resolvedType = Edm.isPrimitiveType(type)
            ? EdmTypes[Edm.stripEdmPrefix(type)]
            : Edm.isCollection(type)
                ? Edm.isPrimitiveType(Edm.extractCollectionElementType(type))
                    ? new Collection(EdmTypes[Edm.stripEdmPrefix(Edm.extractCollectionElementType(type))])
                    : new Collection(
                        modelResolver.resolveEntityType(Edm.extractCollectionElementType(type))
                        || modelResolver.resolveComplexType(Edm.extractCollectionElementType(type))
                    )
                : modelResolver.resolveEntityType(type) || modelResolver.resolveComplexType(type);

        if(resolvedType==undefined || resolvedType==null) throw new Error(`Unable to resolve type ${type}`);
        return resolvedType;
    }
    static isNullable(type: any): boolean {
        return !type.nullable || type.nullable == 'true'
    }
}