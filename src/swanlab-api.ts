import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';

// API 响应类型定义
interface ApiResponse<T> {
    code: number;
    errmsg: string;
    data: T;
}

// 工作空间类型定义
interface Workspace {
    name: string;
    username: string;
    role: string;
}

// 项目类型定义
interface Project {
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

class SwanLabApi {
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
                if (error.response?.status === 401) {
                    throw new Error('Authentication failed. Please check your API key.');
                }
                throw new Error(`API request failed: ${error.message}`);
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

            const data = response.data;
            this.loginInfo = {
                sid: data.sid,
                expiredAt: data.expiredAt,
                username: data.userInfo?.username,
                apiHost: 'https://api.swanlab.cn/api',
                webHost: 'https://swanlab.cn',
                apiKey: this.apiKey
            };

            // 设置认证头
            this.axiosInstance.defaults.headers.common['Cookie'] = `sid=${data.sid}`;
            this.axiosInstance.defaults.baseURL = this.loginInfo.apiHost;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 401) {
                    throw new Error('Error api key');
                } else if (error.response?.status === 403) {
                    throw new Error('You need to be verified first');
                }
                throw new Error(`${error.response?.status} ${error.response?.statusText}`);
            }
            throw new Error(`Failed to login: ${error instanceof Error ? error.message : String(error)}`);
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

            if (response.data.errmsg) {
                throw new Error(response.data.errmsg);
            }

            if (response.data.code < 200 || response.data.code >= 300) {
                throw new Error(`API error: ${response.statusText}. Trace id: ${response.headers['traceid'] || 'unknown'}`);
            }

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

            while (true) {
                const targetUsername = username || this.loginInfo!.username || "";
                const url = `/project/${targetUsername}`;

                const response: AxiosResponse<ProjectListResponse> = await this.axiosInstance.get(
                    url,
                    {
                        params: {
                            detail: detail,
                            page: page,
                            size: size
                        }
                    }
                );

                const responseData = response.data;
                const projects = responseData?.list || [];

                // 转换项目数据格式
                const parsedProjects = projects.map((item: any) => {
                    const project: Project = {
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
                        }
                    };

                    // 只有当_count存在时才添加count字段
                    if (item._count) {
                        project.count = {
                            experiments: item._count?.experiments || 0,
                            contributors: item._count?.contributors || 0,
                            children: item._count?.children || 0,
                            collaborators: item._count?.collaborators || 0,
                            runningExps: item._count?.runningExps || 0
                        };
                    }

                    return project;
                });

                allProjects.push(...parsedProjects);

                const total = responseData?.total || 0;

                if (projects.length === 0 || allProjects.length >= total) {
                    break;
                }

                page++;
            }

            return allProjects;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Network error: ${error.message}`);
            }
            throw new Error(`Failed to list projects: ${error instanceof Error ? error.message : String(error)}`);
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

            if (response.data.errmsg) {
                throw new Error(response.data.errmsg);
            }

            if (response.data.code < 200 || response.data.code >= 300) {
                throw new Error(`API error: ${response.statusText}. Trace id: ${response.headers['traceid'] || 'unknown'}`);
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Network error: ${error.message}`);
            }
            throw new Error(`Failed to delete project: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

export { SwanLabApi, Workspace, Project };