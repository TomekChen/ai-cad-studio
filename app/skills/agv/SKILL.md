---
name: agv
description: AGV底盘参数化建模 (CadQuery)，从自然语言需求生成AGV底盘STEP实体模型，支持SolidWorks导入和物理仿真。
---

# AGV 底盘参数化建模

## 目的

从自然语言需求创建 AGV（自动导引车）底盘参数化 CAD 模型，生成经过验证的 STEP 工件，可直接导入 SolidWorks 进行物理仿真和干涉检测。

## 使用场景

适用场景包括用户请求 AGV 底盘、移动机器人底盘、四轮驱动平台、仓储物流车底盘等。用户可以用自然语言描述尺寸、承载能力、轮距等参数。

## 参数说明

所有尺寸单位为毫米 (mm)：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| chassis_length | 1200 | 底盘长度 (600-3000) |
| chassis_width | 800 | 底盘宽度 (400-1500) |
| plate_thickness | 8 | 底板厚度 (4-20) |
| rail_width | 60 | 纵梁宽度 |
| rail_height | 120 | 纵梁高度 |
| rail_thickness | 5 | 纵梁壁厚 |
| cross_count | 3 | 横梁数量 (1-6) |
| wheel_radius | 100 | 轮子半径 |
| wheel_base | 900 | 轴距 (通常=长度*0.75) |
| wheel_track | 650 | 轮距 (通常=宽度*0.8) |
| battery_length | 400 | 电池仓长度 |
| battery_width | 300 | 电池仓宽度 |
| battery_height | 100 | 电池仓高度 |
| motor_mount_width | 80 | 电机安装座宽度 |
| motor_mount_height | 60 | 电机安装座高度 |
| mount_hole_diameter | 10 | 安装孔径 |
| mount_hole_count_x | 6 | X方向安装孔数 |
| mount_hole_count_y | 4 | Y方向安装孔数 |

## 承载能力自动换算

- 轻载 (<100kg): 使用默认板厚和纵梁尺寸
- 中载 (100-500kg): 板厚和纵梁加厚 20%
- 重载 (>500kg): 板厚和纵梁加厚 40%

## 工具与路径



## 默认约定

- 单位：毫米
- 输出：闭合 STEP 实体，可直接导入 SolidWorks
- 四轮驱动布局，对称结构
- 包含电池仓、电机安装座、安装孔、加强筋

## 示例

用户："做一个1.5米长、0.6米宽的AGV底盘，四轮驱动，能承载200公斤"

参数提取：
- chassis_length: 1500
- chassis_width: 600
- wheel_base: 1125 (75%长度)
- wheel_track: 480 (80%宽度)
- plate_thickness: 10 (中载加厚)
- rail_height: 144 (中载加厚20%)
