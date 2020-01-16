// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const VueParser = require('./src/VueParser');
const { assocIn, mapWithKeys, remove, prev, next } = require('./src/utils');
const {
	wordUnderCursor, replaceEditorContent,
	findFilePath, quickSelect, rootFolder,
	selectionFromNode
} = require('./src/vsutils');
const { shortcutToClass, classToShortcut, allClasses, getPatch, classToFamily, familyToClasses } = require('./src/TailwindEditor');
const j = require('jscodeshift');
const fs = require('fs').promises;

async function getCmp(editor) {
	const text = editor.document.getText();
	const cmp = new VueParser(text);
	await cmp.isDone;
	return cmp;
}

function actionSetup(cb) {
	return async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;
		const cmp = await getCmp(editor);

		const toReplace = await cb(editor, cmp);
		if (typeof toReplace !== 'string') return;
		replaceEditorContent(editor, toReplace);
	}
}

async function getValidChoice(editor, cmp, dataSrc, placeholder) {
	let toRemove = wordUnderCursor(editor);
	const valid = Object.keys(cmp[dataSrc]());
	if (!valid.includes(toRemove)) {
		toRemove = await vscode.window.showQuickPick(valid, { placeholder });
	}
	return toRemove;
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

function confirmWordUnderCursor(editor, prompt='') {
	const value = wordUnderCursor(editor);
	return vscode.window.showInputBox({ value, prompt });
}

const actions = [
	['ic', 'import component', actionSetup(async (editor, cmp) => {
		const cmpName = await confirmWordUnderCursor(editor, 'Type component name (not path)');
		let filePath = await findFilePath(cmpName + '.vue')
		
		if (!filePath) {
			filePath = await vscode.window.showInputBox({ prompt: 'Create new component?', value: `src/${cmpName}.vue` });
			if (filePath === undefined) return false;

			await fs.writeFile(rootFolder() + '/' + filePath, `<script>
export default {};
</script>`);
		}
		cmp.importComponent(filePath);
		return cmp.toString();
	})],
	['dc', 'deport component', actionSetup(async (editor, cmp) => {
		const toRemove = await getValidChoice(editor, cmp, 'components', 'Select component to deport');
		cmp.deportComponent(toRemove);
		return cmp.toString();
	})],
	['ap', 'add prop', actionSetup(async (editor, cmp) => {
		const propName = await confirmWordUnderCursor(editor, 'Type prop name');
		cmp.addProp(propName);
		return cmp.toString();
	})],
	['up', 'update prop', actionSetup(async (editor, cmp) => {
		const toUpdate = await getValidChoice(editor, cmp, 'props', 'Select prop to update');
		
		// prep for asking user to update options
		const options = [
			['t', 'type'],
			['r', 'required'],
			['d', 'default'],
			['v', 'validator'],
		];
		const optionsNode = cmp.props()[toUpdate];
		const existingOptions = optionsNode ? optionsNode.properties.map(prop => prop.key.name) : [];
		
		// ask user to quick-select which options the prop should have
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
		editor.selection = selectionFromNode(propOption);
		return false;
	})],
	['rp', 'remove prop', actionSetup(async (editor, cmp) => {
		const toRemove = await getValidChoice(editor, cmp, 'props', 'Select prop to remove');
		cmp.removeProp(toRemove);
		return cmp.toString();
	})],
	['ad', 'add data', actionSetup(async (editor, cmp) => {
		const name = await confirmWordUnderCursor(editor, 'Type data name');
		cmp.addData(name, 'null');
		await replaceEditorContent(editor, cmp.toString());
		// have to re-parse the component to find the location of the new AST node
		cmp = await getCmp(editor);
		const dataValue = cmp.option('data').find(j.Property, { key: { name } }).get().value.value;
		editor.selection = selectionFromNode(dataValue);
		return false;
	})],
	['ud', 'update data', actionSetup(async (editor, cmp) => {
		const toUpdate = await getValidChoice(editor, cmp, 'data', 'Select data to update');
		const dataValueNode = cmp.data()[toUpdate];
		editor.selection = selectionFromNode(dataValueNode);
		return false;
	})],
	['rd', 'remove data', actionSetup(async (editor, cmp) => {
		const toRemove = await getValidChoice(editor, cmp, 'data', 'Select data to remove');
		cmp.removeData(toRemove);
		return cmp.toString();
	})],
	['aw', 'add watcher', actionSetup(async (editor, cmp) => {
		const watcherName = await confirmWordUnderCursor(editor, 'Type watcher name');
		cmp.addWatcher(watcherName);
		return cmp.toString();
	})],
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
	['rw', 'remove watcher', actionSetup(async (editor, cmp) => {
		const toRemove = await getValidChoice(editor, cmp, 'watchers', 'Select watcher to remove');
		cmp.removeWatcher(toRemove);
		return cmp.toString();
	})],
	['ac', 'add computed', actionSetup(async (editor, cmp) => {
		const computedName = await confirmWordUnderCursor(editor, 'Type computed name');
		cmp.addComputed(computedName);
		return cmp.toString();
	})],
	['asc', 'add setter to computed', actionSetup(async (editor, cmp) => {
		const computedName = await getValidChoice(editor, cmp, 'computed', 'Select computed to add setter to');
		cmp.addComputedSetter(computedName);
		return cmp.toString();
	})],
	['rsc', 'remove setter from computed', actionSetup(async (editor, cmp) => {
		const computedName = await getValidChoice(editor, cmp, 'computed', 'Select computed to remove setter from');
		cmp.removeComputedSetter(computedName);
		return cmp.toString();
	})],
	['rc', 'remove computed', actionSetup(async (editor, cmp) => {
		const toRemove = await getValidChoice(editor, cmp, 'computed', 'Select computed to remove');
		cmp.removeComputed(toRemove);
		return cmp.toString();
	})],
	['am', 'add method', actionSetup(async (editor, cmp) => {
		const methodName = await confirmWordUnderCursor(editor, 'Type method name');
		cmp.addMethod(methodName);
		return cmp.toString();
	})],
	['rm', 'remove method', actionSetup(async (editor, cmp) => {
		const toRemove = await getValidChoice(editor, cmp, 'methods', 'Select method to remove');
		cmp.removeMethod(toRemove);
		return cmp.toString();
	})],
	['et', 'edit tailwind classes', actionSetup(async (editor, cmp) => {
		// ideally I'd match the user's cursor position to a node in the AST
		// however, it's not as easy as you might think. posthtml doesn't track location info,
		// and the parsers I've found that do don't have the render/manipulation functions I'd like
		// so we're going with a hack
		// we'll find the first tag previous to the user's cursor and count the number of same tags before it
		// then we'll walk the tree and take the nth AST node with that tag
		const contents = editor.document.getText();
		const cursorPos = editor.document.offsetAt(editor.selection.active);
		const tags = contents.slice(0, cursorPos).match(/<\w+/g);
		const prevTags = tags.slice(0, -1);
		const lastTag = tags.slice(-1)[0];
		const numTagsBefore = prevTags.filter(tag => tag == lastTag).length;
		const tagNodes = [];
		cmp.tree.match({ tag: lastTag.slice(1) }, node => { tagNodes.push(node); return node; });
		const nodeToEdit = tagNodes[numTagsBefore];

		tailwindEdit(editor, cmp, nodeToEdit);
	})],
	['ss', 'client socket snippet for live class editing', () => {
		vscode.env.clipboard.writeText(`
(function() {
    const socket = io.connect('http://localhost:4242');
    socket.on('edit-class', ({ id, patch }) => { 
        document.querySelectorAll(\`[data-olympus="\${ id }"]\`)
            .forEach(el => {
                if (patch.remove) el.classList.remove(patch.remove);
                if (patch.add) el.classList.add(patch.add);
            });
    });
})();`);
		vscode.window.showInformationMessage('Snippet copied to clipboard!');
	}],
	['ai', 'add olympus ids', actionSetup(async (editor, cmp) => {
		const nextOlympusId = (cmp) => {
			let nodes = [];
			cmp.tree.match({ attrs: { 'data-olympus': /.*/ } }, node => {
				nodes.push(node);
				return node;
			});
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
		cmp.tree.walk(node => {
			if (node.attrs && node.attrs['data-olympus']) {
				node.attrs['data-olympus'] = undefined;
			}
			return node;
		});
		return cmp.toString();
	})]
];

function tailwindEdit(editor, cmp, node) {
	if (!node.attrs) node.attrs = {};
	if (!node.attrs.class) node.attrs.class = '';

	let classList = node.attrs.class.split(' ').filter(str => str != '');
	
	const input = vscode.window.createInputBox();
	let justNavigated = false;
	input.onDidChangeValue(value => {
		const suffix = value[value.length - 1];
		const shortcut = value.slice(0, -1).split(':').slice(-1)[0];
		const variants = value.split(':').slice(0, -1).join(':');
		if (suffix == ' ') {
			if (justNavigated) {
				input.value = '';
				justNavigated = false;
				return;
			}
			const cclass = shortcutToClass[shortcut];
			if (cclass) patchClasses(variants, cclass);
			else (patchClasses(variants, value.trim()));
			input.value = '';
		} else if ((shortcutToClass[shortcut] || allClasses.includes(shortcut)) && ['j', 'k'].includes(suffix)) {
			// there's a chance of this logic going awry, but I think the chances are low enough to risk it
			// (consider would would happen if we had shortcuts df and dfjr)
			const currClass = shortcutToClass[shortcut] || shortcut;
			let nextClass;
			const siblings = (cclass) => familyToClasses[classToFamily[cclass]];
			
			if (suffix == 'j') nextClass = prev(siblings(currClass), currClass);
			if (suffix == 'k') nextClass = next(siblings(currClass), currClass);
			
			patchClasses(variants, nextClass);
			input.value = (variants ? variants + ':' : '') + (classToShortcut[nextClass] || nextClass);
			justNavigated = true;
		}
	});
	input.show();
	
	const patchClasses = (variants, cclass) => {
		const patch = getPatch(classList, cclass, variants);
		if (patch.remove) remove(classList, patch.remove);
		if (patch.add) classList.push(patch.add);
		update(patch);
	};

	const update = (patch) => {
		if (socket) socket.emit('edit-class', { id: node.attrs['data-olympus'], patch });

		node.attrs.class = classList.join(' ');
		if (node.attrs.class == '') node.attrs.class = undefined;
		replaceEditorContent(editor, cmp.toString());
	};

}

function getActionFn(actionName) {
	return actions.find(([_, name]) => name == actionName)[2];
}

function registerCommand(context, name, cb) {
	const disposable = vscode.commands.registerCommand(name, cb);
	context.subscriptions.push(disposable);
}
// this code is called when your extension is activated
// your extension is activated the very first time the command is executed
const socket = require('socket.io')('4242');
exports.activate = function activate(context) {
	registerCommand(context, 'extension.openMenu', async () => {
		const actionName = await quickSelect(actions);
		if (!actionName) return;
		getActionFn(actionName)();
	});
}

// this method is called when your extension is deactivated
exports.deactivate = function deactivate() { }