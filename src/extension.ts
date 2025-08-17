// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SwanLabApi, Workspace, Project, Experiment, Summary, MetricsData } from './swanlab-api';

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

// Base class for all SwanLab tools
abstract class SwanLabTool<T> implements vscode.LanguageModelTool<T> {
    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<T>,
        _token: vscode.CancellationToken
    ) {
        return this.prepare(options);
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<T>,
        _token: vscode.CancellationToken
    ) {
        const { api, errorResult } = createSwanLabApi();
        if (errorResult) {
            return errorResult;
        }

        try {
            const result = await this.execute(api, options.input);
            return this.formatResult(result);
        } catch (error) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(this.formatError(error))
            ]);
        }
    }

    protected abstract prepare(options: vscode.LanguageModelToolInvocationPrepareOptions<T>): Promise<{
        invocationMessage: string;
        confirmationMessages: { title: string; message: vscode.MarkdownString };
    }>;

    protected abstract execute(api: SwanLabApi, input: T): Promise<any>;

    protected formatResult(result: any): vscode.LanguageModelToolResult {
        const resultJson = JSON.stringify(result, null, 2);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`\`\`\`json
${resultJson}
\`\`\``)
        ]);
    }

    protected formatError(error: any): string {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // 注册所有SwanLab工具
    context.subscriptions.push(
        vscode.lm.registerTool('LMT4SwanLab-SwanLabListWorkspaces', new SwanLabListWorkspacesTool()),
        vscode.lm.registerTool('LMT4SwanLab-SwanLabListProjects', new SwanLabListProjectsTool()),
        vscode.lm.registerTool('LMT4SwanLab-SwanLabListExperiments', new SwanLabListExperimentsTool()),
        vscode.lm.registerTool('LMT4SwanLab-SwanLabGetExperiment', new SwanLabGetExperimentTool()),
        vscode.lm.registerTool('LMT4SwanLab-SwanLabGetSummary', new SwanLabGetSummaryTool()),
        vscode.lm.registerTool('LMT4SwanLab-SwanLabGetMetrics', new SwanLabGetMetricsTool()),
        vscode.lm.registerTool('LMT4SwanLab-SwanLabDeleteExperiment', new SwanLabDeleteExperimentTool()),
        vscode.lm.registerTool('LMT4SwanLab-SwanLabDeleteProject', new SwanLabDeleteProjectTool())
    );
}

// ListWorkspaces工具的参数接口
interface IListWorkspacesParameters {
    tabGroup?: number;
}

class SwanLabListWorkspacesTool extends SwanLabTool<IListWorkspacesParameters> {
    protected async prepare(_options: vscode.LanguageModelToolInvocationPrepareOptions<IListWorkspacesParameters>) {
        const confirmationMessages = {
            title: 'List SwanLab Workspaces',
            message: new vscode.MarkdownString("Get the list of all workspaces (organizations) of current SwanLab users")
        };
        return {
            invocationMessage: 'Getting list of SwanLab workspaces',
            confirmationMessages
        };
    }

    protected async execute(api: SwanLabApi, _input: IListWorkspacesParameters): Promise<Workspace[]> {
        return await api.listWorkspaces();
    }
}

// ListProjects工具的参数接口
interface IListProjectsParameters {
    workspace?: string;
    detail?: boolean;
    tabGroup?: number;
}

class SwanLabListProjectsTool extends SwanLabTool<IListProjectsParameters> {
    protected async prepare(options: vscode.LanguageModelToolInvocationPrepareOptions<IListProjectsParameters>) {
        return {
            invocationMessage: 'Getting list of SwanLab projects',
            confirmationMessages: {
                title: 'List SwanLab Projects',
                message: new vscode.MarkdownString(`Get the list of all projects under the workspace: ${options.input.workspace || 'default workspace'}`)
            }
        };
    }

    protected async execute(api: SwanLabApi, input: IListProjectsParameters): Promise<Project[]> {
        return await api.listProjects(
            input.workspace,
            input.detail !== false // 默认为true
        );
    }
}

// ListExperiments工具的参数接口
interface IListExperimentsParameters {
    project: string;
    workspace?: string;
    tabGroup?: number;
}

class SwanLabListExperimentsTool extends SwanLabTool<IListExperimentsParameters> {
    protected async prepare(options: vscode.LanguageModelToolInvocationPrepareOptions<IListExperimentsParameters>) {
        return {
            invocationMessage: `Getting list of SwanLab experiments in project: ${options.input.project}`,
            confirmationMessages: {
                title: 'List SwanLab Experiments',
                message: new vscode.MarkdownString(`Get the list of all experiments under the project: ${options.input.project} in the workspace: ${options.input.workspace || 'default workspace'}`)
            }
        };
    }

    protected async execute(api: SwanLabApi, input: IListExperimentsParameters): Promise<Experiment[]> {
        // 检查必要参数
        if (!input.project) {
            throw new Error("Project name is required.");
        }

        return await api.listExperiments(
            input.project,
            input.workspace
        );
    }
}

// GetExperiment工具的参数接口
interface IGetExperimentParameters {
    project: string;
    expId: string;
    workspace?: string;
    tabGroup?: number;
}

class SwanLabGetExperimentTool extends SwanLabTool<IGetExperimentParameters> {
    protected async prepare(options: vscode.LanguageModelToolInvocationPrepareOptions<IGetExperimentParameters>) {
        return {
            invocationMessage: `Getting SwanLab experiment: ${options.input.expId}`,
            confirmationMessages: {
                title: 'Get SwanLab Experiment',
                message: new vscode.MarkdownString(`Get detailed information about experiment "${options.input.expId}" in project "${options.input.project}" in the workspace "${options.input.workspace || 'default workspace'}"`)
            }
        };
    }

    protected async execute(api: SwanLabApi, input: IGetExperimentParameters): Promise<Experiment> {
        // 检查必要参数
        if (!input.project) {
            throw new Error("Project name is required.");
        }

        if (!input.expId) {
            throw new Error("Experiment ID is required.");
        }

        return await api.getExperiment(
            input.project,
            input.expId,
            input.workspace
        );
    }
}

// GetSummary工具的参数接口
interface IGetSummaryParameters {
    project: string;
    expId: string;
    workspace?: string;
    tabGroup?: number;
}

class SwanLabGetSummaryTool extends SwanLabTool<IGetSummaryParameters> {
    protected async prepare(options: vscode.LanguageModelToolInvocationPrepareOptions<IGetSummaryParameters>) {
        return {
            invocationMessage: `Getting SwanLab experiment summary: ${options.input.expId}`,
            confirmationMessages: {
                title: 'Get SwanLab Experiment Summary',
                message: new vscode.MarkdownString(`Get summary information about experiment "${options.input.expId}" in project "${options.input.project}" in the workspace "${options.input.workspace || 'default workspace'}"`)
            }
        };
    }

    protected async execute(api: SwanLabApi, input: IGetSummaryParameters): Promise<Summary> {
        // 检查必要参数
        if (!input.project) {
            throw new Error("Project name is required.");
        }

        if (!input.expId) {
            throw new Error("Experiment ID is required.");
        }

        return await api.getSummary(
            input.project,
            input.expId,
            input.workspace
        );
    }
}

// GetMetrics工具的参数接口
interface IGetMetricsParameters {
    expId: string;
    keys: string | string[];
    tabGroup?: number;
}

class SwanLabGetMetricsTool extends SwanLabTool<IGetMetricsParameters> {
    protected async prepare(options: vscode.LanguageModelToolInvocationPrepareOptions<IGetMetricsParameters>) {
        const expId = options.input.expId;
        const keys = Array.isArray(options.input.keys) ? options.input.keys.join(', ') : options.input.keys;
        const confirmationMessages = {
            title: 'Get SwanLab Experiment Metrics',
            message: new vscode.MarkdownString(`Get metrics data for keys "${keys}" in experiment "${expId}"`)
        };
        return {
            invocationMessage: `Getting SwanLab experiment metrics: ${expId}`,
            confirmationMessages
        };
    }

    protected async execute(api: SwanLabApi, input: IGetMetricsParameters): Promise<MetricsData> {
        // 检查必要参数
        if (!input.expId) {
            throw new Error("Experiment ID is required.");
        }

        if (!input.keys) {
            throw new Error("Metric key(s) are required.");
        }

        return await api.getMetrics(
            input.expId,
            input.keys
        );
    }
}

// DeleteExperiment工具的参数接口
interface IDeleteExperimentParameters {
    project: string;
    expId: string;
    workspace?: string;
    tabGroup?: number;
}

class SwanLabDeleteExperimentTool extends SwanLabTool<IDeleteExperimentParameters> {
    protected async prepare(options: vscode.LanguageModelToolInvocationPrepareOptions<IDeleteExperimentParameters>) {
        return {
            invocationMessage: `Deleting SwanLab experiment: ${options.input.expId}`,
            confirmationMessages: {
                title: 'Delete SwanLab Experiment',
                message: new vscode.MarkdownString(`Delete the experiment "${options.input.expId}" in project "${options.input.project}" in the workspace "${options.input.workspace || 'default workspace'}"`)
            }
        };
    }

    protected async execute(api: SwanLabApi, input: IDeleteExperimentParameters): Promise<string> {
        // 检查必要参数
        if (!input.project) {
            throw new Error("Project name is required.");
        }

        if (!input.expId) {
            throw new Error("Experiment ID is required.");
        }

        await api.deleteExperiment(
            input.project,
            input.expId,
            input.workspace
        );

        return `Successfully deleted experiment "${input.expId}" in project "${input.project}"`;
    }

    protected formatResult(result: string): vscode.LanguageModelToolResult {
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(result)
        ]);
    }
}

// DeleteProject工具的参数接口
interface IDeleteProjectParameters {
    project: string;
    workspace?: string;
    tabGroup?: number;
}

class SwanLabDeleteProjectTool extends SwanLabTool<IDeleteProjectParameters> {
    protected async prepare(options: vscode.LanguageModelToolInvocationPrepareOptions<IDeleteProjectParameters>) {
        return {
            invocationMessage: `Deleting SwanLab project: ${options.input.project}`,
            confirmationMessages: {
                title: 'Delete SwanLab Project',
                message: new vscode.MarkdownString(`Delete the project "${options.input.project}" in the workspace "${options.input.workspace || 'default workspace'}"`)
            }
        };
    }

    protected async execute(api: SwanLabApi, input: IDeleteProjectParameters): Promise<string> {
        // 检查必要参数
        if (!input.project) {
            throw new Error("Project name is required.");
        }

        await api.deleteProject(
            input.project,
            input.workspace
        );

        return `Successfully deleted project "${input.project}"`;
    }

    protected formatResult(result: string): vscode.LanguageModelToolResult {
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(result)
        ]);
    }
}

// this method is called when your extension is deactivated
export function deactivate() {}