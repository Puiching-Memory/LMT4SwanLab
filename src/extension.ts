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
                new vscode.LanguageModelTextPart(vscode.l10n.t("SwanLab API key not configured. Please set 'swanlab.apiKey' in your settings."))
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
        return vscode.l10n.t("Error: {0}", error instanceof Error ? error.message : String(error));
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
            title: vscode.l10n.t('List SwanLab Workspaces'),
            message: new vscode.MarkdownString(vscode.l10n.t('List all workspaces of the current SwanLab user'))
        };

        return {
            invocationMessage: vscode.l10n.t('List SwanLab Workspaces'),
            confirmationMessages
        };
    }

    protected async execute(api: SwanLabApi, _input: IListWorkspacesParameters): Promise<Workspace[]> {
        return await api.listWorkspaces();
    }

    protected formatResult(result: Workspace[]): vscode.LanguageModelToolResult {
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\``),
            new vscode.LanguageModelTextPart('\n\n' + result.map(w => vscode.l10n.t("Workspace: {0}", w.name)).join('\n'))
        ]);
    }
}

// ListProjects工具的参数接口
interface IListProjectsParameters {
    workspace?: string;
}

class SwanLabListProjectsTool extends SwanLabTool<IListProjectsParameters> {
    protected async prepare(_options: vscode.LanguageModelToolInvocationPrepareOptions<IListProjectsParameters>) {
        const confirmationMessages = {
            title: vscode.l10n.t('List SwanLab Projects'),
            message: new vscode.MarkdownString(vscode.l10n.t('List all projects in a workspace'))
        };

        return {
            invocationMessage: vscode.l10n.t('List SwanLab Projects'),
            confirmationMessages
        };
    }

    protected async execute(api: SwanLabApi, input: IListProjectsParameters): Promise<Project[]> {
        return await api.listProjects(input.workspace);
    }

    protected formatResult(result: Project[]): vscode.LanguageModelToolResult {
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\``),
            new vscode.LanguageModelTextPart('\n\n' + result.map(p => vscode.l10n.t("Project: {0}", p.name)).join('\n'))
        ]);
    }
}

// ListExperiments工具的参数接口
interface IListExperimentsParameters {
    project: string;
    workspace?: string;
}

class SwanLabListExperimentsTool extends SwanLabTool<IListExperimentsParameters> {
    protected async prepare(_options: vscode.LanguageModelToolInvocationPrepareOptions<IListExperimentsParameters>) {
        const confirmationMessages = {
            title: vscode.l10n.t('List SwanLab Experiments'),
            message: new vscode.MarkdownString(vscode.l10n.t('List all experiments in a project'))
        };

        return {
            invocationMessage: vscode.l10n.t('List SwanLab Experiments'),
            confirmationMessages
        };
    }

    protected async execute(api: SwanLabApi, input: IListExperimentsParameters): Promise<Experiment[]> {
        return await api.listExperiments(input.project, input.workspace);
    }

    protected formatResult(result: Experiment[]): vscode.LanguageModelToolResult {
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\``),
            new vscode.LanguageModelTextPart('\n\n' + result.map(e => vscode.l10n.t("Experiment: {0}", e.name)).join('\n'))
        ]);
    }
}

// GetExperiment工具的参数接口
interface IGetExperimentParameters {
    project: string;
    expId: string;
    workspace?: string;
}

class SwanLabGetExperimentTool extends SwanLabTool<IGetExperimentParameters> {
    protected async prepare(_options: vscode.LanguageModelToolInvocationPrepareOptions<IGetExperimentParameters>) {
        const confirmationMessages = {
            title: vscode.l10n.t('Get SwanLab Experiment'),
            message: new vscode.MarkdownString(vscode.l10n.t('Get detailed information about an experiment'))
        };

        return {
            invocationMessage: vscode.l10n.t('Get SwanLab Experiment'),
            confirmationMessages
        };
    }

    protected async execute(api: SwanLabApi, input: IGetExperimentParameters): Promise<Experiment> {
        return await api.getExperiment(input.project, input.expId, input.workspace);
    }
}

// GetSummary工具的参数接口
interface IGetSummaryParameters {
    project: string;
    expId: string;
    workspace?: string;
}

class SwanLabGetSummaryTool extends SwanLabTool<IGetSummaryParameters> {
    protected async prepare(_options: vscode.LanguageModelToolInvocationPrepareOptions<IGetSummaryParameters>) {
        const confirmationMessages = {
            title: vscode.l10n.t('Get SwanLab Summary'),
            message: new vscode.MarkdownString(vscode.l10n.t('Get summary information of an experiment'))
        };

        return {
            invocationMessage: vscode.l10n.t('Get SwanLab Summary'),
            confirmationMessages
        };
    }

    protected async execute(api: SwanLabApi, input: IGetSummaryParameters): Promise<Summary> {
        return await api.getSummary(input.project, input.expId, input.workspace);
    }
}

// GetMetrics工具的参数接口
interface IGetMetricsParameters {
    expId: string;
    keys: string | string[];
}

class SwanLabGetMetricsTool extends SwanLabTool<IGetMetricsParameters> {
    protected async prepare(_options: vscode.LanguageModelToolInvocationPrepareOptions<IGetMetricsParameters>) {
        const confirmationMessages = {
            title: vscode.l10n.t('Get SwanLab Metrics'),
            message: new vscode.MarkdownString(vscode.l10n.t('Get metrics data of an experiment'))
        };

        return {
            invocationMessage: vscode.l10n.t('Get SwanLab Metrics'),
            confirmationMessages
        };
    }

    protected async execute(api: SwanLabApi, input: IGetMetricsParameters): Promise<MetricsData> {
        return await api.getMetrics(input.expId, input.keys);
    }
}

// DeleteExperiment工具的参数接口
interface IDeleteExperimentParameters {
    project: string;
    expId: string;
    workspace?: string;
}

class SwanLabDeleteExperimentTool extends SwanLabTool<IDeleteExperimentParameters> {
    protected async prepare(_options: vscode.LanguageModelToolInvocationPrepareOptions<IDeleteExperimentParameters>) {
        const confirmationMessages = {
            title: vscode.l10n.t('Delete SwanLab Experiment'),
            message: new vscode.MarkdownString(vscode.l10n.t('Delete an experiment'))
        };

        return {
            invocationMessage: vscode.l10n.t('Delete SwanLab Experiment'),
            confirmationMessages
        };
    }

    protected async execute(api: SwanLabApi, input: IDeleteExperimentParameters): Promise<{ message: string }> {
        await api.deleteExperiment(input.project, input.expId, input.workspace);
        return { message: "Experiment deleted successfully" };
    }
}

// DeleteProject工具的参数接口
interface IDeleteProjectParameters {
    project: string;
    workspace?: string;
}

class SwanLabDeleteProjectTool extends SwanLabTool<IDeleteProjectParameters> {
    protected async prepare(_options: vscode.LanguageModelToolInvocationPrepareOptions<IDeleteProjectParameters>) {
        const confirmationMessages = {
            title: vscode.l10n.t('Delete SwanLab Project'),
            message: new vscode.MarkdownString(vscode.l10n.t('Delete a project'))
        };

        return {
            invocationMessage: vscode.l10n.t('Delete SwanLab Project'),
            confirmationMessages
        };
    }

    protected async execute(api: SwanLabApi, input: IDeleteProjectParameters): Promise<{ message: string }> {
        await api.deleteProject(input.project, input.workspace);
        return { message: "Project deleted successfully" };
    }
}

// this method is called when your extension is deactivated
export function deactivate() { }