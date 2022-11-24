import * as vscode from "vscode";
import { posix } from "path";

import { default as traverse } from '@babel/traverse'
import { parse } from '@babel/parser'
import lineColumn = require("line-column");
import htmlparser2 = require("htmlparser2");
import * as ts from "typescript";
import { Document as HTMLDocument } from "domhandler";

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

    //TODO: fix the imports by organizing
    await vscode.workspace.fs.writeFile(editor.document.uri, parentFileContent);
    await new Promise((resolve) => setTimeout(() => resolve(""), 500)) //somehow we get an modified twice error, if we dont wait before organizing imports
    await vscode.commands.executeCommand('editor.action.organizeImports')

    //TODO: for the type of the props we probably need some imports, we could also format and quickfix the file meanwhile
    await vscode.workspace.fs.writeFile(newFileURI, newFileContent);
    await vscode.window.showTextDocument(newFileURI, { preview: false });
    //await vscode.commands.executeCommand('editor.action.sourceAction', {"kind": "source.addMissingImports","apply": "first"})//FIXME:this shit aint working, maybe we need to manually add the types
    await new Promise((resolve) => setTimeout(() => resolve(""), 500)) //somehow we get an modified twice error, if we dont wait before formatting
    await vscode.commands.executeCommand('editor.action.formatDocument')


    vscode.window.showInformationMessage(`Extracted component to ${currentPath}/${selectedFile}.vue`);
}

type Node = {
    startIndex: number;
    attribs: Record<string, string>
    children: Node[];
    type: string;
    data: string;
}
type MappedNode = {
    startIndex: number;
    attrs: [string, string][]
    children: MappedNode[];
    data: string[];
}
function mapHTMLtoJSON(node: Node): MappedNode {
    return {
        startIndex: node.startIndex,
        attrs: Object.entries(node.attribs || {}).filter(([key, value]) => key.match(/(?:v-[-\[\]a-zA-Z]+|:|\.|#|@)[^<> \s=&'"]*/)),
        children: node.children
            ?.filter(node => node.type != "script")
            .filter(node => node.children?.length > 0 || node.attribs || node.data?.includes("{{") && node.data?.includes("}}"))
            .map(childNode => mapHTMLtoJSON(childNode)),
        data: [...(node.data?.matchAll(/\{\{(.*?)\}\}/g) || [])].map(s => s[1].trim())
    }
}
/**
 * this function folds the JSON structure into a string of code which can be anylysed to find unbound variables
 */
function foldHTMLJSONToJS(node: MappedNode) {
    let restMapped = ""
    restMapped += [
        ...node.attrs.filter(([name]) => name != "v-for").map(([_, value]) => value),
        ...node.data
    ].filter(a => a).map(a => `\n(${a}); //START_INDEX:${node.startIndex}`).join("")
    restMapped += node.children ? node.children.map(child => foldHTMLJSONToJS(child)).join("") : ""

    const vForAttribute = node.attrs.find(([name]) => name == "v-for")
    //TODO: handle v-slot props
    if (vForAttribute) {
        const [_, value, name, index, expression] = vForAttribute[1].match(/\(?(.*?)\s*(?:,\s*(.*?)\s*)?(?:,\s*(.*?)\s*)?\)?\s+in\s+(.*)/) || []
        return `\n{\n${[value, name, index].filter(s => s).map(s => `let ${s}=[];`).join("\n")}\n(${expression}); //START_INDEX:${node.startIndex}${restMapped}\n}`
    } else {
        return restMapped
    }
}

/**
 * this function analyses code to find unbound variables
 */
function getGlobals(inputCode: string) {
    const dom = htmlparser2.parseDocument(inputCode, { withStartIndices: true }) as unknown as Node;
    const babelTSCode = foldHTMLJSONToJS(mapHTMLtoJSON(dom));
    const babelCode = ts.transpileModule(babelTSCode, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    console.log(babelTSCode, babelCode)

    try {
        var ast = parse(babelCode, { errorRecovery: true });
    } catch (e: any) {
        throw `Error while parsing babelCode '${e.toString()}' in:\n${babelCode}`
    }
    const globals = new Map();
    traverse(ast, {
        ReferencedIdentifier: (path: any) => {
            const name = path.node.name;
            if (path.scope.hasBinding(name, true))
                return;
            if (!globals.has(path.node.name)) {
                const tagStartIndex = babelCode.split("\n")[path.node.loc.start.line - 1].match(/\/\START_INDEX\:(\d*)$/)?.[1] || -1;
                globals.set(path.node.name, lineColumn(inputCode).fromIndex(inputCode.indexOf(path.node.name, +tagStartIndex)));
            }
        }
    } as any);
    return [...globals.entries()]
        .filter(([key]) => // substract all globals that are explicitly whitelisted in vue templates, and also $event, which is a global in onclick's
            !('Infinity,undefined,NaN,isFinite,isNaN,' +
                'parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,' +
                'Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,require' +
                '$event').split(",").includes(key)
        )
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
const { ${props.map(g => g.name).join(", ")} } = toRefs(props);
</script>`;
}
