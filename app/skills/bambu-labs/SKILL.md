---
name: bambu-labs
description: 干运行、上传并启动本地 Bambu Lab 3D 打印作业，包括打印机状态检查、文件传输与打印任务管理。
---

# Bambu Labs

## 概述

使用此技能与本地网络中的 Bambu Lab 3D 打印机进行交互。本技能涵盖 Bambu Lab 打印机（X1 系列、P1 系列、A1 系列）的打印机发现、状态监控、文件上传、打印作业管理以及基本故障排除。

## 核心规则

1. 在向真实打印机发送打印作业之前，务必先进行干运行。使用 --dry-run 验证文件和配置，而无需实际启动打印。
2. 尊重打印机状态：未经用户确认，不得向正在打印、暂停或处于错误状态的打印机发送命令。
3. 上传前验证 G-code 文件。检查文件是否与目标打印机型号兼容。
4. 切勿超过打印机规格：构建体积、最大喷嘴温度、最大热床温度以及耗材兼容性。
5. 监控打印进度，并向用户报告完成情况或错误。
6. 当用户要求取消打印时，在发送取消命令前进行确认。

## 必需工作流

1. 发现本地网络中的打印机，或通过 IP/主机名连接到特定打印机。
2. 检查打印机状态：空闲、打印中、暂停或错误。向用户报告状态。
3. 接收或生成要打印的 G-code 文件。
4. 验证 G-code 是否与目标打印机型号兼容。
5. 执行干运行验证（--dry-run），检查文件兼容性和预估打印时间。
6. 将 G-code 文件上传到打印机。
7. 经用户确认后启动打印作业。
8. 监控打印进度并报告更新。
9. 完成后，报告结果并提供执行打印后任务的选项。

## 工具与路径

python scripts/discover                    # 发现本地网络中的打印机
python scripts/status                      # 检查打印机状态
python scripts/upload path/to/model.gcode  # 将 G-code 上传到打印机
python scripts/print --dry-run             # 干运行验证
python scripts/print                       # 启动打印作业
python scripts/cancel                      # 取消当前打印

常用选项：
- --ip <address> - 通过 IP 连接到特定打印机
- --dry-run - 仅验证，不打印
- --monitor - 持续监控打印进度
- --bed-temperature <C> - 设置热床温度
- --nozzle-temperature <C> - 设置喷嘴温度

## 渐进式参考文档

- references/local-lan-protocol.md - 本地 LAN 通信协议详情
- references/new-printer-onboarding.md - 打印机初始设置与配置
- references/real-printer-checklist.md - 真实打印机打印前检查清单

### 重要安全注意事项

- 始终监督任何打印作业的第一层。
- 在打印机运行期间，让易燃物远离打印机。
- 打印会产生烟雾的耗材时，确保充分通风。
- 高温打印期间，请勿长时间让打印机处于无人看管状态。
- 遵守打印机制造商的安全指南。