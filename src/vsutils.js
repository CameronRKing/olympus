const vscode = require('vscode');

function replaceEditorContent(editor, newContents) {
    return editor.edit(editBuilder => {
        const length = editor.document.getText().length;
        const wholeDoc = new vscode.Range(new vscode.Position(0, 0), editor.document.positionAt(length));
        editBuilder.replace(wholeDoc, newContents);
        return editBuilder;
    });
}
exports.replaceEditorContent = replaceEditorContent;

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

function getQuickAction(shortcuts) {
    const picker = vscode.window.createQuickPick();
    const items = shortcuts.map(([label, detail]) => ({ label, detail }));
    picker.items = items;
    return new Promise(resolve => {
        picker.onDidChangeValue(val => {
            const regex = new RegExp(`^${val}$`);
            const matched = items.filter(({ label }) => regex.exec(label));
            if (matched.length == 1) {
                picker.selectedItems = matched;
                picker.hide();
            }
        });
        picker.onDidChangeSelection((arg) => {
            picker.hide();
        });
        picker.onDidHide(() => {
            resolve(picker.selectedItems.length ? picker.selectedItems[0].label : null);
        });
        picker.show();
    });
}
exports.getQuickAction = getQuickAction;

function rootFolder() {
    return vscode.workspace.workspaceFolders[0].uri.fsPath;
}
exports.rootFolder = rootFolder;