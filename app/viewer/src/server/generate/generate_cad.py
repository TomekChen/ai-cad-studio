#!/usr/bin/env python3
"""
CAD Generation Service - Conversational text-to-CAD pipeline.
Reads a JSON request from stdin, calls an OpenAI-compatible LLM API,
executes generated build123d code, and outputs JSON result to stdout.

Env vars:
  LLM_BASE_URL  - OpenAI-compatible API base (default: http://localhost:11434/v1)
  LLM_API_KEY   - API key (default: "ollama")
  LLM_MODEL     - Model name (default: qwen2.5-coder:14b)
"""

import json
import os
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path
from urllib.parse import quote

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1").rstrip("/")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "ollama")
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen2.5-coder:14b")

# Script location: <project_root>/viewer/src/server/generate/generate_cad.py
#   parent^5 = project root (contains skills/ and packages/cadpy)
#   parent^4 = viewer root (matches the Node middleware's GENERATED_DIR = viewer/generated)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
SKILLS_DIR = PROJECT_ROOT / "skills"
OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "generated"


# ---------------------------------------------------------------------------
# Real-time progress streaming (chain-of-thought for the UI)
# ---------------------------------------------------------------------------
# Progress events are printed as single-line JSON objects carrying an "event"
# field, flushed immediately so the Node middleware can relay them to the
# browser as they happen. The FINAL result is printed last WITHOUT an "event"
# field, which lets the middleware distinguish progress from the result.
def emit_event(event: str, **data) -> None:
    try:
        print(json.dumps({"event": event, **data}, ensure_ascii=False), flush=True)
    except Exception:
        pass

# ---------------------------------------------------------------------------
# Skill discovery (dynamically enumerates every skill under skills/)
# ---------------------------------------------------------------------------
# Per-skill execution profile. Skills not listed here fall back to "advise"
# mode (the assistant answers using the skill's knowledge but produces no file).
#   mode:  "python"  -> execute the generated Python script, collect artifacts
#          "text"    -> save the extracted code block as a text artifact
#          "advise"  -> no artifact, return the assistant's guidance as reply
#   ext:     artifact file extension
#   entry:   (python mode) function name the LLM must define (legacy contract)
#   runner:  (python mode) appended __main__ that calls entry -> output file
SKILL_PROFILES = {
    "cad": {
        "mode": "python", "ext": "step", "entry": "gen_step",
        # Defensive runner: the model may export output.step itself (returning
        # None) OR return a build123d object. Handle both, and don't re-run if
        # the artifact already exists.
        "runner": (
            "import os, traceback\n"
            "if not os.path.exists('output.step'):\n"
            "    _result = None\n"
            "    try:\n"
            "        _result = gen_step()\n"
            "    except Exception as _e:\n"
            "        print('GEN_STEP_ERROR: ' + str(_e))\n"
            "        traceback.print_exc()\n"
            "    if _result is not None:\n"
            "        try:\n"
            "            from build123d import export_step\n"
            "            export_step(_result, 'output.step')\n"
            "        except Exception as _e2:\n"
            "            print('EXPORT_ERROR: ' + str(_e2))\n"
            "            traceback.print_exc()\n"
            "print('OK' if os.path.exists('output.step') else 'NO_OUTPUT')\n"
        ),
    },
    "dxf": {
        "mode": "python", "ext": "dxf", "entry": "gen_dxf",
        # Defensive runner: the model may define gen_dxf() (zero args, writing
        # the file itself) OR gen_dxf(path). Detect the signature and call
        # accordingly; if a differently-named .dxf is produced, adopt it.
        "runner": (
            "import os, inspect\n"
            "def _call_gen_dxf():\n"
            "    try:\n"
            "        _ps = list(inspect.signature(gen_dxf).parameters.values())\n"
            "        _req = sum(1 for _p in _ps if _p.default is inspect.Parameter.empty "
            "and _p.kind in (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD))\n"
            "    except (ValueError, TypeError):\n"
            "        _req = -1\n"
            "    if _req >= 1:\n"
            "        gen_dxf('output.dxf')\n"
            "    else:\n"
            "        gen_dxf()\n"
            "if not os.path.exists('output.dxf'):\n"
            "    try:\n"
            "        _call_gen_dxf()\n"
            "    except NameError:\n"
            "        pass\n"
            "    except TypeError:\n"
            "        try:\n"
            "            gen_dxf()\n"
            "        except TypeError:\n"
            "            gen_dxf('output.dxf')\n"
            "if not os.path.exists('output.dxf'):\n"
            "    _cands = [f for f in os.listdir('.') if f.lower().endswith('.dxf')]\n"
            "    if _cands:\n"
            "        os.replace(_cands[0], 'output.dxf')\n"
            "print('OK' if os.path.exists('output.dxf') else 'NO_OUTPUT')\n"
        ),
    },
    "gcode": {"mode": "python", "ext": "gcode"},
    "implicit-cad": {"mode": "text", "ext": "glsl"},
    "urdf": {"mode": "text", "ext": "urdf"},
    "sdf": {"mode": "text", "ext": "sdf"},
    "srdf": {"mode": "text", "ext": "srdf"},
    "sendcutsend": {"mode": "text", "ext": "dxf"},
    "agv": {
        "mode": "python", "ext": "step", "entry": "gen_step",
        "runner": (
            "import os, sys, traceback\n"
            "# Force AGV template usage - no free-form modeling allowed\n"
            "_template_dir = os.path.join(os.path.dirname(os.path.abspath('__file__')), 'app', 'skills', 'agv', 'scripts')\n"
            "if _template_dir not in sys.path:\n"
            "    sys.path.insert(0, _template_dir)\n"
            "try:\n"
            "    from agv_chassis import build_agv_chassis\n"
            "    import cadquery as cq\n"
            "    _params = _params if '_params' in dir() else {}\n"
            "    model = build_agv_chassis(**_params)\n"
            "    _step_path = os.path.join(output_dir, 'output.step')\n"
            "    cq.exporters.export(model, _step_path)\n"
            "    print('OK' if os.path.exists(_step_path) else 'NO_OUTPUT')\n"
            "except Exception as _e:\n"
            "    print('TEMPLATE_ERROR: ' + str(_e))\n"
            "    traceback.print_exc()\n"
        ),
    },
}

# Human-friendly labels / icons for the UI (fallback derives from the id).
SKILL_LABELS = {
    "cad": "STEP 参数化建模 (build123d)",
    "implicit-cad": "隐式 CAD (GLSL SDF)",
    "dxf": "2D DXF 工程图 (ezdxf)",
    "gcode": "3D 打印切片 G-code",
    "urdf": "机器人 URDF 模型",
    "sdf": "仿真世界 SDF",
    "srdf": "语义机器人 SRDF",
    "step-parts": "标准件库 (step.parts)",
    "sendcutsend": "制造可行性校验",
    "cad-viewer": "CAD Viewer 服务",
    "bambu-labs": "Bambu Lab 打印控制",
    "agv": "AGV底盘参数化建模 (CadQuery)",
}

SKILL_ICONS = {
    "cad": "⚙️", "implicit-cad": "🫧", "dxf": "📐", "gcode": "🖨️",
    "urdf": "🦾", "sdf": "🌍", "srdf": "🧠", "step-parts": "🔩",
    "sendcutsend": "✂️", "cad-viewer": "🖥️", "bambu-labs": "🎛️", "agv": "🚗",
}


def _parse_skill_md(skill_dir: Path) -> dict:
    """Parse a skill folder's SKILL.md into name / description / body."""
    md_path = skill_dir / "SKILL.md"
    text = ""
    if md_path.is_file():
        try:
            text = md_path.read_text(encoding="utf-8")
        except Exception:
            text = md_path.read_text(encoding="utf-8", errors="replace")
    name = skill_dir.name
    description = ""
    body = text
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            frontmatter, body = parts[1], parts[2].strip()
            for line in frontmatter.splitlines():
                low = line.strip().lower()
                if low.startswith("name:"):
                    name = line.split(":", 1)[1].strip() or name
                elif low.startswith("description:"):
                    description = line.split(":", 1)[1].strip()
    return {"name": name, "description": description, "body": body}


def load_skills() -> dict:
    """Enumerate every skill folder and return metadata keyed by id."""
    skills: dict = {}
    if not SKILLS_DIR.is_dir():
        return skills
    for entry in sorted(SKILLS_DIR.iterdir()):
        if not entry.is_dir() or not (entry / "SKILL.md").is_file():
            continue
        meta = _parse_skill_md(entry)
        profile = SKILL_PROFILES.get(entry.name, {"mode": "advise", "ext": "txt"})
        skills[entry.name] = {
            "id": entry.name,
            "name": meta["name"],
            "label": SKILL_LABELS.get(entry.name, meta["name"]),
            "icon": SKILL_ICONS.get(entry.name, "🧩"),
            "description": meta["description"],
            "body": meta["body"],
            "mode": profile.get("mode", "advise"),
            "ext": profile.get("ext", "txt"),
            "entry": profile.get("entry"),
            "runner": profile.get("runner"),
        }
    return skills


def get_available_skills() -> list:
    """Return the public skill list for the /_generate/skills endpoint."""
    out = []
    for sid, s in load_skills().items():
        out.append({
            "id": sid,
            "label": s["label"],
            "icon": s["icon"],
            "description": s["description"],
            "mode": s["mode"],
            "ext": s["ext"],
        })
    return out


# ---------------------------------------------------------------------------
# System prompt construction
# ---------------------------------------------------------------------------
_BASE_ROLE = (
    "你是「AI CAD Studio」中加载了「{label}」技能的生成助手。"
    "请严格依据下方技能文档中的规范、约定与工作流程来回答用户。"
    "除非用户另有要求，请使用中文进行说明。"
)

_OUTPUT_INSTRUCTIONS = {
    "python": (
        "## 输出要求\n"
        "1. 必须输出**一个** ```python 代码块，内容为完整、可独立运行的 Python 脚本。\n"
        "{entry_line}"
        "2. 脚本运行后须在当前工作目录生成名为 `output.{ext}` 的结果文件。\n"
        "3. 单位使用毫米；仅依赖该技能文档中提到的库与标准库。\n"
        "4. 代码块之后用 1-2 句话简要说明你生成了什么、做了哪些工程假设。"
    ),
    "text": (
        "## 输出要求\n"
        "1. 必须输出**一个**代码块，内容为完整的 `.{ext}` 文件内容"
        "（可使用 ```xml / ```glsl / ```text 等合适的语言标记）。\n"
        "2. 内容须符合该技能文档的格式规范，可直接保存为 `output.{ext}` 使用。\n"
        "3. 代码块之后用 1-2 句话简要说明你生成了什么。"
    ),
    "advise": (
        "## 输出要求\n"
        "该技能偏向流程指导、服务操作或人工决策，无需生成可执行文件。\n"
        "请依据技能文档给出清晰、可操作的步骤说明、建议或校验清单，"
        "并在必要时给出示例代码或配置片段。"
    ),
}

# The cad skill's SKILL.md is a workflow document without concrete API examples,
# so the model tends to hallucinate signatures (e.g. Cone(radius=...), export(...)).
# Inject a correct build123d 0.11 quick reference (verified on the server) to
# ground the generated code.
_BUILD123D_CHEATSHEET = (
    "## build123d API 速查（以下为 0.11 版正确签名，切勿臆造参数）\n"
    "```python\n"
    "from build123d import *\n"
    "# 基本实体（单位：毫米）\n"
    "Box(length, width, height)                    # 长方体\n"
    "Cylinder(radius, height)                      # 圆柱\n"
    "Cone(bottom_radius, top_radius, height)       # 圆台/圆锥（top_radius=0 即圆锥）\n"
    "Sphere(radius)                                # 球体\n"
    "Torus(major_radius, minor_radius)             # 圆环（轮胎、垫圈等）\n"
    "# 向量与坐标\n"
    "v = Vector(x, y, z)                           # 创建向量\n"
    "v.X, v.Y, v.Z                                # 访问分量（大写！不是 .x/.y/.z）\n"
    "v.length                                      # 向量模长（小写属性）\n"
    "(v2 - v1).normalized()                        # 单位方向向量\n"
    "# 布尔运算（实体默认以原点为中心，注意相对位置）\n"
    "a + b    # 并集\n"
    "a - b    # 差集\n"
    "a & b    # 交集\n"
    "# 倒角 / 圆角：参数是【边】而不是实体，用 part.edges() 选取\n"
    "chamfer(part.edges(), length=1.0)             # 对所有边倒角\n"
    "fillet(part.edges(), radius=2.0)              # 对所有边圆角\n"
    "# 移动 / 旋转 / 缩放\n"
    "part.translate((x, y, z))                     # 平移，参数是三元组\n"
    "part.rotate(Axis.X, 角度)                     # 绕 X 轴旋转（度）；Axis.Y / Axis.Z 同理\n"
    "part.rotate(Axis((0,0,0), (1,0,0)), 角度)     # 绕自定义轴旋转\n"
    "part.scale((sx, sy, sz))                      # 非均匀缩放\n"
    "```\n"
    "关键约定：\n"
    "1. `gen_step()` 必须【return】最终的 build123d 实体，**不要自己导出文件**"
    "（没有 `export()` 这个函数；系统会在函数返回后自动用 `export_step` 导出 output.step）。\n"
    "2. build123d **没有** `Cone(radius=...)`、`Cone(radius1=...)`，也**没有** `Chamfer(...)` 构造函数、"
    "没有 `export(...)`。圆锥台用 `Cone(bottom_radius=..., top_radius=..., height=...)`。\n"
    "3. `rotate(axis, 角度)` 只有【两个参数】，axis 必须是 `Axis` 对象（如 `Axis.X`、`Axis.Y`、`Axis.Z` "
    "或 `Axis((0,0,0),(1,0,0))`）。**不要**写成 `rotate((0,0,0), (1,0,0), 角度)` 这种三参数形式。\n"
    "4. **没有 `Ellipsoid`**。需要椭球时用 `Sphere(radius)` 再 `.scale((sx, sy, sz))` 实现。\n"
    "5. Vector 分量访问用**大写** `.X` `.Y` `.Z`，写 `.x` 会报 AttributeError。\n"
    "6. 对于复杂装配体（如自行车），建议将各部件分别建模后用 `+` 合并为 Compound，"
    "避免过多布尔运算导致内核超时。每个部件用简单几何体（Cylinder/Box/Torus）组合即可。\n"
    "完整可运行示例：\n"
    "```python\n"
    "from build123d import *\n"
    "def gen_step():\n"
    "    part = Cylinder(radius=4, height=40)\n"
    "    part = chamfer(part.edges(), length=1.0)\n"
    "    return part\n"
    "```\n"
)


def build_system_prompt(s: dict) -> str:
    parts = [_BASE_ROLE.format(label=s["label"])]
    if s.get("body"):
        parts.append("# 技能文档\n" + s["body"])
    # Ground the model with correct build123d signatures for the cad skill.
    if s.get("id") == "cad":
        parts.append(_BUILD123D_CHEATSHEET)
    instr = _OUTPUT_INSTRUCTIONS.get(s["mode"], _OUTPUT_INSTRUCTIONS["advise"])
    entry_line = (
        f"   - 脚本必须定义函数 `{s['entry']}()` 作为生成入口。\n"
        if s.get("entry") else ""
    )
    parts.append(instr.format(ext=s.get("ext", "txt"), entry_line=entry_line))
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# LLM call
# ---------------------------------------------------------------------------
def resolve_llm_config(override) -> dict:
    """Merge a per-request LLM override (sent by the UI's model selector) over
    the environment defaults. Empty/missing fields fall back to the env config,
    so the built-in "default" model simply sends no override."""
    cfg = {"base_url": LLM_BASE_URL, "api_key": LLM_API_KEY, "model": LLM_MODEL}
    if isinstance(override, dict):
        if override.get("base_url"):
            cfg["base_url"] = str(override["base_url"]).rstrip("/")
        if override.get("api_key"):
            cfg["api_key"] = str(override["api_key"])
        if override.get("model"):
            cfg["model"] = str(override["model"])
    return cfg


def call_llm(messages: list[dict], on_token=None, on_reasoning=None, cfg: dict | None = None) -> str:
    """Call OpenAI-compatible chat completion API.

    If on_token is provided, stream the response and invoke on_token(chunk)
    with incremental text (batched to reduce event volume). If on_reasoning is
    provided, reasoning-chain deltas from deep-thinking / chain-of-thought
    models are streamed live via on_reasoning(chunk) so the UI can show the
    model's thinking process as it happens instead of staying blank until the
    first content token. The full text is still accumulated and returned.
    cfg (from resolve_llm_config) selects the endpoint/key/model; it defaults
    to the environment configuration.
    """
    from openai import OpenAI

    if cfg is None:
        cfg = {"base_url": LLM_BASE_URL, "api_key": LLM_API_KEY, "model": LLM_MODEL}

    client = OpenAI(base_url=cfg["base_url"], api_key=cfg["api_key"])

    if on_token is None:
        response = client.chat.completions.create(
            model=cfg["model"],
            messages=messages,
            temperature=0.2,
            max_tokens=8192,
        )
        return response.choices[0].message.content or ""

    stream = client.chat.completions.create(
        model=cfg["model"],
        messages=messages,
        temperature=0.2,
        max_tokens=8192,
        stream=True,
    )
    chunks = []
    buf = []
    buf_len = 0
    for part in stream:
        try:
            delta = part.choices[0].delta
        except Exception:
            delta = None
        if delta is None:
            continue
        # Reasoning chain (deep-thinking / CoT models) — stream live to the UI.
        if on_reasoning:
            reason = ""
            for attr in ("reasoning_content", "reasoning", "reasoning_details"):
                v = getattr(delta, attr, None)
                if v:
                    reason += v
            if reason:
                on_reasoning(reason)
        content = delta.content or ""
        if not content:
            continue
        chunks.append(content)
        buf.append(content)
        buf_len += len(content)
        if buf_len >= 8:
            on_token("".join(buf))
            buf = []
            buf_len = 0
    if buf:
        on_token("".join(buf))
    return "".join(chunks)


# ---------------------------------------------------------------------------
# Code extraction
# ---------------------------------------------------------------------------
def extract_code(text: str, lang: str = "python") -> str:
    """Extract code from markdown fenced code block."""
    import re
    pattern = rf"```{lang}\s*\n(.*?)```"
    match = re.search(pattern, text, re.DOTALL)
    if match:
        return match.group(1).strip()
    # Fallback: try any code block
    pattern = r"```\w*\s*\n(.*?)```"
    match = re.search(pattern, text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return ""


def extract_description(text: str) -> str:
    """Extract text description after the code block."""
    import re
    # Remove code blocks
    cleaned = re.sub(r"```.*?```", "", text, flags=re.DOTALL).strip()
    # Take first meaningful paragraph
    lines = [l.strip() for l in cleaned.split("\n") if l.strip()]
    return " ".join(lines[:3]) if lines else ""


# ---------------------------------------------------------------------------
# Code execution (cad skill)
# ---------------------------------------------------------------------------
def execute_cad_code(code: str, output_dir: Path) -> dict:
    """Execute build123d code and produce STEP + GLB."""
    output_dir.mkdir(parents=True, exist_ok=True)

    # Write the generator script
    script_path = output_dir / "generated_part.py"
    step_path = output_dir / "generated_part.step"

    # Wrap code to auto-export STEP
    full_code = code + f"""

# --- Auto-export ---
if __name__ == "__main__":
    from build123d import export_step
    import sys
    result = gen_step()
    export_step(result, r"{step_path.as_posix()}")
    print("STEP_OK")
"""
    script_path.write_text(full_code, encoding="utf-8")

    # Execute
    env = os.environ.copy()
    # Add cadpy to path if available
    cadpy_src = SKILLS_DIR.parent / "packages" / "cadpy" / "src"
    if cadpy_src.exists():
        env["PYTHONPATH"] = str(cadpy_src) + os.pathsep + env.get("PYTHONPATH", "")

    result = subprocess.run(
        [sys.executable, str(script_path)],
        capture_output=True,
        text=True,
        timeout=60,
        env=env,
        cwd=str(output_dir),
    )

    if result.returncode != 0:
        return {
            "ok": False,
            "error": f"Code execution failed:\n{result.stderr[-2000:]}",
            "stepPath": "",
        }

    if not step_path.exists():
        return {
            "ok": False,
            "error": "STEP file was not created. Check gen_step() returns a valid solid.",
            "stepPath": "",
        }

    # Generate GLB sidecar for the 3D preview (optional, best-effort)
    glb_path = generate_glb_sidecar(step_path, script_path, env)

    return {
        "ok": True,
        "stepPath": str(step_path),
        "glbPath": glb_path,
        "error": "",
    }


def generate_glb_sidecar(step_path: Path, script_path: Path, env: dict) -> str:
    """Run the cadpy step_artifact pipeline to produce a GLB sidecar.

    Returns the GLB path on success, or an empty string on failure.
    """
    glb_path = step_path.parent / ("." + step_path.name + ".glb")
    repo_root = SKILLS_DIR.parent  # project root (contains packages/cadpy)
    try:
        subprocess.run(
            [
                sys.executable,
                "-m",
                "cadpy.step_artifact",
                "--repo-root",
                str(repo_root),
                "--step",
                str(step_path),
                "--source-path",
                str(script_path),
                "--force",
            ],
            capture_output=True,
            text=True,
            timeout=90,
            env=env,
            cwd=str(repo_root),
        )
    except Exception:
        return ""
    if glb_path.exists():
        return str(glb_path)
    return ""


# ---------------------------------------------------------------------------
# Generic skill execution (dynamic skill system)
# ---------------------------------------------------------------------------
def _python_env() -> dict:
    env = os.environ.copy()
    cadpy_src = SKILLS_DIR.parent / "packages" / "cadpy" / "src"
    if cadpy_src.exists():
        env["PYTHONPATH"] = str(cadpy_src) + os.pathsep + env.get("PYTHONPATH", "")
    return env


def _prepare_code_for_runner(code: str) -> str:
    """Clean generated code so a runner can be safely appended at top level.

    1. Drop any trailing `if __name__ == '__main__':` block the model emitted
       (header + indented body). We supply our own runner, so leaving the
       model's guard in place causes redundant execution.
    2. If the code still ends with a dangling block header (line ending in ':'),
       close it with `pass` so the appended runner doesn't trigger an
       IndentationError.
    """
    import re

    code = code.rstrip()
    lines = code.split("\n")

    # Locate the last top-level `if __name__ == '__main__':` header and strip it
    # together with its body, but only if it is truly a trailing block (everything
    # after it is blank or indented).
    for i in range(len(lines) - 1, -1, -1):
        stripped = lines[i].strip()
        if re.match(r"^if\s+__name__\s*==\s*['\"]__main__['\"]\s*:", stripped) and lines[i][:1] not in (" ", "\t"):
            tail = lines[i + 1:]
            if all((not l.strip()) or l[:1] in (" ", "\t") for l in tail):
                lines = lines[:i]
            break  # only consider the last such header

    code = "\n".join(lines).rstrip()

    # Close a dangling block header so the appended runner stays at top level.
    last = ""
    for l in reversed(code.split("\n")):
        if l.strip():
            last = l
            break
    if last.rstrip().endswith(":"):
        code = code + "\n    pass"

    return code


def execute_python_skill(code: str, s: dict, output_dir: Path) -> dict:
    """Run a generated Python script and collect the produced artifact(s)."""
    output_dir.mkdir(parents=True, exist_ok=True)
    ext = s.get("ext", "txt")
    script_path = output_dir / "generated.py"
    output_name = f"output.{ext}"
    output_path = output_dir / output_name

    full_code = code
    if s.get("runner"):
        # The script is always run directly, so append the defensive runner at
        # top level (no __main__ wrap, which previously broke indentation).
        full_code = _prepare_code_for_runner(code) + "\n\n" + s["runner"]
    script_path.write_text(full_code, encoding="utf-8")

    env = _python_env()
    try:
        result = subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=True, text=True, timeout=180,
            env=env, cwd=str(output_dir),
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "脚本执行超时（180s），模型可能过于复杂。", "files": []}

    if result.returncode != 0:
        err_text = result.stderr or result.stdout
        # Drop the harmless "Fontconfig error: ..." warning build123d's font
        # manager prints at import time; it is noise, not the real failure.
        err_lines = [ln for ln in err_text.splitlines() if "Fontconfig error" not in ln]
        err_text = "\n".join(err_lines)
        return {
            "ok": False,
            "error": f"代码执行失败：\n{err_text[-2000:]}",
            "files": [],
        }
    if not output_path.exists():
        # The defensive runner prints GEN_STEP_ERROR / EXPORT_ERROR to stdout
        # when gen_step() or export fails but the script exits cleanly (code 0).
        # Extract that detail so the retry loop gets actionable feedback.
        detail = ""
        if result.stdout:
            for ln in result.stdout.splitlines():
                if ln.startswith("GEN_STEP_ERROR:") or ln.startswith("EXPORT_ERROR:"):
                    detail += ln + "\n"
            # Also grab the traceback lines that follow
            tb_lines = []
            in_tb = False
            for ln in result.stdout.splitlines():
                if ln.startswith("Traceback"):
                    in_tb = True
                if in_tb:
                    tb_lines.append(ln)
            if tb_lines:
                detail += "\n".join(tb_lines[-6:]) + "\n"
        err_msg = f"脚本未生成 {output_name}，请检查生成代码是否正确写出结果文件。"
        if detail.strip():
            err_msg += f"\n运行时报错：\n{detail.strip()[-1500:]}"
        return {
            "ok": False,
            "error": err_msg,
            "files": [],
        }

    files = [{"name": output_name, "path": str(output_path), "type": ext}]
    preview_url = ""
    preview_name = ""

    # STEP -> also build a GLB sidecar so the 3D preview works.
    if ext in ("step", "stp"):
        emit_event("status", stage="preview", text="模型构建成功，正在转换为可预览的 GLB 格式…")
        glb = generate_glb_sidecar(output_path, script_path, env)
        if glb:
            files.append({"name": output_name + ".glb", "path": glb, "type": "glb"})
            preview_url = f"/_generate/file?path={quote(glb)}"
            preview_name = output_name + ".glb"

    return {"ok": True, "files": files, "previewUrl": preview_url, "previewName": preview_name, "error": ""}


def save_text_skill(code: str, s: dict, output_dir: Path) -> dict:
    """Save an extracted code block as a text artifact (urdf/sdf/srdf/glsl/...)."""
    output_dir.mkdir(parents=True, exist_ok=True)
    ext = s.get("ext", "txt")
    output_name = f"output.{ext}"
    output_path = output_dir / output_name
    output_path.write_text(code, encoding="utf-8")
    return {
        "ok": True,
        "files": [{"name": output_name, "path": str(output_path), "type": ext}],
        "previewUrl": "",
        "previewName": "",
        "error": "",
    }


# ---------------------------------------------------------------------------
# Main handler
# ---------------------------------------------------------------------------
def handle_request(request: dict) -> dict:
    """Process a generation request."""
    skill = request.get("skill", "cad")
    messages = request.get("messages", [])
    action = request.get("action", "chat")
    # Per-request model override from the UI's model selector (None = use the
    # server's default env-configured model).
    llm_cfg = resolve_llm_config(request.get("llm"))

    # List skills
    if action == "list_skills":
        return {"ok": True, "skills": get_available_skills()}

    # Config check
    if action == "config":
        return {
            "ok": True,
            "config": {
                "baseUrl": LLM_BASE_URL,
                "model": LLM_MODEL,
                "configured": bool(LLM_BASE_URL),
            },
        }

    # Chat generation
    if not messages:
        return {"ok": False, "error": "No messages provided."}

    skills = load_skills()
    if skill not in skills:
        return {
            "ok": False,
            "error": f"未知技能：{skill}。可用技能：{', '.join(skills.keys())}",
        }
    s = skills[skill]

    # Build LLM messages from the skill's own documentation
    system_prompt = build_system_prompt(s)
    llm_messages = [{"role": "system", "content": system_prompt}] + messages

    # Chain-of-thought: tell the UI we're designing + writing code, then relay
    # the LLM's tokens live so the user watches the code being written.
    emit_event("status", stage="code", text="正在设计建模方案，编写参数化代码…")

    # Call LLM (stream tokens for artifact-producing modes; advise stays plain)
    stream_tokens = s["mode"] in ("python", "text")
    try:
        llm_reply = call_llm(
            llm_messages,
            on_token=(lambda t: emit_event("token", text=t)) if stream_tokens else None,
            on_reasoning=(lambda t: emit_event("reasoning", text=t)) if stream_tokens else None,
            cfg=llm_cfg,
        )
    except Exception as e:
        return {
            "ok": False,
            "error": f"LLM API 调用失败：{e}。请检查 API 地址（{llm_cfg['base_url']}）、API Key 与模型 ID（{llm_cfg['model']}）。",
            "reply": "",
            "code": "",
        }

    description = extract_description(llm_reply)

    # ---- advise mode: guidance only, no artifact ----
    if s["mode"] == "advise":
        return {
            "ok": True,
            "reply": llm_reply.strip() or "（该技能未返回内容）",
            "code": "",
            "files": [],
        }

    # ---- python / text modes: extract a code block first ----
    code = extract_code(llm_reply, "python" if s["mode"] == "python" else "")
    if not code:
        return {
            "ok": False,
            "error": "模型未输出代码块，请尝试更具体地描述需求。",
            "reply": llm_reply,
            "code": "",
        }

    timestamp = __import__("time").strftime("%Y%m%d_%H%M%S")
    output_dir = OUTPUT_DIR / f"{skill}_{timestamp}"

    if s["mode"] == "python":
        emit_event("status", stage="build", text="代码生成完毕，正在调用 build123d 构建三维模型…")
        exec_result = execute_python_skill(code, s, output_dir)

        # Error-feedback retry: if the code failed to run, hand the error back to
        # the model so it can self-correct (e.g. wrong library API signatures).
        max_retries = 2
        attempt = 0
        retry_messages = list(messages)
        while not exec_result["ok"] and attempt < max_retries:
            attempt += 1
            emit_event(
                "status", stage="retry",
                text=f"首次构建未成功，正在自动修正代码（第 {attempt}/{max_retries} 次）…",
            )
            fix_prompt = (
                "你上一次生成的代码运行失败，报错如下：\n"
                f"{exec_result['error'][-1500:]}\n\n"
                "请定位并修正错误，重新输出**完整**的 ```python 代码块（不要只给补丁）。"
                "注意严格使用该技能文档中记载的 API。"
            )
            retry_messages = retry_messages + [
                {"role": "assistant", "content": code},
                {"role": "user", "content": fix_prompt},
            ]
            try:
                retry_reply = call_llm(
                    [{"role": "system", "content": system_prompt}] + retry_messages,
                    on_token=lambda t: emit_event("token", text=t),
                    on_reasoning=lambda t: emit_event("reasoning", text=t),
                    cfg=llm_cfg,
                )
            except Exception:
                break
            new_code = extract_code(retry_reply, "python")
            if not new_code or new_code.strip() == code.strip():
                break
            code = new_code
            output_dir = OUTPUT_DIR / f"{skill}_{timestamp}_r{attempt}"
            exec_result = execute_python_skill(code, s, output_dir)
            if exec_result["ok"]:
                description = extract_description(retry_reply) or description
                break
    else:  # text
        exec_result = save_text_skill(code, s, output_dir)

    if not exec_result["ok"]:
        return {
            "ok": False,
            "error": exec_result["error"],
            "reply": description or llm_reply,
            "code": code,
        }

    result = {
        "ok": True,
        "reply": description or "生成完成。",
        "code": code,
        "files": exec_result.get("files", []),
    }
    if exec_result.get("previewUrl"):
        result["previewUrl"] = exec_result["previewUrl"]
        result["previewName"] = exec_result.get("previewName", "")
    
    # Add documentation links for AGV skill
    if skill == "agv":
        result["docs"] = [
            {
                "name": "SolidWorks 导入验证指南",
                "path": "/docs/SolidWorks_导入验证指南.docx",
                "type": "docx",
                "description": "详细的 SolidWorks 导入步骤和验证方法"
            },
            {
                "name": "AGV 用户使用手册",
                "path": "/docs/AGV_User_Manual.html",
                "type": "html",
                "description": "平台功能介绍和参数说明"
            },
            {
                "name": "AGV 测试提示词",
                "path": "/docs/agv_test_prompts.md",
                "type": "md",
                "description": "8 个经过验证的测试提示词"
            }
        ]
    return result


if __name__ == "__main__":
    try:
        request = json.loads(sys.stdin.read())
        result = handle_request(request)
    except Exception as e:
        result = {"ok": False, "error": f"Internal error: {traceback.format_exc()}"}
    print(json.dumps(result, ensure_ascii=False))
