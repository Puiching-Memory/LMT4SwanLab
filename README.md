# Large Language Model for SwanLab
The vscode plugin provides Agents with the ability to access the swanlab API

## Features
| API               | type       | desc                                                            |
| ----------------- | ---------- | --------------------------------------------------------------- |
| list_workspaces   | WorkSpace  | 获取当前用户的所有工作空间(组织)列表                            |
| list_projects     | Project    | 获取指定工作空间下的所有项目列表                                |
| delete_project    | Project    | 删除一个项目                                                    |
| list_experiments  | Experiment | 获取指定项目下的所有实验列表                                    |
| get_experiment    | Experiment | 获取一个实验的详细信息（实验名、配置、环境等）                  |
| get_summary       | Experiment | 获取一个实验的Summary信息，包含实验跟踪指标的最终值和最大最小值 |
| get_metrics       | Experiment | 获取一个实验指标的值                                            |
| delete_experiment | Experiment | 删除一个实验                                                    |

## python env dev
```bash
conda create -n swanlab python=3.13
conda activate swanlab
pip install -e ./SwanLab -v
pip install numpy
```

## package
```bash
vsce package
```
https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publishing-extensions

## publish
package + publish
```bash
vsce publish
```

## reference
https://docs.swanlab.cn/api/py-openapi.html