---
name: srdf
description: 为 URDF 机器人模型创建 SRDF 语义描述文件，包括规划组、末端执行器、虚拟关节、碰撞对与姿态定义，支撑 MoveIt2 运动规划。
---

# SRDF

## 概述

使用此技能处理 SRDF 语义机器人配置输出。将 SRDF 工作视为语义机器人配置，而非仅仅是针对 MoveIt 的 XML 编写。主要正确性风险包括：规划组成员关系、末端执行器父子关系、虚拟关节语义、禁用碰撞覆盖范围以及默认姿态偏离。

## 核心规则

1. 将定义 gen_srdf() 的 Python 源码视为事实来源。将配置的 .srdf 文件视为生成制品。
2. 仅生成明确的 SRDF 目标。不要从此技能重新生成无关的 CAD、网格、渲染、URDF、SDF 或仿真器制品。
3. scripts/srdf 生成器默认会验证生成的 SRDF。不要使用或记录单独的 validate 命令。
4. 在编写或修改 SRDF XML 之前，建立机器人的组、末端执行器、虚拟关节、禁用碰撞和默认姿态。参见 references/design-ledger.md。
5. 精确使用 SRDF 语义：组定义 MoveIt 规划组；组名、子组成员关系和运动学求解器对规划器有意义。
6. 末端执行器将某个组作为子节点连接到另一个组上的特定连杆。父组必须是包含父连杆的运动学链。
7. 虚拟关节将机器人连接到世界。仅使用 fixed、planar 或 floating 类型。
8. 禁用碰撞规则应覆盖正常操作中预期不会发生碰撞的所有配对。使用 references/disabled-collisions.md 获取规范配对。
9. 默认姿态设置命名状态组位置，RViz、MoveIt 和启动脚本依赖这些位置。
10. 不要根据模糊描述推断空间变换、关节符号、父子关系或组成员关系。

## CAD Viewer 交接

完成创建或修改 .srdf 的 SRDF 工作后，当 cad-viewer 已安装时，必须始终将明确的文件路径传递给 cad-viewer。cad-viewer 必须在 CAD Viewer 未运行时启动之，并返回所创建或更新文件的相关链接；如果 cad-viewer 不可用或启动失败时，应报告该情况，而非静默跳过交接。

## 必需工作流

1. 确定 gen_srdf() Python 源码和目标 .srdf 输出。
2. 确定 SRDF 所注释的 URDF 模型。
3. 在编辑组、父节点、虚拟关节或姿态之前，读取或创建设计记录表。
4. 编辑生成器源码，而非生成的 SRDF XML。
5. 仅使用 scripts/srdf 重新生成明确目标。
6. 让生成时验证在 XML、schema、组、父节点、虚拟关节和禁用碰撞问题上快速失败。
7. 当 SRDF 引用了已变更的 URDF 时，先从所属的 URDF 工作流重新生成该 URDF，然后重新生成受影响的 SRDF 目标。
8. 报告剩余假设、未经检查组语义以及验证缺口。

## 工具与路径

使用项目或工作空间的 Python 环境运行。将示例中的 python 视为解释器占位符。SRDF 生成器和轻量级验证器仅使用 Python 标准库；下游消费者（如 MoveIt）可能需要自己的运行时包。

从此技能目录执行时，启动器格式如下：

python scripts/srdf path/to/source.py
python scripts/srdf path/to/source.py -o path/to/robot.srdf

纯 Python 目标会在源码旁边生成同名的 .srdf 文件。-o/--output 仅对单个纯目标有效。对自定义多目标路径，使用 SOURCE.py=OUTPUT.srdf 配对格式。

相对源码目标和 CLI 输出覆盖路径从当前工作目录解析。当从此技能目录外部运行时，请为启动器路径添加前缀。

启动器仅执行 gen_srdf() 并验证生成的 SRDF 输出。它不提供单独的仅验证命令。

## 渐进式参考文档

设计记录表：references/design-ledger.md
禁用碰撞规则：references/disabled-collisions.md
末端执行器配置：references/end-effectors.md
SRDF 生成器合约：references/generator-contract.md
SRDF 生成命令：references/gen-srdf.md
SRDF 编辑工作流：references/srdf-workflow.md
生成时验证：references/validation.md
规划记录表：references/planning-ledger.md