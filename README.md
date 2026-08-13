# AI CAD Studio

AI 驱动的 CAD 参数化设计平台，支持从自然语言需求生成工业级 STEP 实体模型。

## 🚀 快速开始

```bash
# 克隆项目
git clone https://github.com/TomekChen/ai-cad-studio.git
cd ai-cad-studio

# 启动服务
bash start-daemon.sh

# 访问 http://localhost:8800
```

## ✨ 核心特性

###  AI 驱动的参数化建模

- **自然语言输入**：用中文描述你的设计需求
- **智能参数提取**：LLM 自动提取尺寸、材料、工艺等参数
- **多 Skill 支持**：支持多种 CAD 建模引擎

###  支持的建模 Skill

| Skill | 图标 | 说明 | 输出格式 |
|-------|------|------|----------|
| **cad** | ⚙️ | STEP 参数化建模 (build123d) | `.step` |
| **agv** |  | AGV 底盘参数化建模 (CadQuery) | `.step` |
| **dxf** | 📐 | 2D DXF 工程图 (ezdxf) | `.dxf` |
| **gcode** | 🖨️ | 3D 打印切片 G-code | `.gcode` |
| **urdf** | 🦾 | 机器人 URDF 模型 | `.urdf` |
| **implicit-cad** | 🫧 | 隐式 CAD (GLSL SDF) | `.glsl` |

### 🚗 AGV 底盘参数化建模 (新增)

**版本**: v0.4.0 (2026-08-13)

专为 AGV（自动导引车）底盘设计的参数化建模工具，生成的 STEP 文件可直接导入 SolidWorks 进行物理仿真和干涉检测。

#### 功能特性

- **28 个可调参数**：底盘尺寸、纵梁、横梁、轮距、轴距、电池仓、电机座、安装孔等
- **承载能力自动换算**：
  - 轻载 (<100kg): 默认板厚和纵梁尺寸
  - 中载 (100-500kg): 板厚和纵梁加厚 20%
  - 重载 (>500kg): 板厚和纵梁加厚 40%
- **完整 B-rep 实体**：输出包含 160+ 面、400+ 边的精确几何体
- **SolidWorks 兼容**：生成的 STEP 文件可直接导入，支持有限元分析和干涉检测

#### 使用示例

**自然语言描述**：
```
做一个 1.5 米长、0.6 米宽的 AGV 底盘，四轮驱动，能承载 200 公斤
```

**自动提取的参数**：
```json
{
  "chassis_length": 1500,
  "chassis_width": 600,
  "wheel_base": 1125,
  "wheel_track": 480,
  "plate_thickness": 10,
  "rail_height": 144,
  "rail_thickness": 6
}
```

**输出**：
- `agv_chassis.step` (520KB) - SolidWorks 可导入的实体模型
- `agv_chassis.stl` (540KB) - Web 预览用的网格模型

#### 参数说明

| 参数 | 默认值 | 范围 | 说明 |
|------|--------|------|------|
| `chassis_length` | 1200 | 600-3000 | 底盘长度 (mm) |
| `chassis_width` | 800 | 400-1500 | 底盘宽度 (mm) |
| `plate_thickness` | 8 | 4-20 | 底板厚度 (mm) |
| `rail_height` | 120 | 80-200 | 纵梁高度 (mm) |
| `wheel_base` | 900 | auto | 轴距 (mm, 通常=长度×0.75) |
| `wheel_track` | 650 | auto | 轮距 (mm, 通常=宽度×0.8) |
| `battery_length` | 400 | 200-600 | 电池仓长度 (mm) |
| `motor_mount_width` | 80 | 60-120 | 电机安装座宽度 (mm) |
| `mount_hole_count_x` | 6 | 4-10 | X 方向安装孔数 |
| `mount_hole_count_y` | 4 | 2-8 | Y 方向安装孔数 |

### 🎯 工作流程

```
用户输入自然语言描述
    ↓
LLM 提取参数 (DeepSeek / Qwen / GPT-4)
    ↓
选择 Skill (cad / agv / dxf / ...)
    ↓
执行 Python 建模脚本
    ↓
生成 STEP/STL/DXF 等工件
    ↓
3D 预览 + 下载
```

## 🛠️ 技术栈

### 前端
- React 18 + Vite
- Three.js (cadjs 渲染引擎)
- Tailwind CSS + Radix UI

### 后端
- Node.js HTTP Server (原生)
- Python 3.12 (建模引擎)
- CadQuery 2.8.0 + OpenCASCADE
- build123d 0.11.1

### AI
- 支持 OpenAI 兼容 API
- 预设提供商：百炼、DeepSeek、OpenAI、Moonshot、智谱、Ollama

## 📦 项目结构

```
ai-cad-studio/
├── app/
│   ├── viewer/              # 前端应用
│   │   ├── src/
│   │   │   ├── client/      # React 组件
│   │   │   └── server/      # Node.js 服务端
│   │   │       ├── generate/
│   │   │       │   ── generate_cad.py  # AI 生成管道
│   │   │       └── step/    # STEP 处理
│   │   ── packages/
│   │       └── cadjs/       # 3D 渲染引擎
│   └── skills/              # 建模 Skill
│       ├── cad/             # STEP 参数化建模
│       ├── agv/             # AGV 底盘建模 (新增)
│       ├── dxf/             # 2D 工程图
│       └── ...
├── start-daemon.sh          # 启动脚本
└── README.md
```

## 🔧 开发指南

### 添加新 Skill

1. 在 `app/skills/` 下创建目录
2. 编写 `SKILL.md` (元数据 + 说明)
3. 在 `scripts/` 下放置建模脚本
4. 在 `generate_cad.py` 的 `SKILL_PROFILES` 注册

### 环境要求

- Node.js 22+
- Python 3.12+
- Miniconda (推荐，持久化 Python 环境)

### 持久化配置

本项目设计为可在容器/云环境中持久化运行：

- Python 环境：`~/miniconda3` (重启不丢失)
- 项目代码：`~/projects/ai-cad-studio/`
- 虚拟环境：`app/viewer/.venv` (指向 Miniconda Python)

## 📄 License

Private - 内部使用

## 🙏 致谢

- [CadQuery](https://github.com/CadQuery/cadquery) - 参数化 CAD 引擎
- [build123d](https://github.com/gumyr/build123d) - OpenCASCADE Python 封装
- [Three.js](https://threejs.org/) - 3D 渲染

---

**版本历史**:
- v0.4.0 (2026-08-13): 新增 AGV 底盘参数化建模 Skill
- v0.3.9 (2026-08-10): 初始版本，支持 build123d STEP 建模
