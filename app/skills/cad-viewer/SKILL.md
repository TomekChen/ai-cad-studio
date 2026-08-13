---
name: cad-viewer
description: 启动并管理 CAD Viewer 网页应用，用于在浏览器中预览 CAD 模型、G-code 与机器人文件。
---

# CAD Viewer

## 概述

使用此技能启动并管理 CAD Viewer 网页应用。CAD Viewer 让用户可以在浏览器中浏览、预览和检查 CAD 文件（STEP、STL、GLB）、机器人描述文件（URDF、SRDF、SDF）和 G-code。它还提供 CAD 引用复制（选择器引用）、拾取、测量和目录浏览功能。

## 快速开始

CAD Viewer 作为本地 Web 服务器运行。从查看器目录启动：

cd viewer && node src/server/server.mjs --host 0.0.0.0 --port 4178

或使用查看器项目根目录中的默认启动器：

cd viewer && npm start

启动后，在浏览器中打开显示的 URL。查看器在根路径上提供基于 React 的 UI。

## 核心功能

- 文件浏览：导航本地目录，查看 CAD 文件、机器人描述和 G-code 文件。
- 3D 预览：使用基于 WebGL 的渲染进行旋转、平移、缩放和模型检查。
- 零件拾取：点击几何体以获取选择器引用、表面类型和测量值。
- 选择器引用：复制 CAD 路径引用（#o1.2.f1）以在 CAD 脚本中使用。
- 目录根：通过 --root-dir 或环境变量配置查看器可以访问的目录。
- 主题：浅色和深色模式，以及用于 CAD 工作的工作台主题。

## 用途

在以下情况下使用此技能：
- 用户想要直观地检查生成的 CAD 文件。
- 用户需要验证机器人 URDF/SRDF/SDF 结构。
- 用户需要为 CAD 脚本拾取几何引用。
- 用户想要并排比较设计迭代。
- 用户需要浏览和预览 G-code 刀具路径。
- CAD 或机器人技能需要移交生成的文件进行可视化审查。

在完成创建或修改 .step、.stp、.stl、.3mf、.glb、.urdf、.srdf、.sdf 或 .gcode 文件的工作后，生成技能必须将文件路径传递给 CAD Viewer，并在最终回复中返回查看器链接。

## 必需工作流

1. 确保 CAD Viewer 正在运行。如果没有，使用配置的主机和端口启动它。
2. 当文件路径被传递时，打开 CAD Viewer 并将包含该文件的目录作为根目录（如果可行）。
3. 返回查看器 URL，以便用户可以打开和检查文件。
4. 如果查看器无法启动，报告失败并建议基于 CLI 的检查替代方案。

## 工具与路径

node src/server/server.mjs --host 0.0.0.0 --port 4178
node src/server/server.mjs --host 0.0.0.0 --port 4178 --root-dir /path/to/projects

有用的选项：
- --port：服务器端口（默认 4178）
- --host：绑定地址（默认 127.0.0.1；使用 0.0.0.0 进行外部访问）
- --root-dir：将文件访问限制到此目录
- --shutdown-after-ms：非活动后自动关闭

环境变量：
- VIEWER_DEFAULT_FILE：要打开的默认文件
- VIEWER_GIT：用于版本显示的 git 上下文
- VIEWER_ASSET_BACKEND：资产后端选择