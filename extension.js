// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const VueParser = require('./src/VueParser');
const { wordUnderCursor, replaceEditorContent, findFilePath, getQuickAction, rootFolder } = require('./src/vsutils');
const { pairs } = require('./src/utils.js');
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
		if (toReplace === false) return;
		replaceEditorContent(editor, toReplace);
	}
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
	['rp', 'remove prop', actionSetup(async (editor, cmp) => {
		cmp.removeProp(wordUnderCursor(editor));
		return cmp.toString();
	})],
	['ad', 'add data', actionSetup(async (editor, cmp) => {
		const name = wordUnderCursor(editor);
		const val = await vscode.window.showInputBox({ prompt: 'Value for new data (must be valid JS)' });
		if (val === undefined) return false;
		cmp.addData(name, val);
		return cmp.toString();
	})],
	['rd', 'remove data', actionSetup(async (editor, cmp) => {
		cmp.removeData(wordUnderCursor(editor));
		return cmp.toString();
	})],
	['aw', 'add watcher', actionSetup(async (editor, cmp) => {
		cmp.addWatcher(wordUnderCursor(editor));
		return cmp.toString();
	})],
	['rw', 'remove watcher', actionSetup(async (editor, cmp) => {
		cmp.removeWatcher(wordUnderCursor(editor));
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
		cmp.removeComputed(wordUnderCursor(editor));
		return cmp.toString();
	})],
	['am', 'add method', actionSetup(async (editor, cmp) => {
		cmp.addMethod(wordUnderCursor(editor));
		return cmp.toString();
	})],
	['rm', 'remove method', actionSetup(async (editor, cmp) => {
		cmp.removeMethod(wordUnderCursor(editor));
		return cmp.toString();
	})],
];

function getActionFn(shortcut) {
	return actions.find(([code]) => code == shortcut)[2];
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
		const code = await getQuickAction(actions);
		if (!code) return;
		getActionFn(code)();
	});
}

// this method is called when your extension is deactivated
exports.deactivate = function deactivate() { }