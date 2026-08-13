---
name: sendcutsend
description: 校验 DXF 与 STEP 文件的制造可行性，规避切割与加工常见错误，生成制造就绪的输出。
---

# SendCutSend

## 概述

使用此技能校验 DXF 与 STEP 文件的制造可行性，适用于 SendCutSend 或类似的在线制造服务。此技能在提交文件进行制造前，检查常见的切割、折弯与加工错误。

## 核心规则

1. 在提交之前而非之后校验文件。检查几何体、公差、材料兼容性以及服务特定要求。
2. 使用 scripts/validate 对 DXF 和 STEP 文件运行自动化检查。
3. 审阅校验报告并在提交前修复所有错误。
4. 当用户指定了具体材料、表面处理或数量时，将这些要求纳入校验检查。
5. 校验通过后，根据服务的规格说明准备文件以供提交。

## 必需工作流

1. 从用户或其他技能接收 DXF 或 STEP 文件。
2. 在文件上运行 scripts/validate 以检查常见问题。
3. 审阅校验输出并修复所有严重或警告级别的问题。
4. 当用户已指定材料、厚度、表面处理与数量时，确认文件符合这些要求。
5. 提供校验结果摘要，包括任何已接受的警告。
6. 使用 scripts/generate-report 生成制造报告。
7. 当 CAD Viewer 已安装时，将校验后的文件传递给 CAD Viewer 进行最终视觉审阅。

## 工具与路径

python scripts/validate path/to/file.dxf
python scripts/validate path/to/file.step --material aluminum --thickness 3.0
python scripts/generate-report path/to/file.dxf -o report.pdf

校验检查项：
- 轮廓闭合性与连续性
- 最小特征尺寸与材料厚度的关系
- 间隙与切缝补偿
- 折弯半径与材料能力的匹配
- 孔径与厚度比
- 内角半径

## 参考文档

- references/official-sources.md - 官方制造指南
- references/report-template.md - 报告模板