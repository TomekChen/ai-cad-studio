---
name: agv
description: AGV底盘参数化建模 (CadQuery)，从自然语言需求生成AGV底盘STEP实体模型，支持SolidWorks导入和物理仿真。
---

# AGV 底盘参数化建模

## 目的

从自然语言需求创建 AGV（自动导引车）底盘参数化 CAD 模型，生成经过验证的 STEP 工件，可直接导入 SolidWorks 进行物理仿真和干涉检测。

## ⚠️ 强制约束（必须遵守）

**禁止自由建模**：你必须使用预定义的 `agv_chassis.py` 模板，只提取参数填入模板。

**错误做法** ：
```python
def gen_step(params=None):
    chassis = cq.Workplane("XY").box(...)  # 不要自己写建模逻辑！
```

**正确做法** ✅：
```python
def gen_step(params=None):
    import sys, os
    # 添加模板路径
    _template_dir = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'skills', 'agv', 'scripts')
    if _template_dir not in sys.path:
        sys.path.insert(0, _template_dir)
    from agv_chassis import build_agv_chassis
    import cadquery as cq
    
    # 只提取参数，不要写建模逻辑
    _params = {
        "chassis_length": 600,
        "chassis_width": 300,
        "plate_thickness": 8,
        "rail_width": 60,
        "rail_height": 120,
        "rail_thickness": 5,
        "cross_count": 3,
        "cross_width": 40,
        "cross_height": 60,
        "wheel_radius": 100,
        "wheel_base": 450,
        "wheel_track": 240,
        "axle_diameter": 20,
        "battery_length": 200,
        "battery_width": 150,
        "battery_height": 80,
        "battery_offset_x": 0,
        "motor_mount_width": 60,
        "motor_mount_height": 50,
        "motor_bolt_diameter": 8,
        "mount_hole_diameter": 10,
        "mount_hole_count_x": 4,
        "mount_hole_count_y": 3,
        "plate_fillet": 5,
    }
    
    model = build_agv_chassis(**_params)
    output_dir = '/workspace/root/projects/ai-cad-studio/app/viewer/generated'
    os.makedirs(output_dir, exist_ok=True)
    step_path = os.path.join(output_dir, 'output.step')
    cq.exporters.export(model, step_path)
    return step_path
```

## 参数提取规则

- 用户说"0.6 米长" → `chassis_length: 600`
- 用户说"承载 50 公斤" → 轻载，用默认板厚 8mm
- 用户说"承载 200 公斤" → 中载，板厚加厚 20%（10mm），纵梁加厚 20%
- 用户说"承载 800 公斤" → 重载，板厚加厚 40%（11mm），纵梁加厚 40%
- 用户没说轮子大小 → 用默认值 100mm
- 轴距 = 长度 × 0.75（除非用户指定）
- 轮距 = 宽度 × 0.8（除非用户指定）

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

```bash
python scripts/agv_chassis.py [--params JSON_FILE] [--output DIR]
```

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
