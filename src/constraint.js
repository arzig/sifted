(function (Validation, combinators, sorcery, R, fn, T) {
    // Apply a constraint to an input
    function constraint(pred, message) {
        return function (context) {
            return function (input) {
                if (pred(input)) {
                    return Validation.Success(input);
                } else {
                    return Validation.Failure([T.Reason(context, message)]);
                }
            };
        };
    }

    /**
     * A constraint that always succeeds. Note that this is still of the types
     * Context -> Input -> Validation
     */
    function valid() {
        return Validation.Success;
    }

    /**
    * Given many constraint functions as produced by constraint, return a
    * single constraint function that is the union of all of them.
    */
    function all(fns) {
        return function (context) {
            if (fns.length === 0) {
                return Validation.Success; // Empty constraints means just return success
            } else {
                var contextFns = fns.map(combinators.thrush(context));
                return function (input) {
                    return contextFns.map(combinators.thrush(input))
                    .reduce(fn.flowRight);
                };
            }
        };
    }

    var keyed = R.curry(function (key, val) {
        var obj = {};
        obj[key] = val;
        return obj;
    });

    // Construct an object field operator
    //
    function field(key, constraint, options) {
        var opts = options ? options : {};
        return function (context) {
            var subContext = T.Context.Derived(context, T.Key.Field(key));
            var contextConstraint = constraint(subContext);
            return function (input) {
                if (key in input) {
                    return contextConstraint(input[key]).map(keyed(key));
                } else if (opts.defaultVal){
                    return Validation.Success(keyed(key, opts.defaultVal));
                } else if (opts.optional) {
                    return Validation.Success({});
                } else {
                    return Validation.Failure([T.Reason(subContext, 'No value present')]);
                }
            };
        };
    }

    // Merge Validation[E, Object]
    function merger(left, right) {
        return Validation.of(R.merge).ap(left).ap(right);
    }

    function object(fields) {
        return function (context) {
            var contextFields = R.ap(fields, [context]);
            return function (input) {
                // Results is an array of validations
                var results = R.ap(contextFields, [input]);
                return R.reduce(merger, Validation.Success({}), results);
            };
        };
    }

    // Convert a F[A] -> F[List[A]]
    function mapInto(functor) {
        return functor.map(R.flip(R.repeat)(1));
    }

    function array(lengthConstraint, itemConstraint) {
        return function (context) {
            var contextLen = lengthConstraint(T.Context.Derived(context, T.Key.Field('length')));
            return function (input) {
                if (!Array.isArray(input)) {
                    return Validation.Failure([T.Reason(context, 'is not an array')]);
                }
                var len = contextLen(input.length),
                    indexes = R.range(0, input.length),
                    contexts = R.map(R.curryN(2, T.Context.Derived)(context), indexes),
                    contextItemConstraints = R.ap([itemConstraint], contexts),
                    // Apply each contextConstraint to its corresponding input item
                    // mapInt converts Validation[E, A] -> Validation[E, [A]] for easy reducing via append/concat
                    results = R.map(mapInto, R.zipWith(R.call, contextItemConstraints, input));
                return fn.flowRight(len, R.reduce(sorcery.append, Validation.Success([]), results));
            };
        };
    }

    module.exports = {
        constraint: constraint,
        valid: valid,
        all: all,
        field: field,
        object: object,
        array: array
    };

}(
    require('fantasy-validations'),
    require('fantasy-combinators'),
    require('fantasy-sorcery'),
    require('ramda'),
    require('./fn'),
    require('./types')
));
