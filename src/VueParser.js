const j = require('jscodeshift');
const posthtml = require('posthtml');
const { render } = require('./htmlrender');
const { toSource, getDefaultExport, objProp, addToTop, parse } = require('./node-utils');
const { findOption, makeOptionProp } = require('./vue-utils');

module.exports = class VueParser {
    constructor(text) {
        this.isDone = new Promise(resolve => {
            posthtml().process(text, { recognizeSelfClosing: true, closingSingleTag: 'slash', render }).then(results => {
                this.results = results;
                this.tree = results.tree;
                this.script = undefined;
                results.tree.match({ tag: 'script' }, node => {
                    this.scriptNode = node;
                    // node.content may be an array of strings instead of one string
                    // since the JS code is represented as a JS string, slashes need to be double-escaped
                    // else you get "unterminated string constant" errors because
                    // the slashes get used up by the parser
                    let content = node.content.join('').replace(/\\/g, '\\\\');
                    this.script = j(content);
                    return node;
                });
                let found = false;
                results.tree.match({ tag: 'template' }, node => {
                    if (found) return node;
                    found = true;
                    this.template = node;
                    return node;
                });
                if (!this.script) this.script = j('');
                resolve();
            });
        });
    }

    ready() {
        return this.isDone;
    }

    option(name) {
        let node = findOption(this.script, name);
        if (!node.length) {
            const prop = makeOptionProp(name);
            getDefaultExport(this.script).get().value.properties.push(prop);
            node = j(prop);
        }
    
        return node;
    }

    importComponent(path) {
        const cmpName = path.split('/').slice(-1)[0].split('.')[0];
        const aliasedPath = path.replace('src', '@');

        addToTop(this.script, parse(`import ${cmpName} from '${aliasedPath}';`));

        const components = this.option('components');
        const cmpProp = objProp(cmpName, j.identifier(cmpName), { shorthand: true });
        components.get().value.value.properties.push(cmpProp);
    }

    deportComponent(name) {
        this.script.find(j.ImportDefaultSpecifier, { local: { name } })
            .closest(j.ImportDeclaration)
            .remove();

        this.option('components')
            .find(j.Property, { key: { name } })
            .remove();
        
        if (this.option('components').get().value.value.properties.length == 0) {
            this.option('components').remove();
        }
    }

    toString() {
        this.tree.match({ tag: 'script' }, node => {
            node.content = [toSource(this.script)];
            return node;
        });
        return this.results.html;
    }
}