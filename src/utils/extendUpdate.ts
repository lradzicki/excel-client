let update = require('immutability-helper');
import { Filter,PrimitiveValueFilter, FilterBy, Property } from '../odata/Model';
import * as _ from 'lodash';


update.extend(
    '$addFilter',
    function (path: number[], original: Filter) {
        return _.isEmpty(path)
            ? update(
                original, {
                    theValue: {
                        $push: [new Filter]
                    }
                })
            : update(
                original, {
                    theValue: {
                        [_.head(path)]: {
                            $addFilter: _.tail(path)
                        }
                    }
                });
    });

update.extend(
    '$removeFilter',
    function (path: number[], original: Filter) {
        return _.isEmpty(_.tail(path))
            ? update(
                original, {
                    theValue: {
                        $splice: [[_.head(path), 1]]
                    }
                })
            : update(
                original, {
                    theValue: {
                        [_.head(path)]: {
                            $removeFilter: _.tail(path)
                        }
                    }
                });
    });

update.extend(
    '$updateFilterProperty',
    function (
        params: {
            path: number[],
            nextProperty: Property,
        },
        original: Filter) {
        return _.isEmpty(_.tail(params.path))
            ? update(
                original, {
                    theValue: {
                        [_.head(params.path)]: {
                            property: { $set: params.nextProperty }
                        }
                    }
                })
            : update(
                original, {
                    theValue: {
                        [_.head(params.path)]: {
                            $updateFilterProperty: {
                                path: _.tail(params.path),
                                nextProperty: params.nextProperty
                            }
                        }
                    }
                });
    });



update.extend(
    '$updateFilterValue',
    function (
        params: {
            path: number[],
            nextValue: PrimitiveValueFilter | Filter[]
        },
        original: Filter) {
        return _.isEmpty(_.tail(params.path))
            ? update(
                original, {
                    theValue: {
                        [_.head(params.path)]: {
                            theValue: { $set: params.nextValue }
                        }
                    }
                })
            : update(
                original, {
                    theValue: {
                        [_.head(params.path)]: {
                            $updateFilterValue: {
                                path: _.tail(params.path),
                                nextValue: params.nextValue
                            }
                        }
                    }
                });
    });

