---
name: sdf
description: 创建仿真模型与 SDF 世界描述文件，包括物理属性、传感器、光照与环境定义。
---

# SDF

## 概述

使用此技能处理 SDF 仿真描述格式的模型与世界文件输出。将 SDF 工作视为仿真环境建模，而不仅仅是 XML 编写。主要的正确性风险包括：框架位置、物理属性、传感器配置以及世界环境一致性。

## 核心规则

1. 将定义 gen_sdf() 的 Python 源码视为事实来源。将已配置的 .sdf 或 .world 文件视为生成产物。
2. 仅生成明确的 SDF 目标。不要在此技能中重新生成无关的 CAD、网格、渲染、URDF、SRDF 或其他仿真器产物。
3. scripts/sdf 生成器默认会验证所生成的 SDF。
4. 在编写或修改 SDF XML 之前，先确立模型的框架、物理属性、传感器与世界布局。参见 references/design-ledger.md。
5. 严格使用 SDF 框架语义与坐标约定。
6. 不要根据模糊的描述推断空间变换、物理属性或传感器参数。
7. 对于仿真模型，适当建模 link、joint、collision、visual 与 sensor 元素。
8. 世界文件定义环境：包含模型、设置重力、物理配置文件和光照。

## CAD Viewer 交接

完成创建或修改 .sdf 或 .world 文件的 SDF 工作后，当 CAD Viewer 已安装时，必须始终将明确的文件路径传递给 CAD Viewer。CAD Viewer 必须在未运行时启动之，并返回所创建或更新文件的相关链接；若不可用或启动失败时，应报告此情况，而非静默跳过交接。

## 必需工作流

1. 确定 gen_sdf() Python 源码与目标 .sdf 或 .world 输出。
2. 确定仿真目标：Gazebo/Ignition，以及其他兼容 SDF 的仿真器。
3. 在编辑框架、物理属性或传感器之前，读取或创建设计记录。
4. 编辑生成器源码，而非所生成的 SDF XML。
5. 仅通过 scripts/sdf 重新生成明确的目标。
6. 让生成时验证在 XML、模式、框架、物理属性和传感器问题上快速失败。
7. 当几何体或网格引用依赖于已变更的 CAD 或导出的网格产物时，首先重新生成这些明确的产物。
8. 报告剩余的假设与验证缺口。

## 工具与路径

使用项目或工作区的 Python 环境运行。SDF 生成器使用标准 Python 库。

python scripts/sdf path/to/source.py
python scripts/sdf path/to/source.py -o path/to/model.sdf

相对源目标与 CLI 输出覆盖从当前工作目录解析。

## 渐进式参考文档

- references/builder-helpers.md - 构建辅助工具
- references/design-ledger.md - 设计记录与假设
- references/examples.md - SDF 模型与世界示例
- references/frame-semantics.md - SDF 框架约定
- references/gen-sdf.md - SDF 生成命令参考
- references/generator-contract.md - 生成器契约
- references/implementation-notes.md - 实现说明
- references/interoperability.md - URDF/SDF 互操作性
- references/llm-guardrails.md - LLM 护栏
- references/sdf-workflow.md - 完整 SDF 工作流
- references/smoke-tests.md - 冒烟测试预期
- references/validation.md - 验证预期