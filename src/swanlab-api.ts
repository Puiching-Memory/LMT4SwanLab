import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';

// 定义API响应类型
interface ApiResponse<T> {
    code: number;
    errmsg: string;
    data: T;
}

// 定义Workspace数据类型
interface Workspace {
    name: string;
    username: string;
    role: string;
}

// 定义Group API响应数据类型
interface GroupListResponse {
    list: Array<{
        name: string;
        username: string;
        role: string;
    }>;
    total: number;
}

// 定义登录响应数据类型
interface LoginResponseData {
    sid: string;
    expiredAt: string;
    userInfo: {
        username: string;
    };
}

// 定义登录信息类型
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
            // 对应Python SDK中的login_request方法
            const response: AxiosResponse<LoginResponseData> = await this.axiosInstance.post(
                'https://api.swanlab.cn/api/login/api_key',
                {},
                {
                    headers: {
                        'authorization': this.apiKey
                    }
                }
            );

            // 检查响应状态
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
        // 如果未登录，先尝试登录
        if (!this.loginInfo) {
            await this.login();
        }

        try {
            // 对应Python SDK中的GroupAPI.list_workspaces方法
            const response: AxiosResponse<ApiResponse<GroupListResponse>> = await this.axiosInstance.get('/group/');
            
            // 检查是否有错误信息
            if (response.data.errmsg) {
                throw new Error(response.data.errmsg);
            }
            
            // 检查响应状态码
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
}

export { SwanLabApi, Workspace };