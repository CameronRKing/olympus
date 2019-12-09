// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const VueParser = require('./src/VueParser');
const { pairs } = require('./src/utils.js');

function registerCommand(context, name, cb) {
	const disposable = vscode.commands.registerCommand(name, cb);
	context.subscriptions.push(disposable);
}

async function getCmp(editor) {
	const text = editor.document.getText();
	const cmp = new VueParser(text);
	await cmp.isDone;
	return cmp;
}

function wordUnderCursor(editor) {
	const cursorPos = editor.selection.active;
	const wordRange = editor.document.getWordRangeAtPosition(cursorPos);
	return editor.document.getText(wordRange);
}

function log(...msg) {
	vscode.window.showInformationMessage(...msg);
	return true;
}

// I can simulate modes/keyboard shortcuts easily:
// use them as text filters in stitched-together quick-picks
// the quick-picks navigate a hierarchy of menus
// (we'll have to save state)
function getQuickAction(shortcuts) {
	const c = vscode.window.createQuickPick();
	const items = shortcuts.map(([label, detail]) => ({ label, detail }));
	c.items = items;
	return new Promise(resolve => {
		c.onDidChangeValue(val => {
			const regex = new RegExp(`^${val}`);
			// shortcut = label; description = detail
			const matched = items.filter(({ label, detail }) => regex.exec(item.label));
			if (matched.length == 1) {
				c.hide();
				resolve(matched[0]);
			}
		});
		c.onDidChangeSelection((arg) => {
			c.hide()
		});
		c.onDidHide(() => {
			resolve(c.selectedItems.length ? c.selectedItems[0].label : null);
		});
		c.show();
	});
}

async function getFilePath(fileName) {
	const files = await vscode.workspace.findFiles(`src/**/${fileName}`);
	switch (files.length) {
		case 0:
			return null;
		case 1:
			return files[0].path;
		default:
			return await vscode.window.showQuickPick(files.map(uri => uri.path));
	}
}

// "/C:/path/to/projectRoot/src/file.vue".replace(...fullPathWithRelative)
//     => "src/file.vue"
function fullPathWithRelative() {
	return [vscode.workspace.workspaceFolders[0].uri.path, ''];
}

// "src/file.vue".replace(...foldersWithModuleAliases)
//     => "@/file.vue"
function foldersWithModuleAliases(path) {
	return ['/src', '@'];
}

function replaceEditorContent(editor, newContents) {
	return editor.edit(editBuilder => {
		const length = editor.document.getText().length;
		const wholeDoc = new vscode.Range(new vscode.Position(0, 0), editor.document.positionAt(length - 1));
		editBuilder.replace(wholeDoc, newContents);
		return editBuilder;
	});
}

const actions = [
	['ic', 'import component', 'importComponent', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;

		const cmp = await getCmp(editor);
		// this appears to not be working and I have no idea why.
		let filePath = await getFilePath(wordUnderCursor(editor) + '.vue')
		log('filepath: ' + filePath);
		if (!filePath) {
			log('add prompt to create if component can\'t be found')
			return;
			// optional prompt to create create component
				// execute command explorer.newFile
				// how can we tell if the user cancels vs. gives us a path?
			// if user says no, return
			// otherwise, filePath is now the full path of the component we created in the place the user gave us
		}
		// now that getFilePath is running, this code isn't
		// and I have no idea why
		console.log('what is going on here?');
		log(filePath.replace(...fullPathWithRelative()));
		const cmpPath = filePath.replace(...fullPathWithRelative())
								.replace(...foldersWithModuleAliases());
		log('cmp path', cmpPath);
		cmp.importComponent(cmpPath);
		replaceEditorContent(editor, cmp.toString());
		console.log(cmp.toString());
	}],
	['dc', 'deport component', 'deportComponent', async () => {
		log('todo: finish deport component');
		// get list of components in file
			// query components option
			// match to imports
		// get word under cursor
		// compare against keys in componentions option, if any
		// if 1 match, that's the cmp to remove
		// else user selects component from list
		// if user didn't select a component, quit
		// remove the given component
			// remove from components options
			// if components option is empty, remove
			// remove from file imports, if there
	}],
	['im', 'import mixin', 'importMixin', async () => {

	}]
];

function getActionFn(shortcut) {
	return actions.find(([code]) => code == shortcut)[3];
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