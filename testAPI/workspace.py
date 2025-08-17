from swanlab import OpenApi

my_api = OpenApi() # 使用本地登录信息
print(my_api.list_workspaces().data) # 获取当前用户的工作空间列表