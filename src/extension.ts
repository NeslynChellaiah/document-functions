import * as acorn from "acorn";
import * as walk from 'acorn-walk';
import * as vscode from 'vscode';

const EDITOR: vscode.TextEditor | undefined = vscode.window.activeTextEditor;

export function activate(context: vscode.ExtensionContext) {
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

	insertDocs(startPos);
}

function cannotAddDocs(startPos: vscode.Position, endPos: vscode.Position, currentSelection: vscode.Selection) {
	const range: vscode.Range = new vscode.Range(startPos, endPos);

	return (!startPos.isEqual(currentSelection.start) || !endPos.isEqual(currentSelection.end) 
		|| !startPos.isEqual(range.start) || !endPos.isEqual(range.end));
}

function insertDocs(startPos: vscode.Position) {
	const insertPosition = new vscode.Position(startPos.line, 0);
	EDITOR?.edit(editBuilder => {
		editBuilder.insert(insertPosition, "/**Static Docs\n**/\n");
		}).then(success => {
			if (!success || !EDITOR) {
				return;
			}
			const newSelection = new vscode.Selection( EDITOR?.selection.end,  EDITOR?.selection.end);
			EDITOR.selection = newSelection;
		});
}

export function deactivate() { }			