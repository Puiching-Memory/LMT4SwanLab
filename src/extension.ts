// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SwanLabApi, Workspace, Project } from './swanlab-api';

// Helper function to get API key from configuration
function getApiKey(): string | undefined {
    const config = vscode.workspace.getConfiguration('swanlab');
    return config.get<string>('apiKey');
}

// Helper function to create SwanLab API instance
function createSwanLabApi(): { api: SwanLabApi, errorResult?: vscode.LanguageModelToolResult } {
    const apiKey = getApiKey();
    
    if (!apiKey) {
        return { 
            api: null as any, 
            errorResult: new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart("SwanLab API key not configured. Please set 'swanlab.apiKey' in your settings.")
            ])
        };
    }
    
    return { api: new SwanLabApi(apiKey) };
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// 注册SwanLabListWorkspaces工具
	context.subscriptions.push(
		vscode.lm.registerTool('LMT4SwanLab-SwanLabListWorkspaces', new SwanLabListWorkspacesTool())
	);

	// 注册SwanLabListProjects工具
	context.subscriptions.push(
		vscode.lm.registerTool('LMT4SwanLab-SwanLabListProjects', new SwanLabListProjectsTool())
	);

	// 注册SwanLabDeleteProject工具
	context.subscriptions.push(
		vscode.lm.registerTool('LMT4SwanLab-SwanLabDeleteProject', new SwanLabDeleteProjectTool())
	);
}

// 从package.json中定义的schema可以看出，输入参数可能包含tabGroup
interface IListWorkspacesParameters {
	tabGroup?: number;
}

class SwanLabListWorkspacesTool implements vscode.LanguageModelTool<IListWorkspacesParameters> {
	async prepareInvocation(
		_options: vscode.LanguageModelToolInvocationPrepareOptions<IListWorkspacesParameters>,
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
		_options: vscode.LanguageModelToolInvocationOptions<IListWorkspacesParameters>,
		_token: vscode.CancellationToken
	) {
		const { api, errorResult } = createSwanLabApi();
		if (errorResult) {
			return errorResult;
		}

		try {
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

// ListProjects工具的参数接口
interface IListProjectsParameters {
	workspace?: string;
	detail?: boolean;
}

class SwanLabListProjectsTool implements vscode.LanguageModelTool<IListProjectsParameters> {
	async prepareInvocation(
		options: vscode.LanguageModelToolInvocationPrepareOptions<IListProjectsParameters>,
		_token: vscode.CancellationToken
	) {
		const workspace = options.input.workspace || 'default workspace';
		const confirmationMessages = {
			title: 'List SwanLab Projects',
			message: new vscode.MarkdownString(`Get the list of all projects under the workspace: ${workspace}`)
		};
		return {
			invocationMessage: 'Getting list of SwanLab projects',
			confirmationMessages
		};
	}

	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<IListProjectsParameters>,
		_token: vscode.CancellationToken
	) {
		const { api, errorResult } = createSwanLabApi();
		if (errorResult) {
			return errorResult;
		}

		try {
			// 获取项目列表
			const projects: Project[] = await api.listProjects(
				options.input.workspace,
				options.input.detail !== false // 默认为true
			);

			const projectsJson = JSON.stringify(projects, null, 2);

			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(`SwanLab Projects List:
\`\`\`json
${projectsJson}
\`\`\``)
			]);
		} catch (error) {
			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(`Error retrieving projects: ${error instanceof Error ? error.message : String(error)}`)
			]);
		}
	}
}

// DeleteProject工具的参数接口
interface IDeleteProjectParameters {
	project: string;
	workspace?: string;
	tabGroup?: number;
}

class SwanLabDeleteProjectTool implements vscode.LanguageModelTool<IDeleteProjectParameters> {
	async prepareInvocation(
		options: vscode.LanguageModelToolInvocationPrepareOptions<IDeleteProjectParameters>,
		_token: vscode.CancellationToken
	) {
		const project = options.input.project;
		const workspace = options.input.workspace || 'default workspace';
		const confirmationMessages = {
			title: 'Delete SwanLab Project',
			message: new vscode.MarkdownString(`Delete the project "${project}" in the workspace "${workspace}"`)
		};
		return {
			invocationMessage: `Deleting SwanLab project: ${project}`,
			confirmationMessages
		};
	}

	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<IDeleteProjectParameters>,
		_token: vscode.CancellationToken
	) {
		const { api, errorResult } = createSwanLabApi();
		if (errorResult) {
			return errorResult;
		}

		// 检查必要参数
		if (!options.input.project) {
			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart("Project name is required.")
			]);
		}

		try {
			// 删除项目
			await api.deleteProject(
				options.input.project,
				options.input.workspace
			);

			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(`Successfully deleted project "${options.input.project}"`)
			]);
		} catch (error) {
			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(`Error deleting project: ${error instanceof Error ? error.message : String(error)}`)
			]);
		}
	}
}

// this method is called when your extension is deactivated
export function deactivate() {}