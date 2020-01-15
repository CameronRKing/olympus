const vscode = require('vscode');
const { remove } = require('./utils');

function replaceEditorContent(editor, newContents) {
    return editor.edit(editBuilder => {
        const length = editor.document.getText().length;
        const wholeDoc = new vscode.Range(new vscode.Position(0, 0), editor.document.positionAt(length));
        editBuilder.replace(wholeDoc, newContents);
        return editBuilder;
    });
}
exports.replaceEditorContent = replaceEditorContent;

function selectionFromNode(node) {
    const { start, end } = node.loc;
    return new vscode.Selection(
        new vscode.Position(start.line - 1, start.column),
        new vscode.Position(end.line - 1, end.column)
    );
}
exports.selectionFromNode = selectionFromNode;

function wordUnderCursor(editor) {
    const cursorPos = editor.selection.active;
    const wordRange = editor.document.getWordRangeAtPosition(cursorPos);
    return editor.document.getText(wordRange);
}
exports.wordUnderCursor = wordUnderCursor;

async function findFilePath(fileName) {
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
exports.findFilePath = findFilePath;

/**
 * Short-circuits the QuickPick UI based on the keyboard shortcuts provided
 * If canSelectMany is true, the best way out is Esc
 * The UI doesn't update the way I'd like (selected/active items aren't displaying properly),
 * but the logic does work. You just have to ignore the interface and focus on the keys you press.
 * @param {Array [shortcut, description]} shortcuts 
 */
function quickSelect(shortcuts, { canSelectMany=false, selectedItems=[] }={}) {
    const picker = vscode.window.createQuickPick();
    const items = shortcuts.map(([label, detail]) => ({ label, detail }));
    picker.items = items;
    picker.canSelectMany = canSelectMany;
    picker.selectedItems = selectedItems.map(name => picker.items.find(item => item.detail == name));;
    return new Promise(resolve => {
        picker.onDidChangeValue(val => {
            const regex = new RegExp(`^${val}$`);
            const matched = items.filter(({ label }) => regex.exec(label));
            if (matched.length == 1) {
                const item = matched[0];
                if (picker.selectedItems.includes(item)) {
                    remove(picker.selectedItems, item);
                } else {
                    picker.selectedItems.push(item);
                }
                if (!canSelectMany) picker.hide();
                else picker.value = '';
            }
        });
        picker.onDidHide(() => {
            if (canSelectMany) resolve(picker.selectedItems.map(item => item.detail));
            else resolve(picker.selectedItems.length ? picker.selectedItems[0].detail : null);
        });
        picker.show();
    });
}
exports.quickSelect = quickSelect;

function rootFolder() {
    return vscode.workspace.workspaceFolders[0].uri.fsPath;
}
exports.rootFolder = rootFolder;