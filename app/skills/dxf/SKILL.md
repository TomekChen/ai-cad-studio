---
name: dxf
description: 从 Python 源或 CAD 几何生成 2D DXF 工程图纸，包括轮廓、模板、排样与制造校验。
---

# DXF

## 概述

将此技能用于 2D DXF 工程图纸输出。将 DXF 工作视为从 CAD 几何或独立 Python DXF 源生成图纸。DXF 图纸可以从现有的 3D CAD 零件投影，也可以独立地从 Python 创建。当 DXF 从 3D 零件投影时，3D 几何由 CAD 技能拥有；此技能拥有图纸布局、视图选择、尺寸标注和 DXF 导出。

## 核心规则

1. 将定义 DXF 输出的 Python 源代码视为事实来源。将生成的 .dxf 文件视为派生工件。
2. 仅生成明确的 DXF 目标。不要从此技能重新生成无关的 CAD、STEP、STL 或网格工件。
3. scripts/dxf 生成器默认验证生成的 DXF。
4. 在创建 DXF 之前，确定绘图意图：要显示哪些几何图形、哪些视图、哪些尺寸或注释，以及目标图纸尺寸。
5. 当从 3D CAD 几何投影时，首先确保 CAD 几何已最终确定。使用 CAD 技能进行 CAD 工作，然后从生成的 STEP 或 build123d 源生成 DXF。
6. 对于独立 DXF 工作（无 3D 几何），使用项目可用的 DXF 库直接在 Python 中编写图纸。

## 目的

此技能的 DXF 输出服务于多个目的：
- 制造：激光切割、水射流、等离子和 CNC 雕刻，基于 2D 轮廓。
- 文档：用于检查和装配的带尺寸标注的工程图纸。
- 排样：用于材料高效板材切割的零件布局。
- 验证：在发送给制造商之前检查轮廓连续性、间隙和可制造性。

## 必需工作流

1. 确定 DXF 是从现有 3D 几何投影还是独立创建。
2. 对于投影 DXF：与 CAD 技能协调以最终确定 3D 几何，然后导出相关轮廓或视图。
3. 对于独立 DXF：使用项目的 DXF 库在 Python 中编写图纸。
4. 仅使用 scripts/dxf 生成明确目标。
5. 验证输出：检查轮廓闭合性、尺寸精度和图层结构。
6. 当以制造为目标时，验证间隙、材料厚度和工具可达性。
7. 当安装了 CAD Viewer 时，将生成的 DXF 传递给 CAD Viewer 进行可视化审查。

## 工具与路径

使用项目或工作区的 Python 环境运行。使用项目的 DXF 库（通常为 ezdxf）。

python scripts/dxf path/to/source.py
python scripts/dxf path/to/source.py -o path/to/output.dxf

## 参考文档

references/dxf-workflow.md - 详细的 DXF 生成工作流。
references/dxf-api.md - API 参考和选项。