import * as acorn from "acorn";
import * as walk from 'acorn-walk';
import * as vscode from 'vscode';

import { getDocs } from "./utils/apiService";

const EDITOR: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
let apiKey: string | undefined;
let fnScope: string = "";
let fnStart: vscode.Position;
var selectionRange: vscode.Range;

export async function activate(context: vscode.ExtensionContext) {
	await context.secrets.delete("API_KEY");

	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider(
			{ language: "javascript", scheme: "file" },
			new QuickFixProvider(),
			{
				providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
			}
		)
	);

	apiKey = await context.secrets.get("API_KEY");
	if (!apiKey) {
		const key: string | undefined = await vscode.window.showInputBox({
			prompt: "Enter gemini api key",
			placeHolder: "dvygmjfcecvyf...",
			ignoreFocusOut: true
		});
		await context.secrets.store("API_KEY", key || '');
		apiKey = key;
	}
	if (!apiKey) {
		vscode.window.showErrorMessage("No API credentials provided.");
	}

	const listenSelection: vscode.Disposable = vscode.window
		.onDidChangeTextEditorSelection((event: vscode.TextEditorSelectionChangeEvent) => {
			let timeout: NodeJS.Timeout | undefined;
			if (timeout) {
				clearTimeout(timeout);
			}

			timeout = setTimeout(() => {
				addDocument(event);
			}, 100);
		});

	context.subscriptions.push(listenSelection);
	context.subscriptions.push(
		vscode.commands.registerCommand("document-functions.docFn", () => { insertDocs(context) })
	);
}

function addDocument(event: vscode.TextEditorSelectionChangeEvent) {
	if (event.kind !== 2) {
		return;
	}
	const currentEditor: vscode.TextEditor = event.textEditor;
	if (currentEditor.selection.isEmpty || !currentEditor.selection.isSingleLine) {
		return;
	}

	const code: string = currentEditor.document.getText();
	try {
		const ast: acorn.Program = acorn.parse(code, { ecmaVersion: 2020 });
		walk.simple(ast, {
			FunctionDeclaration(node: acorn.FunctionDeclaration | acorn.AnonymousFunctionDeclaration) {
				AddDocsToFnDeclaration(node, currentEditor);
			},
		});
	} catch (error: any) {
		vscode.window.showErrorMessage(error.message);
	}
}

function AddDocsToFnDeclaration(node: acorn.FunctionDeclaration | acorn.AnonymousFunctionDeclaration, currentEditor: vscode.TextEditor) {
	if (!node?.id?.start && !node?.id?.end) {
		return;
	}
	const startPos: vscode.Position | undefined = EDITOR?.document.positionAt(node.id?.start);
	const endPos: vscode.Position | undefined = EDITOR?.document.positionAt(node.id?.end);
	if (!startPos || !endPos || startPos.isEqual(endPos)) {
		return;
	}

	const currentSelection: vscode.Selection = currentEditor.selection;
	if (cannotAddDocs(startPos, endPos, currentSelection)) {
		return;
	}
	selectionRange = new vscode.Range(startPos, endPos);
	fnScope = currentEditor.document.getText().slice(node.start, node.end);
	fnStart = startPos;
	return;
}

function cannotAddDocs(startPos: vscode.Position, endPos: vscode.Position, currentSelection: vscode.Selection) {
	const range: vscode.Range = new vscode.Range(startPos, endPos);

	return (!startPos.isEqual(currentSelection.start) || !endPos.isEqual(currentSelection.end)
		|| !startPos.isEqual(range.start) || !endPos.isEqual(range.end));
}

async function insertDocs(context: vscode.ExtensionContext) {
	const insertPosition = new vscode.Position(fnStart.line, 0);
	apiKey = await context.secrets.get("API_KEY") || '';
	if (!apiKey) {
		const key = await vscode.window.showInputBox({
			prompt: "Enter gemini api key",
			placeHolder: "dvygmjfcecvyf...",
			ignoreFocusOut: true
		});
		await context.secrets.store("API_KEY", key || '');
		apiKey = key;
	}

	if (!apiKey) {
		vscode.window.showErrorMessage("No API credentials provided.");
		return;
	}
	
	const docs: string = await getDocs(apiKey, fnScope);
	EDITOR?.edit(editBuilder => {
		editBuilder.insert(insertPosition, docs);
		vscode.window.showInformationMessage("Function docs updated");
	}).then(success => {
		if (!success || !EDITOR) {
			return;
		}
		const newSelection = new vscode.Selection(EDITOR?.selection.end, EDITOR?.selection.end);
		EDITOR.selection = newSelection;
	});
}

class QuickFixProvider implements vscode.CodeActionProvider {
	provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range
	): vscode.CodeAction[] {
		const quickFixes: vscode.CodeAction[] = [];
		if (!range.start.isEqual(selectionRange.start) || !range.end.isEqual(selectionRange.end)) {
			return quickFixes;
		}


		const docFn = new vscode.CodeAction(
			"Add function docs",
			vscode.CodeActionKind.QuickFix
		);
		docFn.command = { command: "document-functions.docFn", title: "Add function docs", arguments: [document, range] };
		quickFixes.push(docFn);

		return quickFixes;
	}
}

export function deactivate() { }			