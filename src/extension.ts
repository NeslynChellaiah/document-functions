import * as acorn from "acorn";
import * as walk from 'acorn-walk';
import * as vscode from 'vscode';

import { getDocs } from "./utils/apiService";

let apiKey: string | undefined;
let fnScope: string = "";
let fnStart: vscode.Position;

export async function activate(context: vscode.ExtensionContext) {
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
        vscode.commands.registerCommand("document-functions.docFn", (document: vscode.TextDocument, range: vscode.Range) => insertDocs(context, document, range))
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
        const ast: acorn.Program = acorn.parse(code, { sourceType: "module", ecmaVersion: 2020 });
        walk.simple(ast, {
            FunctionDeclaration(node: acorn.FunctionDeclaration | acorn.AnonymousFunctionDeclaration) {
                if (node?.type == "FunctionDeclaration") {
                    AddDocsToFnDeclaration(node, currentEditor);
                }
            },
            VariableDeclarator(node: acorn.VariableDeclarator) {
                if (node?.init?.type === "ArrowFunctionExpression") {
                    AddDocsToFnDeclaration(node, currentEditor);
                }
            }
        });
    } catch (error: any) {
        vscode.window.showErrorMessage(error.message);
    }
}

function AddDocsToFnDeclaration(node: acorn.FunctionDeclaration | acorn.AnonymousFunctionDeclaration | acorn.ArrowFunctionExpression | acorn.VariableDeclarator, currentEditor: vscode.TextEditor) {
    if (!node?.id?.start && !node?.id?.end) {
        return;
    }
    const startPos: vscode.Position | undefined = currentEditor.document.positionAt(node.id?.start);
    const endPos: vscode.Position | undefined = currentEditor.document.positionAt(node.id?.end);
    if (!startPos || !endPos || startPos.isEqual(endPos)) {
        return;
    }

    const currentSelection: vscode.Selection = currentEditor.selection;
    if (cannotAddDocs(startPos, endPos, currentSelection)) {
        return;
    }
    fnScope = currentEditor.document.getText().slice(node.start, node.end);
    fnStart = startPos;
    return;
}

function cannotAddDocs(startPos: vscode.Position, endPos: vscode.Position, currentSelection: vscode.Selection) {
    const range: vscode.Range = new vscode.Range(startPos, endPos);

    return (!startPos.isEqual(currentSelection.start) || !endPos.isEqual(currentSelection.end)
        || !startPos.isEqual(range.start) || !endPos.isEqual(range.end));
}

async function insertDocs(context: vscode.ExtensionContext, document: vscode.TextDocument, range: vscode.Range) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
        return;
    }
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
    editor?.edit(editBuilder => {
        editBuilder.insert(insertPosition, docs);
        vscode.window.showInformationMessage("Function docs updated");
    }).then(success => {
        if (!success || !editor) {
            return;
        }
        const newSelection = new vscode.Selection(editor?.selection.end, editor?.selection.end);
        editor.selection = newSelection;
    });
}

class QuickFixProvider implements vscode.CodeActionProvider {
	provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range
	): vscode.CodeAction[] {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document) {
            return [];
        }
		const quickFixes: vscode.CodeAction[] = [];

		try {
            const code: string = document.getText();
            const ast: acorn.Program = acorn.parse(code, { sourceType: "module", ecmaVersion: 2020 });

            let isInsideFunctionIdentifier = false;

            walk.simple(ast, {
                FunctionDeclaration(node: acorn.FunctionDeclaration | acorn.AnonymousFunctionDeclaration) {
                    if (node?.type == "FunctionDeclaration" && node?.id?.start && node?.id?.end) {
                        const startPos: vscode.Position = document.positionAt(node.id.start);
                        const endPos: vscode.Position = document.positionAt(node.id.end);
                        const identifierRange = new vscode.Range(startPos, endPos);

                        if (range.intersection(identifierRange)) {
                            isInsideFunctionIdentifier = true;
                        }
                    }
                },
                VariableDeclarator(node: acorn.VariableDeclarator) {
                    if (node?.init?.type === "ArrowFunctionExpression" && node?.id?.start && node?.id?.end) {
                        const startPos: vscode.Position = document.positionAt(node.id.start);
                        const endPos: vscode.Position = document.positionAt(node.id.end);
                        const identifierRange = new vscode.Range(startPos, endPos);
                        if (range.intersection(identifierRange)) {
                            isInsideFunctionIdentifier = true;
                        }
                    }
                }
            });
			if (isInsideFunctionIdentifier) {

				const docFn = new vscode.CodeAction(
					"Add function docs",
					vscode.CodeActionKind.QuickFix
				);
				docFn.command = { command: "document-functions.docFn", title: "Add function docs", arguments: [document, range] };
				quickFixes.push(docFn);
			}

		return quickFixes;
		} catch (e: any) {
			console.log(e);
		}
		return [];
	}
}

export function deactivate() { }			