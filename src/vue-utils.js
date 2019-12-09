const j = require('jscodeshift');
const { findObjProp, getDefaultExport, objProp, object } = require('./node-utils.js');

function findOption(jSrc, name) {
    return findObjProp(getDefaultExport(jSrc), name);
}

exports.findOption = findOption;

function makeOptionProp(name) {
    switch (name) {
        default:
            return objProp(name, object());
    }
}
exports.makeOptionProp = makeOptionProp;