const j = require('jscodeshift');
const posthtml = require('posthtml');
const { render } = require('./htmlrender');
const { findObjProp, toSource, getDefaultExport, objProp, addToTop, parse, object } = require('./node-utils');
const { mapWithKeys, pairs } = require('./utils');

function emptyFunc() {
    return j.functionExpression(null, [], j.blockStatement([]));
}

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

    /**
     * Looks for the given option in the Vue component.
     * Returns if found.
     * Initializes with default value and returns if not.
     * @param {String} name 
     * @returns {Collection} option
     */
    option(name) {
        let node = this.findOption(name);
        if (!node.length) {
            const prop = this.makeOptionProp(name);
            getDefaultExport(this.script).get().value.properties.push(prop);
            node = j(prop);
        }
    
        return node;
    }

    findOption(name) {
        return findObjProp(getDefaultExport(this.script), name);
    }

    makeOptionProp(name) {
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

    /**
     * Removes the given property from the given option.
     * If the option has no more properties, it is removed from the component.
     * @param {String} option 
     * @param {String} name 
     */
    removeFromOption(optionName, name) {
        const option = this.option(optionName);
        option.find(j.Property, { key: { name } }).remove();
        if (option.find(j.Property).length == 0) option.remove();
    }

    /**
     * Given a component path relative to the project root,
     * imports that component.
     * @param {String} path 
     */
    importComponent(path) {
        const cmpName = path.split('/').slice(-1)[0].split('.')[0];
        // ideally, we should be able to pull aliases out of wherever they are defined
        // but for now, hardwiring the default src alias is okay
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

        this.removeFromOption('components', name);
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
            this.removeFromOption('props', name);
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

    addWatcher(name) {
        const watchers = this.option('watch');
        const watcher = objProp(name, j.functionExpression(null,
            [j.identifier('newVal'), j.identifier('oldVal')],
            j.blockStatement([])
        ), { method: true });
        watchers.get().value.value.properties.push(watcher);
    }

    updateWatcher(name, attrs) {
        const watchers = this.option('watch');
        const watcher = watchers.find(j.Property, { key: { name } });
        const watcherNode = watcher.get().value;

        // convert to object syntax if necessary
        if (watcherNode.value.type == 'FunctionExpression') {
            const handlerProp = objProp('handler', watcherNode.value, { method: true });
            watcherNode.value = j.objectExpression([handlerProp]);
            watcherNode.method = false;
        }

        // update deep/immediate attributes
        pairs(attrs).forEach(([attr, val]) => {
            if (val === null) {
                watcher.find(j.Property, { key: { name: attr } }).remove();
            } else {
                // if it already exists, do nothing
                if (watcher.find(j.Property, { key: { name: attr } }).length) return;

                watcherNode.value.properties.push(objProp(attr, val));
            }
        });

        // convert back to function syntax if deep/immediate not present
        if (watcherNode.value.properties.length == 1) {
            watcherNode.value = watcher.find(j.Property, { key: { name: 'handler' } }).get().value.value;
            watcherNode.method = true;
        }
    }

    removeWatcher(name) {
        this.removeFromOption('watch', name);
    }

    addComputed(name) {
        this.option('computed')
            .get().value
            .value.properties
            .push(objProp(name, emptyFunc(), { method: true }));
    }

    addComputedSetter(name) {
        const node = this.option('computed')
            .find(j.Property, { key: { name } })
            .get().value;

        const getter = objProp('get', node.value, { method: true });
        const setter = objProp('set', j.functionExpression(null,
            [j.identifier('newValue')],
            j.blockStatement([parse(`this.${name} = newValue;`)])),
            { method: true });
        node.value = j.objectExpression([getter, setter]);
        node.method = false;
    }

    removeComputedSetter(name) {
        const prop = this.option('computed')
            .find(j.Property, { key: { name } });
        
        const getter = prop.find(j.Property, { key: { name: 'get' } })
            .get().value;
        
        const node = prop.get().value;
        node.value = getter.value;
        node.method = true;
    }

    removeComputed(name) {
        this.removeFromOption('computed', name);
    }

    addMethod(name) {
        this.option('methods')
            .get().value
            .value.properties
            .push(objProp(name, emptyFunc(), { method: true }));
    }

    removeMethod(name) {
        this.removeFromOption('methods', name);
    }

    toString() {
        this.tree.match({ tag: 'script' }, node => {
            node.content = [toSource(this.script)];
            return node;
        });
        return this.results.html;
    }
}