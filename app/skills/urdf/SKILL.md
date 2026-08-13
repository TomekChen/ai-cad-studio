---
name: urdf
description: 创建、检查和验证机器人 URDF 模型文件，包括连杆、关节、传动与惯量参数，直接用于机器人仿真与可视化。
---

# URDF

## 概述

使用此技能处理 URDF 机器人描述输出。将 URDF 工作视为约束运动学建模，而非仅仅是 XML 编写。主要正确性风险包括：框架位置、关节轴语义、单位一致性、网格缩放、惯性数据以及生成制品偏离。

## 核心规则

1. 将定义 gen_urdf() 的 Python 源码视为事实来源。将配置的 .urdf 文件视为生成制品。
2. 仅生成明确的 URDF 目标。不要从此技能重新生成无关的 CAD、网格、渲染、SRDF、SDF 或仿真器制品。
3. scripts/urdf 生成器默认会验证生成的 URDF。不要使用或记录单独的 validate 命令。
4. 在编写或修改 URDF XML 之前，建立机器人的框架、关节、几何、单位和假设记录表。参见 references/design-ledger.md。
5. 精确使用 URDF 框架语义。关节原点、连杆框架、关节轴以及视觉/碰撞/惯性原点使用不同的参考框架。参见 references/frame-semantics.md。
6. 不要根据模糊描述推断空间变换、网格单位、手性、坐标轴或关节符号。应使用 CAD 变换、标注图纸、测量值、现有源数据或明确记录的假设。
7. 偏好简单、可审计的生成器代码，而非精巧的 XML 构造。保持常量的命名基于物理含义，而非任意数字。
8. 对于物理连杆，当目标消费者需要时，分别对 inertial、visual 和 collision 进行建模。纯框架连杆可以有意识地省略质量和几何。

## CAD Viewer 交接

完成创建或修改 .urdf 的 URDF 工作后，当 cad-viewer 已安装时，必须始终将明确的文件路径传递给 cad-viewer。cad-viewer 必须在 CAD Viewer 未运行时启动之，并返回所创建或更新文件的相关链接；如果 cad-viewer 不可用或启动失败时，应报告该情况，而非静默跳过交接。

## 必需工作流

1. 确定 gen_urdf() Python 源码和目标 .urdf 输出。
2. 确定目标消费者：RViz、robot_state_publisher、Gazebo/Ignition、MoveIt、真实机器人驱动或其他仿真器。
3. 在编辑框架、原点、轴、网格缩放、限位或惯性参数之前，读取或创建设计记录表。
4. 编辑生成器源码，而非生成的 URDF XML。
5. 仅使用 scripts/urdf 重新生成明确目标。
6. 让生成时验证在 XML、图结构、关节、几何、网格引用和惯性问题上快速失败。
7. 当几何或网格引用依赖变更的 CAD 或导出的网格输出时，先用相应的 CAD 或网格工作流重新生成这些制品，然后重新生成受影响的 URDF 目标。
8. 在可用时，运行与目标消费者匹配的冒烟测试：RViz 显示、robot_state_publisher 树、Gazebo/Ignition 加载或 MoveIt 模型加载。
9. 报告剩余假设、未经检查的空间数据以及验证/冒烟测试的缺口。

## 工具与路径

使用项目或工作空间的 Python 环境运行。将示例中的 python 视为解释器占位符；如果裸 python 不可用，请替换为 python3、项目虚拟环境解释器或配置的解释器路径。URDF 生成器和轻量级验证器仅使用 Python 标准库；下游消费者（如 RViz、Gazebo 或 MoveIt）可能需要自己的运行时包。

从此技能目录执行时，启动器格式如下：

python scripts/urdf path/to/source.py
python scripts/urdf path/to/source.py -o path/to/robot.urdf
python scripts/urdf path/to/a.py=out/a.urdf path/to/b.py=out/b.urdf

纯 Python 目标会生成与源码同名的 .urdf 文件。-o/--output 仅对单个纯目标有效。对自定义多目标路径，使用 SOURCE.py=OUTPUT.urdf 配对格式。

相对源码目标和 CLI 输出覆盖路径从当前工作目录解析。当从本技能目录外部运行时，请为启动器路径添加前缀，以便目标文件仍能从预期工作空间正确解析。

启动器仅执行 gen_urdf() 并验证生成的 URDF 输出。它不提供单独的仅验证命令。

## 渐进式参考文档

设计记录表：references/design-ledger.md
框架语义：references/frame-semantics.md
URDF 生成器合约：references/generator-contract.md
URDF 生成命令：references/gen-urdf.md
URDF 编辑工作流：references/urdf-workflow.md
生成时验证预期：references/validation.md