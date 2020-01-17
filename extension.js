// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const { actions, getActionFn } = require('./src/actions');
const { quickSelect } = require('./src/vsutils');

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