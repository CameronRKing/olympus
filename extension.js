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
		const optionsNode = cmp.props()[toUpdate];
		// this represents a different kind of interface than getQuickAction (which is a name I don't like),
		// though I don't have a good name for this one either, and it is quite clearly a larger abstraction
		const options = [
			['t', 'type'],
			['r', 'required'],
			['d', 'default'],
			['v', 'validator'],
		];
		let existingOptions = [];
		// prepopulate the QuickPick with the options that already exist on the prop
		if (optionsNode) {
			existingOptions = optionsNode.properties.map(prop => prop.key.name);
		}
		const selected = await getQuickAction(options, { canSelectMany: true, selectedItems: existingOptions });
		const toRemove = existingOptions.filter(option => !selected.includes(option));
		const toAdd = selected.filter(option => !existingOptions.includes(option));
		const optionsPatch = assocIn(
			mapWithKeys(toRemove, key => [key, null]),
			mapWithKeys(toAdd, key => [key, 'true'])
		);
		console.log(selected, JSON.stringify(optionsPatch, null, 4));
		cmp.updateProp(toUpdate, optionsPatch);
		
		// if there's nothing for the user to fill in, just update the source and quit early
		if (!toAdd.length) {
			return cmp.toString();
		}

		// if we added a new option, bring the cursor to the first added option so the user can set it
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
	['rd', 'remove data', actionSetup(async (editor, cmp) => {
		const toRemove = await getValidChoice(editor, cmp, 'data', 'Select data to remove');
		cmp.removeData(toRemove);
		return cmp.toString();
	})],
	['aw', 'add watcher', actionSetup(async (editor, cmp) => {
		cmp.addWatcher(wordUnderCursor(editor));
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