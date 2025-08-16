// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SwanLabApi, Workspace } from './swanlab-api';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "helloworld-sample" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World!');
	});

	context.subscriptions.push(disposable);
	
	// 注册SwanLabListWorkspaces工具
	context.subscriptions.push(
		vscode.lm.registerTool('LMT4SwanLab-SwanLabListWorkspaces', new SwanLabListWorkspacesTool())
	);
}

// 从package.json中定义的schema可以看出，输入参数可能包含tabGroup
interface IListWorkspacesParameters {
	tabGroup?: number;
}

class SwanLabListWorkspacesTool implements vscode.LanguageModelTool<IListWorkspacesParameters> {
	async prepareInvocation(
		options: vscode.LanguageModelToolInvocationPrepareOptions<IListWorkspacesParameters>,
		_token: vscode.CancellationToken
	) {
		const confirmationMessages = {
			title: 'List SwanLab Workspaces',
			message: new vscode.MarkdownString("Get the list of all workspaces (organizations) of current SwanLab users")
		};
		return {
			invocationMessage: 'Getting list of SwanLab workspaces',
			confirmationMessages
		};
	}

	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<IListWorkspacesParameters>,
		_token: vscode.CancellationToken
	) {
		try {
			// 获取API密钥，从配置中获取
			const config = vscode.workspace.getConfiguration('swanlab');
			const apiKey = config.get<string>('apiKey');
			
			if (!apiKey) {
				return new vscode.LanguageModelToolResult([
					new vscode.LanguageModelTextPart("SwanLab API key not configured. Please set 'swanlab.apiKey' in your settings.")
				]);
			}
			
			// 创建SwanLab API实例
			const api = new SwanLabApi(apiKey);
			
			// 获取工作空间列表
			const workspaces: Workspace[] = await api.listWorkspaces();
			
			const workspacesJson = JSON.stringify(workspaces, null, 2);
			
			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(`SwanLab Workspaces List:
\`\`\`json
${workspacesJson}
\`\`\``)
			]);
		} catch (error) {
			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(`Error retrieving workspaces: ${error instanceof Error ? error.message : String(error)}`)
			]);
		}
	}
}

// this method is called when your extension is deactivated
export function deactivate() {}