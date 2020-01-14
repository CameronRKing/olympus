// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const VueParser = require('./src/VueParser');
const { assocIn, mapWithKeys } = require('./src/utils');
const {
	wordUnderCursor, replaceEditorContent,
	findFilePath, getQuickAction, rootFolder,
	selectionFromNode
} = require('./src/vsutils');
const j = require('jscodeshift');
const fs = require('fs').promises;

async function getCmp(editor) {
	const text = editor.document.getText();
	const cmp = new VueParser(text);
	await cmp.isDone;
	return cmp;
}

function log(...msg) {
	vscode.window.showInformationMessage(...msg);
	return true;
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

async function getValidChoice(editor, cmp, toCall, placeholder) {
	let toRemove = wordUnderCursor(editor);
	let valid = Object.keys(cmp[toCall]());
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

const actions = [
	['ic', 'import component', actionSetup(async (editor, cmp) => {
		const cmpName = wordUnderCursor(editor);
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
		cmp.deportComponent(wordUnderCursor(editor));
		return cmp.toString();
	})],
	['ap', 'add prop', actionSetup(async (editor, cmp) => {
		cmp.addProp(wordUnderCursor(editor));
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
		const selected = await getQuickAction(options, { canSelectMany: true, selectedItems: existingOptions });

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
		const name = wordUnderCursor(editor);
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
		cmp.addWatcher(wordUnderCursor(editor));
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

		const selected = await getQuickAction(options, { canSelectMany: true, selectedItems: existingOptions });

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
		cmp.addComputed(wordUnderCursor(editor));
		return cmp.toString();
	})],
	['asc', 'add setter to computed', actionSetup(async (editor, cmp) => {
		cmp.addComputedSetter(wordUnderCursor(editor));
		return cmp.toString();
	})],
	['rsc', 'remove setter from computed', actionSetup(async (editor, cmp) => {
		cmp.removeComputedSetter(wordUnderCursor(editor));
		return cmp.toString();
	})],
	['rc', 'remove computed', actionSetup(async (editor, cmp) => {
		const toRemove = await getValidChoice(editor, cmp, 'computed', 'Select computed to remove');
		cmp.removeComputed(toRemove);
		return cmp.toString();
	})],
	['am', 'add method', actionSetup(async (editor, cmp) => {
		cmp.addMethod(wordUnderCursor(editor));
		return cmp.toString();
	})],
	['rm', 'remove method', actionSetup(async (editor, cmp) => {
		const toRemove = await getValidChoice(editor, cmp, 'methods', 'Select method to remove');
		cmp.removeMethod(toRemove);
		return cmp.toString();
	})],
];

function getActionFn(actionName) {
	return actions.find(([_, name]) => name == actionName)[2];
}

function tailwindEdit() {
	const input = vscode.window.createInputBox();
	input.onDidChangeValue(value => {
		if (value.endsWith('j'))
			input.value = value.replace('j', '<j>')
	});
	input.show();
}

function registerCommand(context, name, cb) {
	const disposable = vscode.commands.registerCommand(name, cb);
	context.subscriptions.push(disposable);
}
// this code is called when your extension is activated
// your extension is activated the very first time the command is executed
exports.activate = function activate(context) {
	registerCommand(context, 'extension.openMenu', async () => {
		const actionName = await getQuickAction(actions);
		if (!actionName) return;
		getActionFn(actionName)();
	});
}

// this method is called when your extension is deactivated
exports.deactivate = function deactivate() { }