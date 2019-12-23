const j = require('jscodeshift');
const posthtml = require('posthtml');
const { render } = require('./htmlrender');
const { toSource, getDefaultExport, objProp, addToTop, parse, object } = require('./node-utils');
const { findOption, makeOptionProp } = require('./vue-utils');
const { mapWithKeys, pairs } = require('./utils');

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

    addProp(name) {
        const props = this.option('props').get().value;

        if (props.value.type == 'ArrayExpression') {
            props.value.elements.push(j.literal(name));
        } else {
            props.value.value.properties.push(objProp(name, object()));
        }
    }

    removeProp(name) {
        const props = this.option('props');
        
        if (props.get().value.value.type == 'ArrayExpression') {
            props.find(j.Literal, { value: name }).remove();
            if (props.get().value.value.elements.length == 0) {
                props.remove();
            }
        } else {
            props.find(j.Property, { key: { name } }).remove();
            if (props.get().value.value.properties.length == 0) {
                props.remove();
            }
        }
    }

    updateProp(name, attrs) {
        const props = this.option('props');
        // convert from array to object if necessary
        if (props.get().value.value.type == 'ArrayExpression') {
            const propNames = props.get().value.value.elements
                .map(el => el.value);
            const propsObj = mapWithKeys(propNames, name => [name, {}]);
            props.get().get('value').replace(object(propsObj));
        }

        const prop = props.find(j.Property, { key: { name } });
        pairs(attrs).forEach(([propAttr, val]) => {
            // remove attribute if null
            if (val == null) {
                prop.find(j.Property, { key: { name: propAttr }}).remove();
            } else {
                let nodeVal = parse(val);
                // the parsed node needs to be unpacked if it's a boolean or a type
                if (nodeVal.type == 'ExpressionStatement') nodeVal = nodeVal.expression;
                prop.get().value.value.properties.push(objProp(propAttr, nodeVal));
            }
        });

        const propsList = props.find(j.Property);
        const emptyProps = propsList.filter(propPath => propPath.value.value.type == 'ObjectExpression' && propPath.value.value.properties.length == 0);
        // convert back to array syntax if we don't have any object properties
        if (propsList.length == emptyProps.length) {
            const newProps = propsList.paths().map(propPath => j.literal(propPath.value.key.name));
            props.get().get('value').replace(j.arrayExpression(newProps));
        }
    }

    addData(name, val) {
        const data = this.option('data');
        data.find(j.ReturnStatement)
            .find(j.ObjectExpression)
            .get().value.properties.push(objProp(name, parse(val).expression));
    }

    setData(name, newVal) {
        const data = this.option('data');
        data.find(j.Property, { key: { name } })
            .get().get('value').replace(parse(newVal).expression);
    }

    removeData(name) {
        const data = this.option('data');
        data.find(j.Property, { key: { name } }).remove();
        if (data.find(j.ReturnStatement).get().value.argument.properties.length == 0) {
            data.remove();
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