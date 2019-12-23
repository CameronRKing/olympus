const j = require('jscodeshift');
const { findObjProp, getDefaultExport, objProp, object } = require('./node-utils.js');

function findOption(jSrc, name) {
    return findObjProp(getDefaultExport(jSrc), name);
}

exports.findOption = findOption;

function makeOptionProp(name) {
    switch (name) {
        case 'props':
            return objProp(name, j.arrayExpression([]));
        case 'components':
        default:
            return objProp(name, object());
    }
}
exports.makeOptionProp = makeOptionProp;