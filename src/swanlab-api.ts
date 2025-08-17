import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';

// Utility functions for error handling
function handleAxiosError(error: any): never {
    if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401) {
            throw new Error('Authentication failed. Please check your API key.');
        }
        if (status === 403) {
            throw new Error('You need to be verified first');
        }
        if (status) {
            throw new Error(`${status} ${error.response?.statusText}`);
        }
        throw new Error(`Network error: ${error.message}`);
    }
    throw new Error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
}

function handleApiResponse<T>(response: AxiosResponse<ApiResponse<T>>): T {
    if (response.data.errmsg) {
        throw new Error(response.data.errmsg);
    }

    if (response.data.code < 200 || response.data.code >= 300) {
        const traceId = response.headers['traceid'] || 'unknown';
        throw new Error(`API error: ${response.statusText}. Trace id: ${traceId}`);
    }

    return response.data.data;
}

// API 响应类型定义
interface ApiResponse<T> {
    code: number;
    errmsg: string;
    data: T;
}

// 工作空间类型定义
export interface Workspace {
    name: string;
    username: string;
    role: string;
}

// 项目类型定义
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

// 实验类型定义
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

// 实验Summary类型定义
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

// 实验Metrics类型定义
export interface Metric {
    [key: string]: number | null;
}

export interface MetricsData {
    [key: string]: Metric[];
}

// 分组列表响应类型
interface GroupListResponse {
    list: Array<{
        name: string;
        username: string;
        role: string;
    }>;
    total: number;
}

// 项目列表响应类型（实际API响应结构）
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

// 实验列表响应类型
interface ExperimentListResponse {
    size: number;
    total: number;
    pages: number;
    list: Experiment[];
}

// 删除项目响应类型
interface DeleteProjectResponse {
    message: string;
}

// 登录响应数据类型
interface LoginResponseData {
    sid: string;
    expiredAt: string;
    userInfo: {
        username: string;
    };
}

// 登录信息类型
interface LoginInfo {
    sid: string | null;
    expiredAt: string | null;
    username: string | null;
    apiHost: string;
    webHost: string;
    apiKey: string | null;
}

export class SwanLabApi {
    private axiosInstance: AxiosInstance;
    private loginInfo: LoginInfo | null = null;
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.axiosInstance = axios.create({
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // 添加响应拦截器处理错误
        this.axiosInstance.interceptors.response.use(
            (response: AxiosResponse) => response,
            (error: AxiosError) => {
                throw handleAxiosError(error);
            }
        );
    }

    /**
     * 用户登录认证
     * 对应Python SDK中的login_by_key方法
     */
    async login(): Promise<void> {
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
                throw new Error(`Login failed with status ${response.status}: ${response.statusText}`);
            }

            this.loginInfo = {
                sid: response.data.sid,
                expiredAt: response.data.expiredAt,
                username: response.data.userInfo?.username,
                apiHost: 'https://api.swanlab.cn/api',
                webHost: 'https://swanlab.cn',
                apiKey: this.apiKey
            };

            // 设置认证头
            this.axiosInstance.defaults.headers.common['Cookie'] = `sid=${response.data.sid}`;
            this.axiosInstance.defaults.baseURL = this.loginInfo.apiHost;
        } catch (error) {
            throw handleAxiosError(error);
        }
    }

    /**
     * 获取工作空间列表
     */
    async listWorkspaces(): Promise<Workspace[]> {
        if (!this.loginInfo) {
            await this.login();
        }

        try {
            const response: AxiosResponse<ApiResponse<GroupListResponse>> = await this.axiosInstance.get('/group/');
            const data = handleApiResponse(response);

            const groups = response.data.data?.list || [];
            return groups.map(item => ({
                name: item.name,
                username: item.username,
                role: item.role
            }));
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Network error: ${error.message}`);
            }
            throw new Error(`Failed to list workspaces: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 获取项目列表
     * 对应Python SDK中的OpenApi.list_projects方法
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
                const url = `/project/${targetUsername}`;
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
     * 删除项目
     * 对应Python SDK中的OpenApi.delete_project方法
     * @param project 项目名
     * @param username 工作空间名，默认为当前用户个人空间
     */
    async deleteProject(project: string, username?: string): Promise<void> {
        if (!this.loginInfo) {
            await this.login();
        }

        try {
            // 如果未提供username，则使用当前登录用户的username
            const targetUsername = username || this.loginInfo!.username || "";
            const url = `/project/${targetUsername}/${project}`;

            const response: AxiosResponse<ApiResponse<DeleteProjectResponse>> = await this.axiosInstance.delete(url);
            handleApiResponse(response);
        } catch (error) {
            throw handleAxiosError(error);
        }
    }

    /**
     * 获取实验列表
     * 对应Python SDK中的OpenApi.list_experiments方法
     * @param project 项目名
     * @param username 工作空间名，默认为当前用户个人空间
     */
    async listExperiments(project: string, username?: string): Promise<Experiment[]> {
        if (!this.loginInfo) {
            await this.login();
        }

        try {
            // 如果未提供username，则使用当前登录用户的username
            const targetUsername = username || this.loginInfo!.username || "";
            // 根据Python SDK，正确的路径应该是 /project/{username}/{project}/runs
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
     * 获取实验详情
     * 对应Python SDK中的OpenApi.get_experiment方法
     * @param project 项目名
     * @param expId 实验CUID
     * @param username 工作空间名，默认为当前用户个人空间
     */
    async getExperiment(project: string, expId: string, username?: string): Promise<Experiment> {
        if (!this.loginInfo) {
            await this.login();
        }

        try {
            // 如果未提供username，则使用当前登录用户的username
            const targetUsername = username || this.loginInfo!.username || "";
            // 根据Python SDK，正确的路径应该是 /project/{username}/{project}/runs/{exp_id}
            const url = `/project/${targetUsername}/${project}/runs/${expId}`;

            const response: AxiosResponse<any> = await this.axiosInstance.get(url);

            // 检查响应数据是否存在
            if (!response.data) {
                throw new Error('Empty response data received from API');
            }

            // 解析实验数据
            const experimentData = response.data;

            // 构建实验对象，确保所有字段都有默认值
            const experiment: Experiment = {
                cuid: experimentData.cuid ?? "",
                name: experimentData.name ?? "",
                description: experimentData.description ?? "",
                state: experimentData.state ?? "",
                show: Boolean(experimentData.show),
                createdAt: experimentData.createdAt ?? "",
                finishedAt: experimentData.finishedAt ?? null,
                user: {
                    username: experimentData.user?.username ?? "",
                    name: experimentData.user?.name ?? "",
                    avatar: experimentData.user?.avatar ?? undefined
                },
                profile: {
                    config: experimentData.profile?.config ?? {},
                    metadata: experimentData.profile?.metadata ?? {},
                    requirements: experimentData.profile?.requirements ?? undefined,
                    conda: experimentData.profile?.conda ?? null
                },
                type: experimentData.type ?? "",
                colors: Array.isArray(experimentData.colors) ? experimentData.colors : [],
                labels: Array.isArray(experimentData.labels) ? experimentData.labels : [],
                tags: Array.isArray(experimentData.tags) ? experimentData.tags : [],
                sectionIndex: Array.isArray(experimentData.sectionIndex) ? experimentData.sectionIndex : [],
                cloneType: experimentData.cloneType ?? null,
                rootExpId: experimentData.rootExpId ?? null,
                rootProId: experimentData.rootProId ?? null
            };

            return experiment;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Network error: ${error.message}`);
            }
            throw new Error(`Failed to get experiment: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 获取实验Summary信息
     * 对应Python SDK中的OpenApi.get_summary方法
     * @param project 项目名
     * @param expId 实验CUID
     * @param username 工作空间名，默认为当前用户个人空间
     */
    async getSummary(project: string, expId: string, username?: string): Promise<Summary> {
        if (!this.loginInfo) {
            await this.login();
        }

        try {
            // 如果未提供username，则使用当前登录用户的username
            const targetUsername = username || this.loginInfo!.username || "";

            // 首先获取项目信息以获得项目CUID
            const projectUrl = `/project/${targetUsername}/${project}`;
            const projectResponse: AxiosResponse<any> = await this.axiosInstance.get(projectUrl);

            if (!projectResponse.data) {
                throw new Error('Failed to get project information');
            }

            const projectCuid = projectResponse.data.cuid || "";

            // 获取实验信息以获得rootExpId和rootProId
            const expUrl = `/project/${targetUsername}/${project}/runs/${expId}`;
            const expResponse: AxiosResponse<any> = await this.axiosInstance.get(expUrl);

            if (!expResponse.data) {
                throw new Error('Failed to get experiment information');
            }

            const rootExpId = expResponse.data.rootExpId || "";
            const rootProId = expResponse.data.rootProId || "";

            // 构造请求数据
            const requestData = {
                experimentId: expId,
                projectId: projectCuid,
            };

            // 如果是克隆实验，添加额外的参数
            if (rootExpId && rootProId) {
                Object.assign(requestData, {
                    rootExperimentId: rootExpId,
                    rootProjectId: rootProId
                });
            }

            // 发送请求获取summary数据
            const summaryResponse: AxiosResponse<any> = await this.axiosInstance.post(
                "/house/metrics/summaries",
                [requestData],
                { params: {} }
            );
            
            const data = handleApiResponse(summaryResponse);

            // 解析summary数据
            const firstDataKey = Object.keys(summaryResponse.data)[0];
            const rawData = summaryResponse.data[firstDataKey];

            // 格式化数据
            const summary: Summary = {};
            for (const [key, value] of Object.entries(rawData)) {
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
            }

            return summary;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Network error: ${error.message}`);
            }
            throw new Error(`Failed to get experiment summary: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 获取实验指标数据
     * 对应Python SDK中的OpenApi.get_metrics方法
     * @param expId 实验CUID
     * @param keys 指标key, 单个字符串或字符串数组
     */
    async getMetrics(expId: string, keys: string | string[]): Promise<MetricsData> {
        if (!this.loginInfo) {
            await this.login();
        }

        try {
            // 确保keys是数组格式
            const keysArray = Array.isArray(keys) ? keys : [keys];
            
            // 去重keys
            const uniqueKeys = [...new Set(keysArray)];
            
            const metricsData: MetricsData = {};
            
            // 逐个获取每个key的数据
            for (const key of uniqueKeys) {
                try {
                    const response: AxiosResponse<any> = await this.axiosInstance.get(
                        `/experiment/${expId}/column/csv`,
                        {
                            params: { key }
                        }
                    );
                    
                    // 检查响应是否存在以及是否有数据
                    if (!response || !response.data) {
                        console.warn(`Empty response for key ${key}`);
                        continue;
                    }
                    
                    // 检查是否有错误信息
                    if (response.data.errmsg) {
                        console.warn(`Error getting metrics for key ${key}:`, response.data.errmsg);
                        continue;
                    }
                    
                    // 根据实际API响应结构获取URL
                    // 实际响应结构: { url: '...' }
                    const url = response.data.url;
                    
                    if (!url) {
                        console.warn(`No URL found for key ${key}. Response structure:`, JSON.stringify(response.data, null, 2));
                        continue;
                    }
                    
                    // 获取CSV数据
                    const csvResponse = await axios.get(url);
                    const csvData = csvResponse.data;
                    
                    // 简单解析CSV数据
                    const lines = csvData.trim().split('\n');
                    if (lines.length < 2) {
                        console.warn(`Invalid CSV data for key ${key}`);
                        continue;
                    }
                    
                    // 解析表头
                    const headers = lines[0].split(',').map((h: string) => h.trim());
                    
                    // 解析数据行
                    const dataRows: Metric[] = [];
                    for (let i = 1; i < lines.length; i++) {
                        const values = lines[i].split(',').map((v: string) => v.trim());
                        const row: Metric = {};
                        
                        for (let j = 0; j < headers.length; j++) {
                            const header = headers[j];
                            const value = values[j];
                            
                            // 尝试转换为数字，如果失败则保持为字符串
                            row[header] = (value === '' || value === 'null' || value === 'undefined') 
                                ? null 
                                : isNaN(Number(value)) ? value : Number(value);
                        }
                        
                        dataRows.push(row);
                    }
                    
                    metricsData[key] = dataRows;
                } catch (error) {
                    console.warn(`Error processing metrics for key ${key}:`, error);
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
     * 删除实验
     * 对应Python SDK中的OpenApi.delete_experiment方法
     * @param project 项目名
     * @param expId 实验CUID
     * @param username 工作空间名，默认为当前用户个人空间
     */
    async deleteExperiment(project: string, expId: string, username?: string): Promise<void> {
        if (!this.loginInfo) {
            await this.login();
        }

        try {
            // 如果未提供username，则使用当前登录用户的username
            const targetUsername = username || this.loginInfo!.username || "";
            
            // 根据Python SDK，正确的路径应该是 /project/{username}/{project}/runs/{exp_id}
            const url = `/project/${targetUsername}/${project}/runs/${expId}`;

            const response: AxiosResponse<any> = await this.axiosInstance.delete(url);
            handleApiResponse(response);
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Network error: ${error.message}`);
            }
            throw new Error(`Failed to delete experiment: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}