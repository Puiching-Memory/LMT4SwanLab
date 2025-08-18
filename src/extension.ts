// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { SwanLabApi, Workspace, Project, Experiment, Summary, MetricsData } from './swanlab-api';

/**
 * Securely store API key using VS Code SecretStorage
 * @param context Extension context
 * @param apiKey API key to store
 */
async function storeApiKey(context: vscode.ExtensionContext, apiKey: string): Promise<void> {
    await context.secrets.store('swanlab.apiKey', apiKey);
}

/**
 * Retrieve securely stored API key
 * @param context Extension context
 * @returns API key or undefined if not stored
 */
async function retrieveApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
    return await context.secrets.get('swanlab.apiKey');
}

/**
 * Delete securely stored API key
 * @param context Extension context
 */
async function deleteApiKey(context: vscode.ExtensionContext): Promise<void> {
    await context.secrets.delete('swanlab.apiKey');
}

/**
 * Create SwanLab API instance
 * @param context Extension context
 * @returns Object containing the API instance or error result
 */
async function createSwanLabApi(context: vscode.ExtensionContext): Promise<{ api: SwanLabApi, errorResult?: vscode.LanguageModelToolResult }> {
    // Try to get API key from secure storage first
    let apiKey = await retrieveApiKey(context);

    if (!apiKey) {
        return {
            api: null as any,
            errorResult: new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(vscode.l10n.t("message.apiKeyNotConfigured")),
                new vscode.LanguageModelTextPart(vscode.l10n.t("message.pleaseSetApiKey"))
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
        const context = (global as any).swanlabContext as vscode.ExtensionContext;
        const { api, errorResult } = await createSwanLabApi(context);
        if (errorResult) {
            // Show a message box with option to set API key
            const selection = await vscode.window.showErrorMessage(
                "SwanLab API key not configured. Please set your API key using the 'SwanLab: Set API Key' command.",
                "SwanLab: Set API Key"
            );

            // If user clicks "Set API Key", execute the command
            if (selection === "SwanLab: Set API Key") {
                await vscode.commands.executeCommand('swanlab.setApiKey');
            }
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
    // Store context for use in tools
    (global as any).swanlabContext = context;

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

    // Register command to securely store API key
    context.subscriptions.push(
        vscode.commands.registerCommand('swanlab.setApiKey', async () => {
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your SwanLab API Key',
                password: true,
                validateInput: (value) => {
                    if (!value) {
                        return 'API Key is required';
                    }
                    return undefined;
                }
            });

            if (apiKey) {
                await storeApiKey(context, apiKey);
                vscode.window.showInformationMessage(vscode.l10n.t('message.apiKeyStored'));
            }
        })
    );

    // Register command to delete API key
    context.subscriptions.push(
        vscode.commands.registerCommand('swanlab.clearApiKey', async () => {
            const apiKey = await retrieveApiKey(context);
            if (!apiKey) {
                vscode.window.showInformationMessage(vscode.l10n.t('message.noApiKeyConfigured'));
                return;
            }

            const confirmation = await vscode.window.showWarningMessage(
                vscode.l10n.t('message.confirmClearApiKey'),
                { modal: true },
                vscode.l10n.t('Yes'),
                vscode.l10n.t('No')
            );

            if (confirmation === vscode.l10n.t('Yes')) {
                await deleteApiKey(context);
                vscode.window.showInformationMessage(vscode.l10n.t('message.apiKeyCleared'));
            }
        })
    );
}

// ==================== Workspace Tools ====================

/**
 * Tool for listing SwanLab workspaces
 */
class SwanLabListWorkspacesTool extends ListTool<Workspace> {
    protected async prepare(_options: vscode.LanguageModelToolInvocationPrepareOptions<any>) {
        return {
            invocationMessage: vscode.l10n.t('List SwanLab Workspaces'),
            confirmationMessages: {
                title: vscode.l10n.t('List SwanLab Workspaces'),
                message: new vscode.MarkdownString(vscode.l10n.t('List all workspaces of the current SwanLab user'))
            }
        };
    }

    protected async execute(api: SwanLabApi, _input: any): Promise<Workspace[]> {
        return await api.listWorkspaces();
    }

    protected formatItem(item: Workspace): string {
        return vscode.l10n.t("format.workspace", item.name);
    }
}

// ==================== Project Tools ====================

/**
 * Tool for listing SwanLab projects
 */
class SwanLabListProjectsTool extends ListTool<Project> {
    protected async prepare(_options: vscode.LanguageModelToolInvocationPrepareOptions<any>) {
        return {
            invocationMessage: vscode.l10n.t('List SwanLab Projects'),
            confirmationMessages: {
                title: vscode.l10n.t('List SwanLab Projects'),
                message: new vscode.MarkdownString(vscode.l10n.t('List all projects in a workspace'))
            }
        };
    }

    protected async execute(api: SwanLabApi, input: any): Promise<Project[]> {
        return await api.listProjects(input.workspace);
    }

    protected formatItem(item: Project): string {
        return vscode.l10n.t("format.project", item.name);
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
        return {
            invocationMessage: vscode.l10n.t('Delete SwanLab Project'),
            confirmationMessages: {
                title: vscode.l10n.t('Delete SwanLab Project'),
                message: new vscode.MarkdownString(vscode.l10n.t('Delete a project'))
            }
        };
    }

    protected async execute(api: SwanLabApi, input: IDeleteProjectParameters): Promise<{ message: string }> {
        await api.deleteProject(input.project, input.workspace);
        return { message: vscode.l10n.t("message.projectDeleted") };
    }
}

// ==================== Experiment Tools ====================

/**
 * Tool for listing SwanLab experiments
 */
class SwanLabListExperimentsTool extends ListTool<Experiment> {
    protected async prepare(_options: vscode.LanguageModelToolInvocationPrepareOptions<any>) {
        return {
            invocationMessage: vscode.l10n.t('List SwanLab Experiments'),
            confirmationMessages: {
                title: vscode.l10n.t('List SwanLab Experiments'),
                message: new vscode.MarkdownString(vscode.l10n.t('List all experiments in a project'))
            }
        };
    }

    protected async execute(api: SwanLabApi, input: any): Promise<Experiment[]> {
        return await api.listExperiments(input.project, input.workspace);
    }

    protected formatItem(item: Experiment): string {
        return vscode.l10n.t("format.experiment", item.name);
    }
}

// ==================== Get Experiment Tools ====================

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
        return {
            invocationMessage: vscode.l10n.t('Get SwanLab Experiment'),
            confirmationMessages: {
                title: vscode.l10n.t('Get SwanLab Experiment'),
                message: new vscode.MarkdownString(vscode.l10n.t('Get detailed information about an experiment'))
            }
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
        return {
            invocationMessage: vscode.l10n.t('Get SwanLab Summary'),
            confirmationMessages: {
                title: vscode.l10n.t('Get SwanLab Summary'),
                message: new vscode.MarkdownString(vscode.l10n.t('Get summary information of an experiment'))
            }
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
        return {
            invocationMessage: vscode.l10n.t('Get SwanLab Metrics'),
            confirmationMessages: {
                title: vscode.l10n.t('Get SwanLab Metrics'),
                message: new vscode.MarkdownString(vscode.l10n.t('Get metrics data of an experiment'))
            }
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
        return {
            invocationMessage: vscode.l10n.t('Delete SwanLab Experiment'),
            confirmationMessages: {
                title: vscode.l10n.t('Delete SwanLab Experiment'),
                message: new vscode.MarkdownString(vscode.l10n.t('Delete an experiment'))
            }
        };
    }

    protected async execute(api: SwanLabApi, input: IDeleteExperimentParameters): Promise<{ message: string }> {
        await api.deleteExperiment(input.project, input.expId, input.workspace);
        return { message: vscode.l10n.t("message.experimentDeleted") };
    }
}

/**
 * Deactivate the extension
 */
export function deactivate() { }