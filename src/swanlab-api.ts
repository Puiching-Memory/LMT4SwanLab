import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosResponse, AxiosError, AxiosHeaders } from 'axios';

/**
 * Handle Axios errors and convert them to more user-friendly errors
 * @param error - The error object
 * @returns never (always throws an error)
 */
function handleAxiosError(error: any): never {
    if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401) {
            throw new Error(vscode.l10n.t('Authentication failed. Please check your API key.'));
        }
        if (status === 403) {
            throw new Error(vscode.l10n.t('You need to be verified first'));
        }
        if (status) {
            throw new Error(vscode.l10n.t('{0} {1}', status, error.response?.statusText || 'Unknown error'));
        }
        throw new Error(vscode.l10n.t('Network error: {0}', error.message));
    }
    throw new Error(vscode.l10n.t('Unexpected error: {0}', error instanceof Error ? error.message : String(error)));
}

/**
 * Handle API response and check for errors
 * @param response - The Axios response object
 * @returns The data from the response
 */
function handleApiResponse<T>(response: AxiosResponse<ApiResponse<T>>): T {
    if (response.data.errmsg) {
        throw new Error(response.data.errmsg);
// No change needed here as the error message comes from the API
    }

    if (response.data.code < 200 || response.data.code >= 300) {
        const traceId = response.headers['traceid'] || 'unknown';
        throw new Error(vscode.l10n.t('API error: {0}. Trace id: {1}', response.statusText, traceId));
    }

    return response.data.data;
}

/**
 * Generic API response structure
 */
interface ApiResponse<T> {
    code: number;
    errmsg: string;
    data: T;
}

/**
 * Workspace information structure
 */
export interface Workspace {
    name: string;
    username: string;
    role: string;
}

/**
 * Project information structure
 */
export interface Project {
    cuid: string;
    name: string;
    description: string;
    visibility: string;
    createdAt: string;
    updatedAt: string;
    group: {
        type: string;
        username: string;
        name: string;
    };
    count?: {
        experiments: number;
        contributors: number;
        children: number;
        collaborators: number;
        runningExps: number;
    };
}

/**
 * Experiment information structure
 */
export interface Experiment {
    cuid: string;
    name: string;
    description: string;
    state: string;
    show: boolean;
    createdAt: string;
    finishedAt: string | null;
    user: {
        username: string;
        name: string;
        avatar?: string;
    };
    profile: {
        config: any;
        metadata: any;
        requirements?: string;
        conda?: string | null;
    };
    type: string;
    colors: string[];
    labels: string[];
    tags: string[];
    sectionIndex: Array<{
        id: string;
        name: string;
        index: number;
    }>;
    cloneType: string | null;
    rootExpId: string | null;
    rootProId: string | null;
}

/**
 * Summary information structure for experiments
 */
export interface Summary {
    [key: string]: {
        step: number;
        value: number;
        min: {
            step: number;
            value: number;
        };
        max: {
            step: number;
            value: number;
        };
    };
}

/**
 * Metric data structure
 */
export interface Metric {
    [key: string]: number | null;
}

/**
 * Metrics data structure
 */
export interface MetricsData {
    [key: string]: Metric[];
}

/**
 * Group list response structure
 */
interface GroupListResponse {
    list: Array<{
        name: string;
        username: string;
        role: string;
    }>;
    total: number;
}

/**
 * Project list response structure
 */
interface ProjectListResponse {
    size: number;
    total: number;
    pages: number;
    list: Array<{
        cuid: string;
        name: string;
        description: string;
        visibility: string;
        createdAt: string;
        updatedAt: string;
        group: {
            type: string;
            username: string;
            name: string;
        };
        _count?: {
            experiments: number;
            contributors: number;
            children: number;
            collaborators: number;
            runningExps: number;
        };
    }>;
}

/**
 * Experiment list response structure
 */
interface ExperimentListResponse {
    size: number;
    total: number;
    pages: number;
    list: Experiment[];
}

/**
 * Delete project response structure
 */
interface DeleteProjectResponse {
    message: string;
}

/**
 * Login response data structure
 */
interface LoginResponseData {
    sid: string;
    expiredAt: string;
    userInfo: {
        username: string;
    };
}

/**
 * Login information structure
 */
interface LoginInfo {
    sid: string | null;
    expiredAt: string | null;
    username: string | null;
    apiHost: string;
    webHost: string;
    apiKey: string | null;
}

/**
 * SwanLab API client for interacting with the SwanLab backend
 */
export class SwanLabApi {
    private axiosInstance: AxiosInstance;
    private loginInfo: LoginInfo | null = null;
    private apiKey: string;
    private isLoggingIn: boolean = false;

    /**
     * Create a new SwanLab API client
     * @param apiKey - The API key for authentication
     */
    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.axiosInstance = axios.create({
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Add response interceptor for error handling
        this.axiosInstance.interceptors.response.use(
            (response: AxiosResponse) => response,
            async (error: AxiosError) => {
                // If we get a 401 and we're not already logging in, try to login again
                if (error.response?.status === 401 && !this.isLoggingIn) {
                    try {
                        await this.login();
                        // Retry the original request with new authentication
                        if (error.config) {
                            const config = {...error.config};
                            if (!config.headers) {
                                config.headers = new AxiosHeaders();
                            }
                            config.headers.set('Cookie', `sid=${this.loginInfo?.sid}`);
                            return this.axiosInstance.request(config);
                        }
                    } catch (loginError) {
                        // If login fails, throw the original error
                        throw handleAxiosError(error);
                    }
                }
                throw handleAxiosError(error);
            }
        );
    }

    // ==================== Login Methods ====================

    /**
     * Authenticate user with API key
     * Corresponds to login_by_key method in Python SDK
     */
    async login(): Promise<void> {
        // Prevent multiple simultaneous login attempts
        if (this.isLoggingIn) {
            // Wait a bit and then return
            await new Promise(resolve => setTimeout(resolve, 1000));
            return;
        }

        this.isLoggingIn = true;
        try {
            const response: AxiosResponse<LoginResponseData> = await this.axiosInstance.post(
                'https://api.swanlab.cn/api/login/api_key',
                {},
                {
                    headers: {
                        'authorization': this.apiKey
                    }
                }
            );

            if (response.status !== 200) {
                throw new Error(vscode.l10n.t('Login failed with status {0}: {1}', response.status, response.statusText));
            }

            this.loginInfo = {
                sid: response.data.sid,
                expiredAt: response.data.expiredAt,
                username: response.data.userInfo?.username,
                apiHost: 'https://api.swanlab.cn/api',
                webHost: 'https://swanlab.cn',
                apiKey: this.apiKey
            };

            // Set authentication headers
            this.axiosInstance.defaults.headers.common['Cookie'] = `sid=${response.data.sid}`;
            this.axiosInstance.defaults.baseURL = this.loginInfo.apiHost;
        } catch (error) {
            throw handleAxiosError(error);
        } finally {
            this.isLoggingIn = false;
        }
    }

    // ==================== Workspace Methods ====================

    /**
     * Get list of workspaces
     * @returns Array of workspace objects
     */
    async listWorkspaces(): Promise<Workspace[]> {
        if (!this.loginInfo) {
            await this.login();
        }

        try {
            const response: AxiosResponse<ApiResponse<GroupListResponse>> = await this.axiosInstance.get('/group/');
            const groups = handleApiResponse(response).list || [];
            return groups.map(item => ({
                name: item.name,
                username: item.username,
                role: item.role
            }));
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(vscode.l10n.t('Network error: {0}', error.message));
            }
            throw new Error(vscode.l10n.t('Failed to list workspaces: {0}', error instanceof Error ? error.message : String(error)));
        }
    }

    // ==================== Project Methods ====================

    /**
     * Get list of projects
     * Corresponds to OpenApi.list_projects method in Python SDK
     * @param username - Username or workspace name (optional)
     * @param detail - Whether to include detailed information (default: true)
     * @returns Array of project objects
     */
    async listProjects(username: string = "", detail: boolean = true): Promise<Project[]> {
        if (!this.loginInfo) {
            await this.login();
        }

        try {
            const allProjects: Project[] = [];
            let page = 1;
            const size = 10;

            const targetUsername = username || this.loginInfo!.username || "";

            while (true) {
                const response: AxiosResponse<ProjectListResponse> = await this.axiosInstance.get(
                    `/project/${targetUsername}`,
                    {
                        params: {
                            detail: detail,
                            page: page,
                            size: size
                        }
                    }
                );

                const projects = response.data?.list || [];

                const parsedProjects = projects.map(item => ({
                    cuid: item.cuid || "",
                    name: item.name || "",
                    description: item.description || "",
                    visibility: item.visibility || "",
                    createdAt: item.createdAt || "",
                    updatedAt: item.updatedAt || "",
                    group: {
                        type: item.group?.type || "",
                        username: item.group?.username || "",
                        name: item.group?.name || ""
                    },
                    count: item._count ? {
                        experiments: item._count.experiments || 0,
                        contributors: item._count.contributors || 0,
                        children: item._count.children || 0,
                        collaborators: item._count.collaborators || 0,
                        runningExps: item._count.runningExps || 0
                    } : undefined
                }));

                allProjects.push(...parsedProjects);

                const total = response.data?.total || 0;

                if (projects.length === 0 || allProjects.length >= total) {
                    break;
                }

                page++;
            }

            return allProjects;
        } catch (error) {
            throw handleAxiosError(error);
        }
    }

    /**
     * Delete a project
     * Corresponds to OpenApi.delete_project method in Python SDK
     * @param project - Project name
     * @param username - Username or workspace name (optional)
     */
    async deleteProject(project: string, username?: string): Promise<void> {
        if (!this.loginInfo) {
            await this.login();
        }

        try {
            // If username is not provided, use the logged in user's username
            const targetUsername = username || this.loginInfo!.username || "";
            const url = `/project/${targetUsername}/${project}`;

            const response: AxiosResponse<ApiResponse<DeleteProjectResponse>> = await this.axiosInstance.delete(url);
            handleApiResponse(response);
        } catch (error) {
            throw handleAxiosError(error);
        }
    }

    // ==================== Experiment Methods ====================

    /**
     * Get list of experiments in a project
     * Corresponds to OpenApi.list_experiments method in Python SDK
     * @param project - Project name
     * @param username - Username or workspace name (optional)
     * @returns Array of experiment objects
     */
    async listExperiments(project: string, username?: string): Promise<Experiment[]> {
        if (!this.loginInfo) {
            await this.login();
        }

        try {
            // If username is not provided, use the logged in user's username
            const targetUsername = username || this.loginInfo!.username || "";
            // According to Python SDK, the correct path should be /project/{username}/{project}/runs
            const url = `/project/${targetUsername}/${project}/runs`;

            const allExperiments: Experiment[] = [];
            let page = 1;
            const size = 10;

            while (true) {
                const response: AxiosResponse<ExperimentListResponse> = await this.axiosInstance.get(
                    url,
                    {
                        params: {
                            page: page,
                            size: size
                        }
                    }
                );

                const responseData = response.data;
                const experiments = responseData?.list || [];

                allExperiments.push(...experiments);

                const total = responseData?.total || 0;

                if (experiments.length === 0 || allExperiments.length >= total) {
                    break;
                }

                page++;
            }

            return allExperiments;
        } catch (error) {
            throw handleAxiosError(error);
        }
    }

    /**
     * Get detailed information about an experiment
     * Corresponds to OpenApi.get_experiment method in Python SDK
     * @param project - Project name
     * @param expId - Experiment CUID
     * @param username - Username or workspace name (optional)
     * @returns Experiment object
     */
    async getExperiment(project: string, expId: string, username?: string): Promise<Experiment> {
        if (!this.loginInfo) {
            await this.login();
        }

        try {
            // If username is not provided, use the logged in user's username
            const targetUsername = username || this.loginInfo!.username || "";
            // According to Python SDK, the correct path should be /project/{username}/{project}/runs/{exp_id}
            const url = `/project/${targetUsername}/${project}/runs/${expId}`;

            const response: AxiosResponse<any> = await this.axiosInstance.get(url);

            // Check if response data exists
            if (!response.data) {
                throw new Error('Empty response data received from API');
            }

            const data = response.data;
            return {
                cuid: data.cuid ?? "",
                name: data.name ?? "",
                description: data.description ?? "",
                state: data.state ?? "",
                show: Boolean(data.show),
                createdAt: data.createdAt ?? "",
                finishedAt: data.finishedAt ?? null,
                user: {
                    username: data.user?.username ?? "",
                    name: data.user?.name ?? "",
                    avatar: data.user?.avatar ?? undefined
                },
                profile: {
                    config: data.profile?.config ?? {},
                    metadata: data.profile?.metadata ?? {},
                    requirements: data.profile?.requirements ?? undefined,
                    conda: data.profile?.conda ?? null
                },
                type: data.type ?? "",
                colors: Array.isArray(data.colors) ? data.colors : [],
                labels: Array.isArray(data.labels) ? data.labels : [],
                tags: Array.isArray(data.tags) ? data.tags : [],
                sectionIndex: Array.isArray(data.sectionIndex) ? data.sectionIndex : [],
                cloneType: data.cloneType ?? null,
                rootExpId: data.rootExpId ?? null,
                rootProId: data.rootProId ?? null
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(vscode.l10n.t('Network error: {0}', error.message));
            }
            throw new Error(vscode.l10n.t('Failed to get experiment: {0}', error instanceof Error ? error.message : String(error)));
        }
    }

    /**
     * Get summary information for an experiment
     * Corresponds to OpenApi.get_summary method in Python SDK
     * @param project - Project name
     * @param expId - Experiment CUID
     * @param username - Username or workspace name (optional)
     * @returns Summary object
     */
    async getSummary(project: string, expId: string, username?: string): Promise<Summary> {
        if (!this.loginInfo) {
            await this.login();
        }

        try {
            // If username is not provided, use the logged in user's username
            const targetUsername = username || this.loginInfo!.username || "";

            // First get project information to get project CUID
            const projectUrl = `/project/${targetUsername}/${project}`;
            const projectResponse: AxiosResponse<any> = await this.axiosInstance.get(projectUrl);

            if (!projectResponse.data) {
                throw new Error('Failed to get project information');
            }

            const projectCuid = projectResponse.data.cuid || "";

            // Get experiment information to get rootExpId and rootProId
            const expUrl = `/project/${targetUsername}/${project}/runs/${expId}`;
            const expResponse: AxiosResponse<any> = await this.axiosInstance.get(expUrl);

            if (!expResponse.data) {
                throw new Error('Failed to get experiment information');
            }

            const rootExpId = expResponse.data.rootExpId || "";
            const rootProId = expResponse.data.rootProId || "";

            // Construct request data
            const requestData = {
                experimentId: expId,
                projectId: projectCuid,
            };

            // If it's a cloned experiment, add extra parameters
            if (rootExpId && rootProId) {
                Object.assign(requestData, {
                    rootExperimentId: rootExpId,
                    rootProjectId: rootProId
                });
            }

            // Send request to get summary data
            const summaryResponse: AxiosResponse<any> = await this.axiosInstance.post(
                "/house/metrics/summaries",
                [requestData],
                { params: {} }
            );
            
            const data = handleApiResponse(summaryResponse);

            const firstDataKey = Object.keys(summaryResponse.data)[0];
            const rawData = summaryResponse.data[firstDataKey];

            return Object.entries(rawData).reduce<Summary>((summary, [key, value]) => {
                summary[key] = {
                    step: (value as any).step,
                    value: (value as any).value,
                    min: {
                        step: (value as any).min?.index,
                        value: (value as any).min?.data,
                    },
                    max: {
                        step: (value as any).max?.index,
                        value: (value as any).max?.data,
                    }
                };
                return summary;
            }, {});
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Network error: ${error.message}`);
            }
            throw new Error(vscode.l10n.t('Failed to get experiment summary: {0}', error instanceof Error ? error.message : String(error)));
        }
    }

    /**
     * Get metrics data for an experiment
     * Corresponds to OpenApi.get_metrics method in Python SDK
     * @param expId - Experiment CUID
     * @param keys - Metric key(s), single string or array of strings
     * @returns Metrics data object
     */
    async getMetrics(expId: string, keys: string | string[]): Promise<MetricsData> {
        if (!this.loginInfo) {
            await this.login();
        }

        try {
            // Ensure keys is an array
            const keysArray = Array.isArray(keys) ? keys : [keys];
            
            // Deduplicate keys
            const uniqueKeys = [...new Set(keysArray)];
            
            const metricsData: MetricsData = {};
            
            // Get data for each key
            for (const key of uniqueKeys) {
                try {
                    const response: AxiosResponse<any> = await this.axiosInstance.get(
                        `/experiment/${expId}/column/csv`,
                        {
                            params: { key }
                        }
                    );
                    
                    // Check if response exists and has data
                    if (!response || !response.data) {
                        console.warn(vscode.l10n.t('Empty response for key {0}', key));
                        continue;
                    }
                    
                    // Check for error messages
                    if (response.data.errmsg) {
                        console.warn(vscode.l10n.t('Error getting metrics for key {0}: {1}', key, response.data.errmsg));
                        continue;
                    }
                    
                    // Get URL from actual API response structure
                    // Actual response structure: { url: '...' }
                    const url = response.data.url;
                    
                    if (!url) {
                        console.warn(vscode.l10n.t('No URL found for key {0}. Response structure: {1}', key, JSON.stringify(response.data, null, 2)));
                        continue;
                    }
                    
                    // Get CSV data
                    const csvResponse = await axios.get(url);
                    const csvData = csvResponse.data;
                    
                    // Simple CSV parsing
                    const lines = csvData.trim().split('\n');
                    if (lines.length < 2) {
                        console.warn(vscode.l10n.t('Invalid CSV data for key {0}', key));
                        continue;
                    }
                    
                    // Parse headers
                    const headers = lines[0].split(',').map((h: string) => h.trim());
                    
                    // Parse data rows
                    const dataRows: Metric[] = [];
                    for (let i = 1; i < lines.length; i++) {
                        const values = lines[i].split(',').map((v: string) => v.trim());
                        const row: Metric = {};
                        
                        for (let j = 0; j < headers.length; j++) {
                            const header = headers[j];
                            const value = values[j];
                            
                            // Try to convert to number, if failed keep as string
                            row[header] = (value === '' || value === 'null' || value === 'undefined') 
                                ? null 
                                : isNaN(Number(value)) ? value : Number(value);
                        }
                        
                        dataRows.push(row);
                    }
                    
                    metricsData[key] = dataRows;
                } catch (error) {
                    console.warn(vscode.l10n.t('Error processing metrics for key {0}: {1}', key, error instanceof Error ? error.message : String(error)));
                    continue;
                }
            }
            
            return metricsData;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Network error: ${error.message}`);
            }
            throw new Error(`Failed to get experiment metrics: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Delete an experiment
     * Corresponds to OpenApi.delete_experiment method in Python SDK
     * @param project - Project name
     * @param expId - Experiment CUID
     * @param username - Username or workspace name (optional)
     */
    async deleteExperiment(project: string, expId: string, username?: string): Promise<void> {
        if (!this.loginInfo) {
            await this.login();
        }

        try {
            // If username is not provided, use the logged in user's username
            const targetUsername = username || this.loginInfo!.username || "";
            
            // According to Python SDK, the correct path should be /project/{username}/{project}/runs/{exp_id}
            const url = `/project/${targetUsername}/${project}/runs/${expId}`;

            const response: AxiosResponse<any> = await this.axiosInstance.delete(url);
            handleApiResponse(response);
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Network error: ${error.message}`);
            }
            throw new Error(vscode.l10n.t('Failed to delete experiment: {0}', error instanceof Error ? error.message : String(error)));
        }
    }
}