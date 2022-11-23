import * as vscode from 'vscode';
import { posix } from 'path';
export async function extractVueComponent() {

    let editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme != "file") return; // No open text editor

    if (!editor.document.getText(editor.selection)) {// No selection made
        vscode.window.showErrorMessage(`You must select the part of the template to be extracted to a new component.`);
        return
    }

    const selectedFile = await vscode.window.showInputBox({ title: "Please enter the name for the new component.", value: "NewComponent", });
    if (!selectedFile) return;

    const currentPath = editor.document.uri.path.split('/').slice(0, -1).join('/')

    const newFileURI = editor.document.uri.with({ path: `${currentPath}/${selectedFile}.vue` });

    await vscode.workspace.fs.writeFile(editor.document.uri, Buffer.from(parentComponentCode(editor, selectedFile), 'utf8'));
    await vscode.workspace.fs.writeFile(newFileURI, Buffer.from(newComponentCode(editor), 'utf8'));

    vscode.window.showTextDocument(newFileURI, { preview: false });

    vscode.window.showInformationMessage(`Extracted component to ${currentPath}/${selectedFile}.vue`);
}

function parentComponentCode(editor: vscode.TextEditor, newComponentName: string): string {
    let text = editor.document.getText()
    let selectionText = editor.document.getText(editor.selection);

    text = text.replaceAll(selectionText, `<${newComponentName} />`)
    text = text.replace(/(<script .*?setup.*?>)/, (r) => `${r}\nimport ${newComponentName} from './${newComponentName}.vue'`)

    return text;
}

function newComponentCode(editor: vscode.TextEditor): string {
    let selectionText = editor.document.getText(editor.selection);
    return `<template>
${selectionText}
</template>

<script lang="ts" setup>
</script>`
}

