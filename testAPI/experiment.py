from swanlab import OpenApi

my_api = OpenApi() # 使用本地登录信息
print(my_api.list_experiments(project="VLA").data)