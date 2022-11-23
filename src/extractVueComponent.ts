import * as vscode from "vscode";
import { posix } from "path";

import { default as traverse } from '@babel/traverse'
import { parse } from '@babel/parser'
import lineColumn = require("line-column");
import * as ts from "typescript";

export async function extractVueComponent() {
    let editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme != "file") {
        return;
    } // No open text editor


    if (!editor.document.getText(editor.selection)) {
        // No selection made
        vscode.window.showErrorMessage(`You must select the part of the template to be extracted to a new component.`);
        return;
    }

    const selectedFile = await vscode.window.showInputBox({ title: "Please enter the name for the new component.", value: "NewComponent" });
    if (!selectedFile) {
        return;
    }

    const currentPath = editor.document.uri.path.split("/").slice(0, -1).join("/");

    const newFileURI = editor.document.uri.with({ path: `${currentPath}/${selectedFile}.vue` });

    let newFileContent = Buffer.from(await newComponentCode(editor), "utf8")
    let parentFileContent = Buffer.from(await parentComponentCode(editor, selectedFile), "utf8")

    await vscode.workspace.fs.writeFile(newFileURI, newFileContent);
    await vscode.workspace.fs.writeFile(editor.document.uri, parentFileContent);

    vscode.window.showTextDocument(newFileURI, { preview: false });

    vscode.window.showInformationMessage(`Extracted component to ${currentPath}/${selectedFile}.vue`);
}

function getGlobals(code: string) {
    const jsMatcher = /(?:v-(?!for)[-\[\]a-zA-Z]|:|\.|#|@)[^<> \s=&'"]*\s*=\s*(?:"(.*?)"|'(.*?)')|v-for*\s*=\s*(?:"[^"]* in \s*([^"]*)"|'[^']* in \s*([^']*)')|\{\{\s*(.*?)\s*\}\}/g

    let jsInCode = [...code.matchAll(jsMatcher)]
    let babelTSCode = jsInCode.map(s => `(${s[1] || s[2] || s[3] || s[4] || s[5]});\n`).join("")
    const babelCode = ts.transpileModule(babelTSCode, { compilerOptions: { module: ts.ModuleKind.CommonJS } });

    const ast = parse(babelCode.outputText, { errorRecovery: true })

    const globals = new Map<string, { line: number, col: number }>()
    traverse(ast, {
        ReferencedIdentifier: (path: any) => {
            const name = path.node.name
            if (path.scope.hasBinding(name, true))
                return
            if (!globals.has(path.node.name)) {
                let offset = jsInCode[path.node.loc.start.line - 1][0].indexOf(path.node.name)
                globals.set(path.node.name, lineColumn(code).fromIndex(jsInCode[path.node.loc.start.line - 1].index! + offset)!)
            }
        }
    } as any)
    return [...globals.entries()]
}

async function getTypeForURIPosition(uri: vscode.Uri, position: vscode.Position) {
    const hovers = (await vscode.commands.executeCommand('vscode.executeHoverProvider', uri, position)) as vscode.Hover[];
    const parts = (hovers)
        .flatMap(hover => hover.contents.map(content => typeof content === "string" ? content : content.value))
        .map(content => content.match(/[^:]*:([^`]*)/)?.[1])
        .filter(c => c)

    const type = parts[0]?.trim() || "any"
    return type
}

async function getProps(editor: vscode.TextEditor) {
    let selectionText = editor.document.getText(editor.selection);
    const globals = getGlobals(selectionText);
    const posInEditorFromPosInSelection = (line: number, col: number) => {
        return new vscode.Position(line + editor.selection.start.line - 1, col + (line == 1 ? editor.selection.start.character : 0));
    }
    return (await Promise.all(globals.map(async ([identifier, { line, col }]) =>
        ({ name: identifier, type: await getTypeForURIPosition(editor.document.uri, posInEditorFromPosInSelection(line, col)) }))))
}

async function parentComponentCode(editor: vscode.TextEditor, newComponentName: string) {
    let text = editor.document.getText();
    let selectionText = editor.document.getText(editor.selection);

    let props = await getProps(editor)

    text = text.replaceAll(selectionText, `<${newComponentName} ${props.map(g => `:${g.name}="${g.name}"`).join(" ")}/>`);
    text = text.replace(/(<script .*?setup.*?>)/, (r) => `${r}\nimport ${newComponentName} from './${newComponentName}.vue'`);

    return text;
}

async function newComponentCode(editor: vscode.TextEditor) {
    let selectionText = editor.document.getText(editor.selection);

    let props = await getProps(editor)

    return `<template>
${selectionText}
</template>

<script lang="ts" setup>
import { toRefs } from "vue";

const props = defineProps<{
${props.map(g => `    ${g.name}: ${g.type};`).join("\n")}
}>();
let { ${props.map(g => g.name).join(", ")} } = toRefs(props);
</script>`;
}
