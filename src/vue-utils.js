const j = require('jscodeshift');
const { findObjProp, getDefaultExport, objProp, object, parse } = require('./node-utils.js');

function findOption(jSrc, name) {
    return findObjProp(getDefaultExport(jSrc), name);
}

exports.findOption = findOption;

function makeOptionProp(name) {
    switch (name) {
        case 'data':
            return objProp(name, j.functionExpression(null, [],
                j.blockStatement([
                    j.returnStatement(
                        j.objectExpression([])
                    )
                ])
            ), { method: true });
        case 'props':
            return objProp(name, j.arrayExpression([]));
        default:
            return objProp(name, object());
    }
}
exports.makeOptionProp = makeOptionProp;