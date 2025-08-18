# Large Language Model for SwanLab
The vscode plugin provides Agents with the ability to access the swanlab API

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