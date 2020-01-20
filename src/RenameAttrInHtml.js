const j = require('jscodeshift');
const { pairs, mapWithKeys } = require('./utils');
/**
 * Given an HTML AST, looks for Vue HTML attributes that use the given JS attribute (prop, data, method, etc.)
 * And updates the value of the HTML attributes to reflect the new name
 * @param {*} hast 
 * @param {String} name 
 * @param {String} newName 
 */
function renameAttrInHtml(hast, name, newName) {
    hast.match({ tag: /.*/ }, node => {
        if (!(node && node.attrs)) return node;
        const vueAttrs = pairs(node.attrs).filter(([key, val]) => key.includes(':') || key.includes('@') || key.includes('v-'));
        const parsedAttrs = vueAttrs.map(([key, val]) => [key, j(val)]);
        const renamedAttrs = parsedAttrs.map(([key, jsrc]) => {
            jsrc.find(j.Identifier, { name }).map(path => {
                path.replace(j.identifier(newName));
                return path;
            });
            return [key, jsrc];
        });
        renamedAttrs.forEach(([key, jsrc]) => {
            console.log(node);
            node.attrs[key] = jsrc.toSource({ quote: 'single' })
        });
        return node;
    });
}
module.exports = renameAttrInHtml;