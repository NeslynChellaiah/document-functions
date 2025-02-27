import axios from "axios";
import * as vscode from 'vscode';

let isLoading: boolean = false;
const prompt: string = "For the given JS function give me a document. The response should only be the docs and nothing else do not add the function in the docs. Start with /** and end with */. dont send it in ``` and ``` send it directly as free text and with new line where necessarey. The function is given below \n\n";
const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export async function getDocs(apiKey: string, fnScope: string): Promise<string> {

    if (isLoading) {
        return '';
    }
    isLoading = true;
    vscode.window.showInformationMessage("Fetching function docs.");
    try {
        const response = await axios.post(
            endpoint,
            {
                "contents": [{ "parts": [{ "text": prompt + fnScope }] }]
            },
            {
                params: {
                    key: apiKey
                },
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        isLoading = false;
        const suggestions = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

        return suggestions;
    } catch (e: any) {
        vscode.window.showErrorMessage("Something went wrong.");
        throw (e?.message);
    }
}