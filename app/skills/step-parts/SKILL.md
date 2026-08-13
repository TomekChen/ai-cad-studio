---
name: step-parts
description: 查找、评估和下载 step.parts 平台上的标准可购 CAD 零件，包括电机、舵机、电子板、连接器、螺丝、轴承等标准件。
---

# step.parts

## 概述

使用托管的 step.parts 机器端点，而非抓取 HTML 或依赖本地仓库文件。将 https://api.step.parts 视为规范 API 源，并将 https://www.step.parts 视为站点/静态资源源，除非用户提供不同的托管镜像。网络/DNS 故障并非结论性：如果从沙箱无法访问 api.step.parts，在报告缺失或使用占位几何之前，请使用网络权限重试一次。除非 API 可访问且未返回相关候选项，否则不要将零件描述为不可用。

当 CAD 装配包含命名的现成执行器、舵机、电机、电子板、连接器或其他可购买组件时，在创建简化的占位几何之前，先搜索 step.parts。对于命名的舵机、电机和执行器，在放弃之前搜索精确型号字符串以及常见别名/供应商拼写。例如，STS3215 也可能显示为 ST3215、3215、Waveshare Feetech ST3215，或在 family=feetech 下。如果 API 可访问但未找到精确或接近精确的匹配，记录搜索缺失，然后使用记录的包络或简化替代品。

## 快速工作流

1. 将请求的零件解释为搜索词和可选分类：
   - q 用于模糊标记、标准、别名、尺寸、来源/产品 URL 以及属性名/值。
   - 当用户给出精确分类时，使用 category、family、standard 或 tag。
2. 搜索 /v1/parts 并检查 items、total 和 facets。对于执行器型号，在将空结果视为缺失之前，重试可能的别名、省略的字母、供应商名称和相关 family 分类。
3. 如果结果不明确，在选择前展示包含 id、name、standard 和关键属性的最佳选项。如果某个结果明显匹配，直接返回所选记录详情，除非用户要求本地 STEP 文件。
4. 当找到精确或接近精确的现成执行器模型时，除非有明确的装配原因需要使用简化包络，否则优先下载并使用其 STEP 文件。明确记录该选择。
5. 当用户要求下载或保存 STEP 文件时，下载其 stepUrl，然后在存在 sha256 时验证文件的校验和。
6. 返回下载后的本地路径，以及所选零件 ID 和页面/API URL，以便用户追溯来源。

## CAD Viewer 交接

完成创建或更新本地 .step 或 .stp 文件的 step.parts 工作后，当 cad-viewer 已安装时，必须始终将明确的文件路径传递给 cad-viewer。cad-viewer 必须在 CAD Viewer 未运行时启动之，并返回所创建或更新文件的相关链接；如果 cad-viewer 不可用或启动失败时，应报告该情况，而非静默跳过交接。

## 内置下载工具

使用 scripts/download_step_part.py 进行确定性搜索、下载和校验和验证：

python scripts/download_step_part.py M3 socket head 12 --download
python scripts/download_step_part.py --id iso4762_socket_head_cap_screw_m3x12 --download
python scripts/download_step_part.py bearing 608zz --limit 5

有用的选项：

- --origin：仅当用户提供另一个托管 API 源时覆盖 https://api.step.parts。
- --tag、--category、--family、--standard：可重复的分类过滤器。
- --out-dir：当用户要求特定目标目录时覆盖下载目录。
- --all：与 --download 配合使用时，将返回页面上的每个结果作为单独的 STEP 文件下载。
- --overwrite：替换已有输出文件。

脚本将 JSON 输出到 stdout。对于搜索，打印匹配记录。对于下载，打印保存的文件路径、校验和和源 URL。

## API 参考

当需要端点详情、字段含义或查询语义时，阅读 references/step-parts-api.md。优先使用：

- /v1/parts 进行带绝对资源 URL 的过滤搜索。
- /v1/parts/{id} 获取单个富记录。
- 返回的 stepUrl 用于 STEP 下载。
- /v1/catalog/parts.index.json 获取紧凑的发现索引。
- /v1/catalog/schema 获取字段和 family 属性含义。
- /v1/openapi.json 在生成客户端或工具时使用。

## 搜索指南

- API 对查询标记使用 AND 逻辑，因此从具体但不超约束的条件开始。例如，在添加精确的 family 和 standard 过滤器之前，先使用 M3 SHCS 12。
- 同一分类内的值使用 OR 逻辑，而选定的 tag、category、family 和 standard 字段之间使用 AND 逻辑。在已知类别内使用精确分类进行缩小，然后按名称和属性手动排序。
- 标准可以查询为 ISO 4762、ISO4762 或精确的 standard.designation。
- attributes 对象包含特定于 family 的信息，如 thread、lengthMm、bore1Mm、material、profileSeries、slotSizeMm 以及以毫米为单位的尺寸。
- 零件、GLB 和 PNG URL 模式在 https://www.step.parts 上是可预测的；STEP URL 与环境相关。使用目录/API 的 stepUrl 进行下载。