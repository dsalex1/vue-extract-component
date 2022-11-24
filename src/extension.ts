// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { extractVueComponent } from './extractVueComponent';
import lineColumn = require("line-column");

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vue-extract-component" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('vue-extract-component.extractVueComponent', extractVueComponent);

	context.subscriptions.push(disposable);

	disposable = vscode.languages.registerCodeActionsProvider(
		"vue",
		new RefactoringActionProvider(),
		{ providedCodeActionKinds: [vscode.CodeActionKind.RefactorRewrite] }
	);
	context.subscriptions.push(disposable);

}

class RefactoringActionProvider implements vscode.CodeActionProvider {
	provideCodeActions(document: vscode.TextDocument, range: vscode.Selection) {
		if (range.start.isEqual(range.end)) return null
		const documentText = document.getText()
		const startIndex = documentText.indexOf("<template>") + 10
		const endIndex = documentText.lastIndexOf("</template>")
		if (lineColumn(documentText).toIndex(range.start.line + 1, range.start.character + 1) < startIndex) return null
		if (lineColumn(documentText).toIndex(range.end.line + 1, range.end.character + 1) > endIndex) return null
		const action = new vscode.CodeAction(`Extract selection to new vue component`, vscode.CodeActionKind.RefactorMove);
		action.command = {
			title: `Extract selection to new vue component.`,
			command: 'vue-extract-component.extractVueComponent'
		}
		return [action];
	}
}

// This method is called when your extension is deactivated
export function deactivate() { }
