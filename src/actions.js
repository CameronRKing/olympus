const vscode = require('vscode');
const VueAstEditor = require('vue-ast-editor');
const {
    shortcutToClass, classToShortcut, allClasses,
    getClassPatch, classToFamily,
    nextSibling, prevSibling,
    generateComponentClasses
} = require('tailwind-zephyr');
const j = require('jscodeshift');
const fs = require('fs').promises;
const { pairs, assocIn, mapWithKeys, remove, prev, next } = require('./utils');
const {
    wordUnderCursor, replaceEditorContent,
    findFilePath, quickSelect, rootFolder,
    selectionFromNode
} = require('./vsutils');

async function getCmp(editor) {
    const text = editor.document.getText();
    const cmp = new VueAstEditor(text);
    await cmp.ready();
    return cmp;
}

let socket;
function actionSetup(cb) {
    return async (sock) => {
        socket = sock;
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const cmp = await getCmp(editor);

        const toReplace = await cb(editor, cmp);

        if (typeof toReplace !== 'string') return;
        replaceEditorContent(editor, toReplace);
    }
}

function genericAdd(prompt, fn) {
    return actionSetup(async (editor, cmp) => {
        const toAdd = await confirmWordUnderCursor(editor, prompt);
        if (toAdd === undefined) return false;
        cmp[fn](toAdd);
        return cmp.toString();
    });
}

function genericChoose(prompt, fn, lookup) {
    return actionSetup(async (editor, cmp) => {
        const choice = await getValidChoice(editor, cmp, lookup, prompt);
        if (choice === undefined) return false;
        cmp[fn](choice);
        return cmp.toString();
    });
}

function rename(prompt, lookup, fn) {
    return actionSetup(async (editor, cmp) => {
        const name = await getValidChoice(editor, cmp, lookup, 'Select ' + prompt + ' to rename');
        if (name === undefined) return false;
        const newName = await vscode.window.showInputBox({ prompt: 'Type new name', value: name });
        cmp[fn](name, newName);
        return cmp.toString();
    });
}

function refactorNode(fn) {
    return actionSetup(async (editor, cmp) => {
        const node = getTagNodeBeforeCursor(editor, cmp);
        const [hostEditor, hostCmp] = await findComponentWrappingNode(node, cmp);
        if (!hostCmp) return;
    
        if (typeof fn === 'string')
            cmp[fn](node, hostCmp);
        else
            await fn(node, cmp, hostCmp);

        replaceEditorContent(hostEditor, hostCmp.toString());
        return cmp.toString();
    });
}

async function findComponentWrappingNode(node, cmp) {
    const { tag } = cmp.findParentComponent(node);
    const path = await findFilePath(tag + '.vue');
    if (path === undefined) {
        vscode.window.showErrorMessage('Unable to find component with name ' + tag);
        return [false, false];
    }

    let hostEditor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.path == path);
    if (!hostEditor) hostEditor = await vscode.window.showTextDocument(vscode.Uri.file(path), vscode.ViewColumn.Beside);
    const hostCmp = new VueAstEditor(hostEditor.document.getText());
    await hostCmp.ready();
    return [hostEditor, hostCmp];
}

function refactorAttr(lookup, fn) {
    return actionSetup(async (editor, cmp) => {
        const node = getTagNodeBeforeCursor(editor, cmp);
        const [hostEditor, hostCmp] = await findComponentWrappingNode(node, cmp);
        const choice = await getValidChoice(editor, cmp, lookup, 'Select ' + lookup + ' to move');
        if (choice === undefined) return;

        cmp[fn](choice, hostCmp);

        replaceEditorContent(hostEditor, hostCmp.toString());
        return cmp.toString();
    });
}

function confirmWordUnderCursor(editor, prompt) {
    const value = wordUnderCursor(editor);
    return vscode.window.showInputBox({ value, prompt });
}

/**
 * Checks if word under cursor is a key in the object returned by calling `fn` on a VueAstEditor (e.g., cmp[fn]())
 * If so, returns it.
 * If not, prompts user to select a valid choice.
 * @param {*} editor 
 * @param {VueAstEditor} cmp 
 * @param {String} dataSrc 
 * @param {String} placeholder 
 */
async function getValidChoice(editor, cmp, dataSrc, placeholder) {
    let choice = wordUnderCursor(editor);
    const valid = Object.keys(cmp[dataSrc]());
    if (!valid.includes(choice)) {
        choice = await vscode.window.showQuickPick(valid, { placeholder });
    }
    return choice;
}

/**
 * Given two arrays and two mapping functions,
 * returns an object that is the result of calculating which items were removed or added,
 * then running them through their respective mapping functions
 * and reducing them into a single object
 * @param {Array} existing 
 * @param {Array} selected 
 * @param {Function => [key, value]} removed
 * @param {Function => [key, value]} added
 */
function calcPatch(existing, selected, { removed, added }) {
    const toRemove = existing.filter(item => !selected.includes(item));
    const toAdd = selected.filter(item => !existing.includes(item));
    return assocIn(
        mapWithKeys(toRemove, removed),
        mapWithKeys(toAdd, added)
    );
}

/**
 * Finds the closest HTML AST node that starts before the user's cursor
 * @param {*} editor 
 * @param {VueAstEditor} cmp 
 */
function getTagNodeBeforeCursor(editor, cmp) {
    // ideally I'd match the user's cursor position directly to a node in the AST via source code location info
    // however, it's not as easy as you might think. posthtml doesn't track location info,
    // and the parsers I've found that do track it don't have the render/manipulation functions I'd like
    // so we're going with a hack
    // we'll find the first tag previous to the user's cursor and count the number of same tags before it
    // then we'll search the tree and take the nth AST node with that tag
    const contents = editor.document.getText();
    const cursorPos = editor.document.offsetAt(editor.selection.active);
    const tags = contents.slice(0, cursorPos).match(/<\w+/g);
    const prevTags = tags.slice(0, -1);
    const lastTag = tags.slice(-1)[0];
    const numTagsBefore = prevTags.filter(tag => tag == lastTag).length;
    const tagNodes = cmp.filterHAST({ tag: lastTag.slice(1) });
    return tagNodes[numTagsBefore];
}

const actions = [
    ['ic', 'import component', actionSetup(async (editor, cmp) => {
        const cmpName = await confirmWordUnderCursor(editor, 'Type component name (not path)');
        let filePath = await findFilePath(cmpName + '.vue')

        if (!filePath) {
            filePath = await vscode.window.showInputBox({ prompt: 'Create new component?', value: `src/${cmpName}.vue` });
            if (filePath === undefined) return false;

            // should probably replace with something in vscode.workspace,
            // especially since this line will fail if not all the folders exist
            await fs.writeFile(rootFolder() + '/' + filePath, `<script>
export default {};
</script>`);
        } else {
            // if filePath exists, we need to trim it relative to the project directory
            const projectFolder = rootFolder().split('\\').slice(-1)[0];
            filePath = filePath.split(projectFolder + '/').slice(-1)[0];
        }
        cmp.importComponent(filePath);
        return cmp.toString();
    })],
    ['dc', 'deport component', genericChoose('Select component to deport', 'deportComponent', 'components')],
    ['ap', 'add prop', genericAdd('Type prop name', 'addProp')],
    ['np', 'rename prop', rename('prop', 'props', 'renameProp')],
    ['up', 'update prop', actionSetup(async (editor, cmp) => {
        const toUpdate = await getValidChoice(editor, cmp, 'props', 'Select prop to update');

        // prep for quick select
        const options = [
            ['t', 'type'],
            ['r', 'required'],
            ['d', 'default'],
            ['v', 'validator'],
        ];
        const optionsNode = cmp.props()[toUpdate];
        const existingOptions = optionsNode ? optionsNode.properties.map(prop => prop.key.name) : [];

        const selected = await quickSelect(options, { canSelectMany: true, selectedItems: existingOptions });

        // make the changes
        const toAdd = [];
        const optionsPatch = calcPatch(existingOptions, selected, {
            removed: option => [option, null],
            added: option => { toAdd.push(option); return [option, 'true']; }
        });
        cmp.updateProp(toUpdate, optionsPatch);

        // if there's nothing for the user to fill in, quit early and update the source
        if (!toAdd.length) {
            return cmp.toString();
        }

        // if we added a new option, bring the cursor to the first added option so the user can set it
        // we could try to do something tab-triggered for editing all new options,
        // but it seems more trouble than its worth for the moment
        await replaceEditorContent(editor, cmp.toString());
        cmp = await getCmp(editor);
        const propOption = cmp.option('props')
            .find(j.Property, { key: { name: toUpdate } })
            .find(j.Property, { key: { name: toAdd[0] } })
            .get().value.value;
        editor.selection = selectionFromNode(propOption, editor);
        return false;
    })],
    ['rp', 'remove prop', genericChoose('Select prop to remove', 'removeProp', 'props')],
    ['ad', 'add data', actionSetup(async (editor, cmp) => {
        const name = await confirmWordUnderCursor(editor, 'Type data name');
        cmp.addData(name, 'null');
        await replaceEditorContent(editor, cmp.toString());
        // have to re-parse the component to find the location of the new AST node
        cmp = await getCmp(editor);
        const dataValue = cmp.option('data').find(j.Property, { key: { name } }).get().value.value;
        editor.selection = selectionFromNode(dataValue, editor);
        return false;
    })],
    ['nd', 'rename data', rename('data', 'data', 'renameData')],
    ['ud', 'update data', actionSetup(async (editor, cmp) => {
        const toUpdate = await getValidChoice(editor, cmp, 'data', 'Select data to update');
        const dataValueNode = cmp.data()[toUpdate];
        editor.selection = selectionFromNode(dataValueNode, editor);
        return false;
    })],
    ['rd', 'remove data', genericChoose('Select data to remove', 'removeData', 'data')],
    ['aw', 'add watcher', genericAdd('Type watcher name', 'addWatcher')],
    ['nw', 'rename watcher', rename('watcher', 'watchers', 'renameWatcher')],
    ['uw', 'update watcher', actionSetup(async (editor, cmp) => {
        const toUpdate = await getValidChoice(editor, cmp, 'watchers', 'Select watcher to update');
        const watcherNode = cmp.watchers()[toUpdate];
        const existingOptions = watcherNode.type == 'ObjectExpression' ?
            watcherNode.properties.map(prop => prop.key.name).filter(option => option != 'handler') :
            [];
        const options = [
            ['d', 'deep'],
            ['i', 'immediate']
        ];

        const selected = await quickSelect(options, { canSelectMany: true, selectedItems: existingOptions });

        const optionsPatch = calcPatch(existingOptions, selected, {
            removed: option => [option, null],
            added: option => [option, true]
        });
        cmp.updateWatcher(toUpdate, optionsPatch);

        return cmp.toString();
    })],
    ['rw', 'remove watcher', genericChoose('Select watcher to remove', 'removeWatcher', 'watchers')],
    ['ac', 'add computed', genericAdd('Type computed name', 'addComputed')],
    ['nc', 'rename computed', rename('computed', 'computed', 'renameComputed')],
    ['asc', 'add setter to computed', genericChoose('Select computed to add setter to', 'addComputedSetter', 'computed')],
    ['rsc', 'remove setter from computed', genericChoose('Select computed to remove setter from', 'removeComputedSetter', 'computed')],
    ['rc', 'remove computed', genericChoose('Select computed to remove', 'removeComputed', 'computed')],
    ['am', 'add method', genericAdd('Type method name', 'addMethod')],
    ['nm', 'rename method', rename('method', 'methods', 'renameMethod')],
    ['rm', 'remove method', genericChoose('Select method to remove', 'removeMethod', 'methods')],
    // refactoring
    ['fc', 'refactor into component', actionSetup(async (editor, cmp) => {
        const node = getTagNodeBeforeCursor(editor, cmp);
        const cmpPath = await vscode.window.showInputBox({ prompt: 'Enter component path', value: 'src/NewComponent.vue' });
        const newCmp = await cmp.refactorIntoComponent(node, cmpPath);

        const newDocUri = vscode.Uri.parse('untitled:' + rootFolder() + '/' + cmpPath);
        const doc = await vscode.workspace.openTextDocument(newDocUri);
        const newEditor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        replaceEditorContent(newEditor, newCmp.toString());

        return cmp.toString();
    })],
    ['pas', 'push node above slot', refactorNode('pushAboveSlot')],
    ['pbs', 'push node below slot', refactorNode('pushBelowSlot')],
    ['prs', 'push node around slot', refactorNode('pushAroundSlot')],
    ['pis', 'push node into slot', refactorNode('pushIntoSlot')],
    ['pns', 'push node into new slot', refactorNode(async (node, donorCmp, hostCmp) => {
        const slotName = await vscode.window.showInputBox({ prompt: 'Type slot name' });
        if (slotName === undefined) return;
        donorCmp.pushIntoNewSlot(node, slotName, hostCmp);
    })],
    ['pic', 'push imported component', refactorAttr('components', 'pushComponent')],
    ['pd', 'push data', refactorAttr('data', 'pushData')],
    ['pc', 'push computed', refactorAttr('computed', 'pushComputed')],
    ['pw', 'push watcher', refactorAttr('watchers', 'pushWatcher')],
    ['pm', 'push method', refactorAttr('methods', 'pushMethod')],
    // tailwind
    ['et', 'edit tailwind classes', actionSetup(async (editor, cmp) => {
        const nodeToEdit = getTagNodeBeforeCursor(editor, cmp);
        tailwindEdit(editor, cmp, nodeToEdit);
    })],
    ['ex', 'extract tailwind component class', actionSetup(async (editor, cmp) => {
        const nodeToEdit = getTagNodeBeforeCursor(editor, cmp);
        const classList = nodeToEdit.attrs.class.split(' ');
        const componentName = await vscode.window.showInputBox({ prompt: 'Type component class name' });
        if (componentName === undefined) return false;

        vscode.env.clipboard.writeText(generateComponentClasses(classList, componentName));
        nodeToEdit.attrs.class = componentName;
        vscode.window.showInformationMessage('Component classes copied to clipboard!');
        return cmp.toString();
    })],
    ['ss', 'client socket snippet for live class editing', () => {
        vscode.env.clipboard.writeText(`
(function() {
    function setupSocket() {
        const socket = io.connect('http://localhost:4242');
        socket.on('edit-class', ({ id, patch }) => { 
            document.querySelectorAll(\`[data-olympus="\${id}"]\`)
                .forEach(el => {
                    if (patch.remove) el.classList.remove(patch.remove);
                    if (patch.add) el.classList.add(patch.add);
                });
        });
    }
    if (window.io) {
        setupSocket();
    } else {
        const script = document.createElement('script');
        script.src = 'http://localhost:4242/socket.io/socket.io.js';
        script.onload = setupSocket;
        document.head.appendChild(script);
    }
})();`);
        vscode.window.showInformationMessage('Snippet copied to clipboard!');
    }],
    ['ai', 'add olympus ids', actionSetup(async (editor, cmp) => {
        const nextOlympusId = (cmp) => {
            const nodes = cmp.filterHAST({ attrs: { 'data-olympus': /.*/ } });
            const ids = nodes.map(n => Number(n.attrs['data-palette']));

            if (!ids.length) return 0;
            return Math.max.apply(null, ids) + 1;
        };

        let id = nextOlympusId(cmp);
        const addOlympusId = (node) => {
            if (['script', 'template', 'style'].includes(node.tag)) return node;

            if (!node.attrs) node.attrs = {};
            node.attrs['data-olympus'] = id++;
            return node;
        }

        cmp.tree.match({ attrs: undefined }, addOlympusId);
        cmp.tree.match({ attrs: { 'data-olympus': undefined } }, addOlympusId);

        return cmp.toString();
    })],
    ['ri', 'remove olympus ids', actionSetup(async (editor, cmp) => {
        cmp.filterHAST({ attrs: { 'data-olympus': /.*/ } })
            .forEach(node => node.attrs['data-olympus'] = undefined);
        return cmp.toString();
    })],
];

function tailwindEdit(editor, cmp, node) {
    if (!node.attrs) node.attrs = {};
    if (!node.attrs.class) node.attrs.class = '';

    let classList = node.attrs.class.split(' ').filter(str => str != '');

    const picker = setupTailwindQuickPick();

    let justNavigated = false;
    picker.onDidChangeValue(value => {
        const [variants, shortcut, suffix] = parseTailwindValue(value);
        if (suffix == ' ') {
            // since the class was just applied, treat the space as "done with this class" rather than "toggle it"
            if (justNavigated) {
                picker.value = '';
                justNavigated = false;
                return;
            }
            const cclass = shortcutToClass[shortcut];
            let patch;
            if (cclass) patch = patchClasses(variants, cclass);
            else patch = patchClasses(variants, shortcut);
            update(patch);
            picker.value = '';
        } else if ((shortcutToClass[shortcut] || allClasses.includes(shortcut)) && ['j', 'k'].includes(suffix)) {
            const nextClass = navigateToNextTailwindClass(shortcut, suffix);
            const patch = patchClasses(variants, nextClass);
            update(patch);
            picker.value = (variants ? variants + ':' : '') + (classToShortcut[nextClass] || nextClass);
            justNavigated = true;
        }
    });

    picker.onDidChangeSelection(selection => {
        const newSelection = selection.slice(-1)[0];
        if (newSelection === undefined) return;
        const cclass = newSelection.detail;
        const patch = patchClasses('', cclass);
        update(patch);
    });

    picker.show();

    const patchClasses = (variants, cclass) => {
        const patch = getClassPatch(classList, cclass, variants);
        if (patch.remove) remove(classList, patch.remove);
        if (patch.add) classList.push(patch.add);
        return patch;
    };

    const update = (patch) => {
        if (socket) socket.emit('edit-class', { id: node.attrs['data-olympus'], patch });

        node.attrs.class = classList.join(' ');
        if (node.attrs.class == '') node.attrs.class = undefined;
        replaceEditorContent(editor, cmp.toString());
    };
}

/**
 * Initializes a QuickPick with all known Tailwind classes matched to shortcut and properties affected
 */
function setupTailwindQuickPick() {
    const picker = vscode.window.createQuickPick();
    const classesWithShortcuts = pairs(shortcutToClass).map(([shortcut, cclass]) => ({
        label: shortcut,
        detail: cclass,
        description: classToFamily[cclass]
    }));
    const classesWithoutShortcuts = allClasses.filter(cclass => classToShortcut[cclass] === undefined)
        .map(cclass => ({
            label: '< none >',
            detail: cclass,
            description: classToFamily[cclass]
        }));
    picker.items = classesWithShortcuts.concat(classesWithoutShortcuts);
    picker.matchOnDetail = true;
    picker.matchOnDescription = true;
    return picker;
}

/**
 * Pulls the variants, shortcut/class, and the last character out of the value
 * @param {String} value 
 */
function parseTailwindValue(value) {
    const suffix = value[value.length - 1];
    // I feel like distinguishing between variants and substance belongs in TailwindEditor
    const shortcut = value.slice(0, -1).split(':').slice(-1)[0];
    const variants = value.split(':').slice(0, -1).join(':');
    return [variants, shortcut, suffix];
}

// really, this should be split into two functions in TailwindEditor,
// nextSibling and prevSibling,
// and the j/k logic should be kept in tailwindEdit()
function navigateToNextTailwindClass(shortcut, suffix) {
    const cclass = shortcutToClass[shortcut] || shortcut;
    
    // there's a chance of this logic going awry, but I think the chances are low enough to risk it
    // (consider would would happen if we had shortcuts df and dfjr)
    if (suffix == 'j') return nextSibling(cclass);
    if (suffix == 'k') return prevSibling(cclass);
    throw new Exception('Suffix ' + suffix + ' not recognized! Valid values are "j" and "k".');
}

exports.actions = actions;