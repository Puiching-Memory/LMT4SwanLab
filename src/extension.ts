// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SwanLabApi, Workspace, Project, Experiment, Summary, MetricsData } from './swanlab-api';

/**
 * Get API key from VS Code configuration
 * @returns API key or undefined if not configured
 */
function getApiKey(): string | undefined {
    const config = vscode.workspace.getConfiguration('swanlab');
    return config.get<string>('apiKey');
}

/**
 * Create SwanLab API instance
 * @returns Object containing the API instance or error result
 */
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

/**
 * Base class for all SwanLab tools
 */
abstract class SwanLabTool<T> implements vscode.LanguageModelTool<T> {
    /**
     * Prepare tool invocation
     * @param options - Invocation preparation options
     * @param _token - Cancellation token
     * @returns Preparation result
     */
    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<T>,
        _token: vscode.CancellationToken
    ) {
        return this.prepare(options);
    }

    /**
     * Invoke the tool
     * @param options - Invocation options
     * @param _token - Cancellation token
     * @returns Tool result
     */
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

    /**
     * Prepare tool invocation
     * @param options - Invocation preparation options
     * @returns Preparation result
     */
    protected abstract prepare(options: vscode.LanguageModelToolInvocationPrepareOptions<T>): Promise<{
        invocationMessage: string;
        confirmationMessages: { title: string; message: vscode.MarkdownString };
    }>;

    /**
     * Execute the tool
     * @param api - SwanLab API instance
     * @param input - Tool input parameters
     * @returns Execution result
     */
    protected abstract execute(api: SwanLabApi, input: T): Promise<any>;

    /**
     * Format tool result
     * @param result - Raw result data
     * @returns Formatted tool result
     */
    protected formatResult(result: any): vscode.LanguageModelToolResult {
        const resultJson = JSON.stringify(result, null, 2);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`\`\`\`json
${resultJson}
\`\`\``)
        ]);
    }

    /**
     * Format error message
     * @param error - Error object
     * @returns Formatted error message
     */
    protected formatError(error: any): string {
        return vscode.l10n.t("Error: {0}", error instanceof Error ? error.message : String(error));
    }
}

/**
 * Base class for list tools that display items with names
 */
abstract class ListTool<T> extends SwanLabTool<any> {
    protected formatResult(result: T[]): vscode.LanguageModelToolResult {
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\``),
            new vscode.LanguageModelTextPart('\n\n' + result.map(item => this.formatItem(item)).join('\n'))
        ]);
    }
    
    protected abstract formatItem(item: T): string;
}

/**
 * Activate the extension
 * @param context - Extension context
 */
export function activate(context: vscode.ExtensionContext) {
    // Register all SwanLab tools
    context.subscriptions.push(
        // Workspace tools
        vscode.lm.registerTool('LMT4SwanLab-SwanLabListWorkspaces', new SwanLabListWorkspacesTool()),
        
        // Project tools
        vscode.lm.registerTool('LMT4SwanLab-SwanLabListProjects', new SwanLabListProjectsTool()),
        vscode.lm.registerTool('LMT4SwanLab-SwanLabDeleteProject', new SwanLabDeleteProjectTool()),
        
        // Experiment tools
        vscode.lm.registerTool('LMT4SwanLab-SwanLabListExperiments', new SwanLabListExperimentsTool()),
        vscode.lm.registerTool('LMT4SwanLab-SwanLabGetExperiment', new SwanLabGetExperimentTool()),
        vscode.lm.registerTool('LMT4SwanLab-SwanLabGetSummary', new SwanLabGetSummaryTool()),
        vscode.lm.registerTool('LMT4SwanLab-SwanLabGetMetrics', new SwanLabGetMetricsTool()),
        vscode.lm.registerTool('LMT4SwanLab-SwanLabDeleteExperiment', new SwanLabDeleteExperimentTool())
    );
}

// ==================== Workspace Tools ====================

/**
 * Tool for listing SwanLab workspaces
 */
class SwanLabListWorkspacesTool extends ListTool<Workspace> {
    protected async prepare(_options: vscode.LanguageModelToolInvocationPrepareOptions<any>) {
        const confirmationMessages = {
            title: vscode.l10n.t('List SwanLab Workspaces'),
            message: new vscode.MarkdownString(vscode.l10n.t('List all workspaces of the current SwanLab user'))
        };

        return {
            invocationMessage: vscode.l10n.t('List SwanLab Workspaces'),
            confirmationMessages
        };
    }

    protected async execute(api: SwanLabApi, _input: any): Promise<Workspace[]> {
        return await api.listWorkspaces();
    }

    protected formatItem(item: Workspace): string {
        return vscode.l10n.t("Workspace: {0}", item.name);
    }
}

// ==================== Project Tools ====================

/**
 * Tool for listing SwanLab projects
 */
class SwanLabListProjectsTool extends ListTool<Project> {
    protected async prepare(_options: vscode.LanguageModelToolInvocationPrepareOptions<any>) {
        const confirmationMessages = {
            title: vscode.l10n.t('List SwanLab Projects'),
            message: new vscode.MarkdownString(vscode.l10n.t('List all projects in a workspace'))
        };

        return {
            invocationMessage: vscode.l10n.t('List SwanLab Projects'),
            confirmationMessages
        };
    }

    protected async execute(api: SwanLabApi, input: any): Promise<Project[]> {
        return await api.listProjects(input.workspace);
    }

    protected formatItem(item: Project): string {
        return vscode.l10n.t("Project: {0}", item.name);
    }
}

/**
 * Parameters for DeleteProject tool
 */
interface IDeleteProjectParameters {
    project: string;
    workspace?: string;
}

/**
 * Tool for deleting a SwanLab project
 */
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

// ==================== Experiment Tools ====================

/**
 * Tool for listing SwanLab experiments
 */
class SwanLabListExperimentsTool extends ListTool<Experiment> {
    protected async prepare(_options: vscode.LanguageModelToolInvocationPrepareOptions<any>) {
        const confirmationMessages = {
            title: vscode.l10n.t('List SwanLab Experiments'),
            message: new vscode.MarkdownString(vscode.l10n.t('List all experiments in a project'))
        };

        return {
            invocationMessage: vscode.l10n.t('List SwanLab Experiments'),
            confirmationMessages
        };
    }

    protected async execute(api: SwanLabApi, input: any): Promise<Experiment[]> {
        return await api.listExperiments(input.project, input.workspace);
    }

    protected formatItem(item: Experiment): string {
        return vscode.l10n.t("Experiment: {0}", item.name);
    }
}

/**
 * Parameters for GetExperiment tool
 */
interface IGetExperimentParameters {
    project: string;
    expId: string;
    workspace?: string;
}

/**
 * Tool for getting detailed information about a SwanLab experiment
 */
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

/**
 * Parameters for GetSummary tool
 */
interface IGetSummaryParameters {
    project: string;
    expId: string;
    workspace?: string;
}

/**
 * Tool for getting summary information of a SwanLab experiment
 */
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

/**
 * Parameters for GetMetrics tool
 */
interface IGetMetricsParameters {
    expId: string;
    keys: string | string[];
}

/**
 * Tool for getting metrics data of a SwanLab experiment
 */
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

/**
 * Parameters for DeleteExperiment tool
 */
interface IDeleteExperimentParameters {
    project: string;
    expId: string;
    workspace?: string;
}

/**
 * Tool for deleting a SwanLab experiment
 */
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

/**
 * Deactivate the extension
 */
export function deactivate() { }