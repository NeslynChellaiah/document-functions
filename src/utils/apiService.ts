import axios from "axios";
import * as vscode from 'vscode';

let isLoading: boolean = false;
const prompt: string = "For the given JS function give me a document. The response should only be the docs and nothing else do not add the function in the docs. Start with /** and end with */. dont send it in ``` and ``` send it directly as free text and with new line where necessarey";

export async function getDocs(apiKey: string, endpoint: string): Promise<string> {

    if (isLoading) {
        return '';
    }
    isLoading = true;

    const response = await axios.post(
        endpoint,
        { 
            "contents": [{ "parts": [{ "text": prompt }] }] 
        },
        {
            params: {
                key: apiKey
            },
            headers: {
                'Content-Type': 'application/json',
            },
        }
    )

    isLoading = false;
    const suggestions = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (response?.status !== 200 || !suggestions) {
        vscode.window.showErrorMessage("Something went wrong.");
        throw response;
    }

    return suggestions;
}