---
name: gcode
description: 使用真实切片引擎将网格文件切分为针对具体打印机配置的 FDM G-code，并验证其可打印性。
---

# G-code

## 概述

使用此技能通过真实的切片引擎，将网格文件（STL、3MF、OBJ）切分为针对具体打印机配置的生产就绪 FDM G-code。此技能处理完整的切片流水线：模型准备、打印机配置、切片与 G-code 验证。

## 核心规则

1. 仅对明确的网格文件进行切片。不要重新切片无关的几何体。
2. 尊重打印机特定配置：构建体积、喷嘴直径、耗材类型、温度与速度限制。
3. 在声明 G-code 可打印之前对其进行验证。检查常见问题，如层间粘附、悬垂、桥梁与回抽。
4. 当用户指定了具体材料、层高、填充或支撑配置时，使用这些设置。
5. 切片完成后，当 CAD Viewer 已安装时，将 G-code 传递给 CAD Viewer 进行视觉预览。

## 必需工作流

1. 从用户或 CAD 技能接收网格文件（STL、3MF、OBJ）。
2. 确定目标打印机及其能力（构建体积、挤出机数量、热床、外壳）。
3. 配置切片参数：层高、填充百分比与图案、壁数、顶部/底部层数、支撑设置、附着类型与耗材温度。
4. 运行切片器以生成 G-code。
5. 验证 G-code 输出：检查挤出限制、空移、温度命令与打印结束序列。
6. 当可用时，运行刀具路径的仿真或预览。
7. 当 CAD Viewer 已安装时，将 G-code 文件传递给 CAD Viewer 进行视觉预览。
8. 将 G-code 文件路径与关键打印设置返回给用户。

## 工具与路径

python scripts/slice path/to/model.stl --printer bambu-x1c --layer-height 0.2
python scripts/slice path/to/model.3mf --printer voron-24 --profile petg
python scripts/validate path/to/output.gcode
python scripts/preview path/to/output.gcode

切片器后端：
- 内置切片器用于基本配置
- 外部切片器集成用于高级功能
- 自定义配置文件系统用于每个打印机的配置

## 渐进式参考文档

- references/slicer-backends.md - 可用的切片后端及其配置
- references/gcode-validation.md - G-code 验证规则与检查