import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Box,
  Download,
  FileCode2,
  Loader2,
  PenTool,
  Route,
  Bot,
} from "lucide-react";
import CadPreview from "./CadPreview";

/**
 * Unified middle preview pane for every generation skill.
 *
 * The `preview` descriptor decides which renderer to use:
 *   - model3d   → 3D GLB (cad skill, STEP→GLB)            [CadPreview]
 *   - drawing2d → 2D DXF engineering drawing                [DxfViewer]
 *   - toolpath  → 3D-print G-code toolpath                  [GcodeViewer]
 *   - robot     → URDF robot (primitive geometry)           [UrdfViewer]
 *   - code      → syntax/text viewer (sdf/srdf/glsl/advise) [CodeViewer]
 *
 * Every non-3D renderer degrades gracefully to the CodeViewer if parsing or
 * rendering fails, so the middle pane is NEVER empty for a generated artifact.
 */
export default function PreviewPane({ preview }) {
  if (!preview) return <EmptyState />;
  if (preview.mode === "model3d") {
    return <CadPreview url={preview.url || ""} fileName={preview.fileName || ""} />;
  }
  return <FilePreview preview={preview} />;
}

// ---------------------------------------------------------------------------
// Empty state (no generation yet)
// ---------------------------------------------------------------------------
function EmptyState() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1a1d23]">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Box className="size-10 text-muted-foreground/40" />
          <p className="max-w-[280px] text-sm text-muted-foreground/70">
            生成的 CAD 模型、图纸、刀路与机器人将在此处预览。
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// File-type descriptive labels
// ---------------------------------------------------------------------------
const EXT_LABELS = {
  sdf: "Gazebo 仿真描述文件（SDF）",
  srdf: "MoveIt 语义机器人配置（SRDF）",
  urdf: "机器人描述文件（URDF）",
  glsl: "隐式 CAD 着色器（GLSL SDF）",
  gcode: "3D 打印刀路（G-code）",
  dxf: "2D 工程图（DXF）",
  step: "STEP 三维模型",
  md: "生成说明",
  txt: "文本文件",
};

function extOf(name = "") {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}

// ---------------------------------------------------------------------------
// FilePreview: resolves content (fetch output file or use inline code) and
// dispatches to the format-appropriate viewer with a code-view fallback.
// ---------------------------------------------------------------------------
function FilePreview({ preview }) {
  const mode = preview.mode;
  const needsFetch =
    (mode === "drawing2d" || mode === "toolpath") && !!preview.filePath;

  const [content, setContent] = useState(needsFetch ? null : preview.inline || "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    if (needsFetch) {
      setContent(null);
      fetch(`/_generate/file?path=${encodeURIComponent(preview.filePath)}`)
        .then((r) => r.text())
        .then((t) => {
          if (!cancelled) setContent(t);
        })
        .catch(() => {
          if (!cancelled) setContent(preview.inline || "");
        });
    } else {
      setContent(preview.inline || "");
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.filePath, preview.mode, preview.inline]);

  if (content == null) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[#1a1d23]">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm text-muted-foreground shadow">
            <Loader2 className="size-4 animate-spin" />
            正在读取生成文件…
          </div>
        </div>
      </div>
    );
  }

  const fallback = (
    <CodeViewer
      content={content}
      fileName={preview.fileName}
      filePath={preview.filePath}
      note="该文件无法图形化预览，以下为生成内容。"
    />
  );

  if (failed) return fallback;

  const onFail = () => setFailed(true);

  if (mode === "drawing2d") {
    return <DxfViewer content={content} fileName={preview.fileName} filePath={preview.filePath} onFail={onFail} />;
  }
  if (mode === "toolpath") {
    return <GcodeViewer content={content} fileName={preview.fileName} filePath={preview.filePath} onFail={onFail} />;
  }
  if (mode === "robot") {
    return <UrdfViewer content={content} fileName={preview.fileName} filePath={preview.filePath} onFail={onFail} />;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Shared chrome: file-name badge + download button overlay
// ---------------------------------------------------------------------------
function PreviewBadge({ fileName, filePath, content, icon: Icon, hint }) {
  const handleDownload = () => {
    if (filePath) {
      const a = document.createElement("a");
      a.href = `/_generate/file?path=${encodeURIComponent(filePath)}`;
      a.download = fileName || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (content != null) {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  };
  return (
    <>
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-md border border-border/40 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur">
        {Icon ? <Icon className="size-3.5 text-primary" /> : null}
        <span className="max-w-[220px] truncate">{fileName}</span>
      </div>
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-background/70 px-2 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:border-primary/50 hover:text-primary"
          title={`下载 ${fileName || "文件"}`}
        >
          <Download className="size-3.5" />
          下载
        </button>
      </div>
      {hint ? (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border/40 bg-background/70 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
          {hint}
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// CodeViewer — universal text/code preview (sdf / srdf / glsl / advise / fallback)
// ---------------------------------------------------------------------------
function CodeViewer({ content, fileName, filePath, note }) {
  const ext = extOf(fileName);
  const label = EXT_LABELS[ext] || EXT_LABELS.txt;
  const lines = useMemo(() => String(content || "").split("\n"), [content]);
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#1a1d23] text-foreground">
      <PreviewBadge fileName={fileName} filePath={filePath} content={content} icon={FileCode2} />
      <div className="flex items-center gap-2 border-b border-border/50 bg-background/40 px-4 py-2 pl-4">
        <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          {ext ? ext.toUpperCase() : "TEXT"}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      {note ? (
        <p className="border-b border-border/40 bg-muted/30 px-4 py-1.5 text-[11px] text-muted-foreground">
          {note}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse font-mono text-[12px] leading-relaxed">
          <tbody>
            {lines.map((ln, i) => (
              <tr key={i} className="align-top">
                <td className="w-10 select-none border-r border-border/30 px-2 text-right text-muted-foreground/40">
                  {i + 1}
                </td>
                <td className="whitespace-pre px-3 text-foreground/85">{ln || " "}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===========================================================================
// DXF 2D viewer
// ===========================================================================
function parseDxfEntities(text) {
  const raw = String(text || "").split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const code = parseInt(raw[i].trim(), 10);
    if (!Number.isNaN(code)) pairs.push([code, raw[i + 1]]);
  }
  const g = (groups, c) => {
    const p = groups.find((x) => x[0] === c);
    return p ? parseFloat(p[1]) : undefined;
  };
  const gAll = (groups, c) => groups.filter((x) => x[0] === c).map((x) => parseFloat(x[1]));

  const curves = []; // each: array of [x,y]
  const KNOWN = new Set(["LINE", "CIRCLE", "ARC", "LWPOLYLINE", "POLYLINE", "ELLIPSE", "SPLINE", "POINT"]);

  let i = 0;
  while (i < pairs.length) {
    if (pairs[i][0] !== 0) {
      i++;
      continue;
    }
    const type = String(pairs[i][1]).trim().toUpperCase();
    const groups = [];
    let j = i + 1;
    while (j < pairs.length && pairs[j][0] !== 0) {
      groups.push(pairs[j]);
      j++;
    }

    if (type === "LINE") {
      const x1 = g(groups, 10), y1 = g(groups, 20), x2 = g(groups, 11), y2 = g(groups, 21);
      if ([x1, y1, x2, y2].every((v) => v !== undefined)) curves.push([[x1, y1], [x2, y2]]);
    } else if (type === "CIRCLE") {
      const cx = g(groups, 10), cy = g(groups, 20), r = g(groups, 40);
      if ([cx, cy, r].every((v) => v !== undefined)) curves.push(circlePts(cx, cy, r, 0, 360));
    } else if (type === "ARC") {
      const cx = g(groups, 10), cy = g(groups, 20), r = g(groups, 40);
      let a0 = g(groups, 50), a1 = g(groups, 51);
      if ([cx, cy, r, a0, a1].every((v) => v !== undefined)) {
        if (a1 < a0) a1 += 360;
        curves.push(circlePts(cx, cy, r, a0, a1));
      }
    } else if (type === "LWPOLYLINE") {
      const xs = gAll(groups, 10), ys = gAll(groups, 20);
      const closed = (g(groups, 70) || 0) & 1;
      const pts = [];
      const n = Math.min(xs.length, ys.length);
      for (let k = 0; k < n; k++) pts.push([xs[k], ys[k]]);
      if (closed && pts.length > 1) pts.push(pts[0]);
      if (pts.length >= 2) curves.push(pts);
    } else if (type === "POLYLINE") {
      // gather following VERTEX entities until SEQEND
      const pts = [];
      let k = j;
      while (k < pairs.length) {
        if (pairs[k][0] === 0) {
          const t2 = String(pairs[k][1]).trim().toUpperCase();
          if (t2 === "SEQEND") {
            // consume its groups
            let m = k + 1;
            while (m < pairs.length && pairs[m][0] !== 0) m++;
            j = m;
            break;
          }
          if (t2 === "VERTEX") {
            const vg = [];
            let m = k + 1;
            while (m < pairs.length && pairs[m][0] !== 0) {
              vg.push(pairs[m]);
              m++;
            }
            const vx = g(vg, 10), vy = g(vg, 20);
            if (vx !== undefined && vy !== undefined) pts.push([vx, vy]);
            k = m;
            continue;
          }
          break; // some other entity starts
        }
        k++;
      }
      if (pts.length >= 2) curves.push(pts);
      i = j;
      continue;
    } else if (type === "ELLIPSE") {
      const cx = g(groups, 10), cy = g(groups, 20);
      const mx = g(groups, 11), my = g(groups, 21);
      const ratio = g(groups, 40);
      let t0 = g(groups, 41), t1 = g(groups, 42);
      if ([cx, cy, mx, my, ratio].every((v) => v !== undefined)) {
        const a = Math.hypot(mx, my);
        const b = a * ratio;
        const ang = Math.atan2(my, mx);
        if (t0 === undefined) t0 = 0;
        if (t1 === undefined) t1 = Math.PI * 2;
        const pts = [];
        const steps = 64;
        for (let s = 0; s <= steps; s++) {
          const t = t0 + ((t1 - t0) * s) / steps;
          const ex = a * Math.cos(t), ey = b * Math.sin(t);
          const rx = ex * Math.cos(ang) - ey * Math.sin(ang);
          const ry = ex * Math.sin(ang) + ey * Math.cos(ang);
          pts.push([cx + rx, cy + ry]);
        }
        curves.push(pts);
      }
    } else if (type === "SPLINE") {
      const xs = gAll(groups, 10), ys = gAll(groups, 20);
      const pts = [];
      const n = Math.min(xs.length, ys.length);
      for (let k = 0; k < n; k++) pts.push([xs[k], ys[k]]);
      if (pts.length >= 2) curves.push(pts);
    } else if (type === "POINT") {
      const x = g(groups, 10), y = g(groups, 20);
      if (x !== undefined && y !== undefined) {
        const d = 0.5;
        curves.push([[x - d, y], [x + d, y]]);
        curves.push([[x, y - d], [x, y + d]]);
      }
    } else if (!KNOWN.has(type)) {
      // ignore unknown entity
    }
    i = j;
  }
  return curves;
}

function circlePts(cx, cy, r, a0deg, a1deg) {
  const pts = [];
  const steps = Math.max(8, Math.ceil(Math.abs(a1deg - a0deg) / 5));
  for (let s = 0; s <= steps; s++) {
    const a = ((a0deg + ((a1deg - a0deg) * s) / steps) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function DxfViewer({ content, fileName, filePath, onFail }) {
  const containerRef = useRef(null);
  const viewRef = useRef({ scale: 1, ox: 0, oy: 0 });
  const curvesRef = useRef([]);
  const [, force] = useState(0);

  const curves = useMemo(() => {
    try {
      return parseDxfEntities(content);
    } catch {
      return [];
    }
  }, [content]);

  useEffect(() => {
    if (!curves || curves.length === 0) {
      onFail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curves]);

  // Fit + draw
  useEffect(() => {
    curvesRef.current = curves;
    const container = containerRef.current;
    if (!container || curves.length === 0) return;

    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const c of curves)
      for (const [x, y] of c) {
        if (x < minx) minx = x;
        if (y < miny) miny = y;
        if (x > maxx) maxx = x;
        if (y > maxy) maxy = y;
      }
    if (!isFinite(minx)) return;
    const bw = Math.max(maxx - minx, 1e-6), bh = Math.max(maxy - miny, 1e-6);
    const fit = () => {
      const W = container.clientWidth, H = container.clientHeight;
      const pad = 40;
      const scale = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
      viewRef.current = {
        scale,
        ox: W / 2 - ((minx + maxx) / 2) * scale,
        oy: H / 2 + ((miny + maxy) / 2) * scale,
      };
      draw();
    };

    const draw = () => {
      const W = container.clientWidth, H = container.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let canvas = container.querySelector("canvas");
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
        container.appendChild(canvas);
      }
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#1a1d23";
      ctx.fillRect(0, 0, W, H);
      const { scale, ox, oy } = viewRef.current;
      const tx = (x) => x * scale + ox;
      const ty = (y) => -y * scale + oy;
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "#7fb2ff";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const c of curves) {
        if (c.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(tx(c[0][0]), ty(c[0][1]));
        for (let k = 1; k < c.length; k++) ctx.lineTo(tx(c[k][0]), ty(c[k][1]));
        ctx.stroke();
      }
    };

    fit();

    // interactions
    let dragging = false, lx = 0, ly = 0;
    const onDown = (e) => { dragging = true; lx = e.clientX; ly = e.clientY; };
    const onUp = () => { dragging = false; };
    const onMove = (e) => {
      if (!dragging) return;
      viewRef.current.ox += e.clientX - lx;
      viewRef.current.oy += e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      draw();
    };
    const onWheel = (e) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const v = viewRef.current;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const ns = Math.min(Math.max(v.scale * factor, 1e-4), 1e7);
      // zoom toward cursor
      v.ox = mx - ((mx - v.ox) * ns) / v.scale;
      v.oy = my - ((my - v.oy) * ns) / v.scale;
      v.scale = ns;
      draw();
    };
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    container.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      container.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      container.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curves]);

  const count = curves.length;
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1a1d23]">
      <div ref={containerRef} className="absolute inset-0" />
      <PreviewBadge
        fileName={fileName}
        filePath={filePath}
        content={content}
        icon={PenTool}
        hint="拖拽平移 · 滚轮缩放"
      />
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-md border border-border/40 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur">
        {count} 条图元
      </div>
      <button type="button" className="hidden" onClick={() => force((n) => n + 1)} />
    </div>
  );
}

// ===========================================================================
// G-code toolpath 3D viewer
// ===========================================================================
function parseGcode(text) {
  const lines = String(text || "").split(/\r?\n/);
  let x = 0, y = 0, z = 0, e = 0;
  let abs = true, unit = 1;
  const extrude = [];
  const travel = [];
  const MAX = 400000;
  let count = 0;
  for (const raw of lines) {
    if (count > MAX) break;
    const line = raw.split(";")[0].trim();
    if (!line) continue;
    const tokens = line.split(/\s+/);
    let cmd = null;
    const p = {};
    for (const t of tokens) {
      const letter = t[0].toUpperCase();
      const num = parseFloat(t.slice(1));
      if (letter === "G" || letter === "M") {
        if (cmd === null) cmd = letter + num;
      } else if (!Number.isNaN(num)) {
        p[letter] = num;
      }
    }
    if (cmd === "G90") abs = true;
    else if (cmd === "G91") abs = false;
    else if (cmd === "G20") unit = 25.4;
    else if (cmd === "G21") unit = 1;
    else if (cmd === "G92") {
      if (p.X !== undefined) x = p.X;
      if (p.Y !== undefined) y = p.Y;
      if (p.Z !== undefined) z = p.Z;
      if (p.E !== undefined) e = p.E;
    } else if (cmd === "G0" || cmd === "G1") {
      const nx = p.X !== undefined ? (abs ? p.X * unit : x + p.X * unit) : x;
      const ny = p.Y !== undefined ? (abs ? p.Y * unit : y + p.Y * unit) : y;
      const nz = p.Z !== undefined ? (abs ? p.Z * unit : z + p.Z * unit) : z;
      const ne = p.E !== undefined ? (abs ? p.E : e + p.E) : e;
      if (nx !== x || ny !== y || nz !== z) {
        const isExtrude = cmd === "G1" && ne > e;
        (isExtrude ? extrude : travel).push(x, y, z, nx, ny, nz);
        count++;
      }
      x = nx; y = ny; z = nz; e = ne;
    }
  }
  return { extrude, travel, segments: count };
}

function makeLineSegments(flat, color, opacity) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(flat, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  return new THREE.LineSegments(geom, mat);
}

function GcodeViewer({ content, fileName, filePath, onFail }) {
  const containerRef = useRef(null);

  const data = useMemo(() => {
    try {
      return parseGcode(content);
    } catch {
      return { extrude: [], travel: [], segments: 0 };
    }
  }, [content]);

  useEffect(() => {
    if (!data || data.segments === 0) {
      onFail();
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1d23);
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 100000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const grid = new THREE.GridHelper(400, 40, 0x3a4050, 0x262b36);
    scene.add(grid);

    const group = new THREE.Group();
    if (data.travel.length) group.add(makeLineSegments(data.travel, 0x556074, 0.35));
    if (data.extrude.length) group.add(makeLineSegments(data.extrude, 0xffa94d, 1));
    scene.add(group);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    // fit
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const dist = maxDim * 1.8;
    camera.position.set(center.x + dist, center.y + dist * 0.75, center.z + dist);
    controls.target.copy(center);
    camera.near = maxDim / 100;
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();
    controls.update();

    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth, h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1a1d23]">
      <div ref={containerRef} className="absolute inset-0" />
      <PreviewBadge fileName={fileName} filePath={filePath} content={content} icon={Route} hint="拖拽旋转 · 滚轮缩放" />
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-3 rounded-md border border-border/40 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#ffa94d]" />挤出</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#556074]" />空移</span>
        <span>{data.segments} 段</span>
      </div>
    </div>
  );
}

// ===========================================================================
// URDF robot viewer (primitive geometry)
// ===========================================================================
function parseVec(s, dflt = [0, 0, 0]) {
  if (!s) return dflt.slice();
  const parts = s.trim().split(/\s+/).map(parseFloat);
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3).map((v) => (Number.isNaN(v) ? 0 : v));
}

function parseUrdf(xml) {
  const doc = new DOMParser().parseFromString(String(xml || ""), "application/xml");
  if (doc.querySelector("parsererror")) return null;
  const links = {};
  doc.querySelectorAll("link").forEach((l) => {
    const name = l.getAttribute("name");
    if (!name) return;
    const vis = l.querySelector("visual");
    let geom = null;
    let origin = { xyz: [0, 0, 0], rpy: [0, 0, 0] };
    let color = null;
    if (vis) {
      const o = vis.querySelector("origin");
      if (o) {
        origin = { xyz: parseVec(o.getAttribute("xyz")), rpy: parseVec(o.getAttribute("rpy")) };
      }
      const geo = vis.querySelector("geometry");
      if (geo) {
        const box = geo.querySelector("box");
        const cyl = geo.querySelector("cylinder");
        const sph = geo.querySelector("sphere");
        const mesh = geo.querySelector("mesh");
        if (box) geom = { type: "box", size: parseVec(box.getAttribute("size"), [0.1, 0.1, 0.1]) };
        else if (cyl) geom = { type: "cylinder", radius: parseFloat(cyl.getAttribute("radius")) || 0.05, length: parseFloat(cyl.getAttribute("length")) || 0.1 };
        else if (sph) geom = { type: "sphere", radius: parseFloat(sph.getAttribute("radius")) || 0.05 };
        else if (mesh) geom = { type: "mesh" };
      }
      const col = vis.querySelector("material color");
      if (col) color = parseVec(col.getAttribute("rgba"), [0.29, 0.56, 0.85, 1]);
    }
    links[name] = { name, geom, origin, color };
  });
  const joints = [];
  doc.querySelectorAll("joint").forEach((j) => {
    const parent = j.querySelector("parent");
    const child = j.querySelector("child");
    const o = j.querySelector("origin");
    let origin = { xyz: [0, 0, 0], rpy: [0, 0, 0] };
    if (o) origin = { xyz: parseVec(o.getAttribute("xyz")), rpy: parseVec(o.getAttribute("rpy")) };
    joints.push({
      name: j.getAttribute("name"),
      type: j.getAttribute("type"),
      parent: parent ? parent.getAttribute("link") : null,
      child: child ? child.getAttribute("link") : null,
      origin,
    });
  });
  return { links, joints };
}

function originMatrix(xyz, rpy) {
  const rx = new THREE.Matrix4().makeRotationX(rpy[0]);
  const ry = new THREE.Matrix4().makeRotationY(rpy[1]);
  const rz = new THREE.Matrix4().makeRotationZ(rpy[2]);
  const m = rx.premultiply(ry).premultiply(rz); // Rz * Ry * Rx (URDF convention)
  m.setPosition(xyz[0], xyz[1], xyz[2]);
  return m;
}

function buildUrdfScene(model) {
  const group = new THREE.Group();
  const { links, joints } = model;
  const names = Object.keys(links);
  if (names.length === 0) return null;

  // child link -> incoming joint
  const childToJoint = {};
  const childrenOf = {};
  for (const jt of joints) {
    if (jt.child) childToJoint[jt.child] = jt;
    if (jt.parent) (childrenOf[jt.parent] = childrenOf[jt.parent] || []).push(jt);
  }
  // root = link that is never a child
  const roots = names.filter((n) => !childToJoint[n]);
  const root = roots[0] || names[0];

  const linkGeom = (link) => {
    const g = link.geom;
    let geo;
    let rotX = 0;
    if (!g || g.type === "mesh") {
      geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    } else if (g.type === "box") {
      geo = new THREE.BoxGeometry(g.size[0], g.size[1], g.size[2]);
    } else if (g.type === "cylinder") {
      geo = new THREE.CylinderGeometry(g.radius, g.radius, g.length, 24);
      rotX = Math.PI / 2; // URDF cylinder axis is Z; THREE cylinder axis is Y
    } else if (g.type === "sphere") {
      geo = new THREE.SphereGeometry(g.radius, 24, 16);
    } else {
      geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    }
    const c = link.color || [0.29, 0.56, 0.85];
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(c[0], c[1], c[2]),
      metalness: 0.2,
      roughness: 0.55,
      transparent: !g || g.type === "mesh",
      opacity: !g || g.type === "mesh" ? 0.4 : 1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    if (rotX) mesh.rotation.x = rotX;
    return mesh;
  };

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(3, 5, 4);
  group.add(ambient, dir);

  // traverse tree, accumulate world matrices
  const visited = new Set();
  const walk = (linkName, parentWorld) => {
    if (visited.has(linkName)) return;
    visited.add(linkName);
    const link = links[linkName];
    if (!link) return;
    const incoming = childToJoint[linkName];
    let world = parentWorld.clone();
    if (incoming) world = world.multiply(originMatrix(incoming.origin.xyz, incoming.origin.rpy));
    // place this link's visual geometry at world * visualOrigin
    const mesh = linkGeom(link);
    const m = world.clone().multiply(originMatrix(link.origin.xyz, link.origin.rpy));
    mesh.applyMatrix4(m);
    group.add(mesh);
    // recurse children
    for (const jt of childrenOf[linkName] || []) {
      if (jt.child) walk(jt.child, world);
    }
  };
  walk(root, new THREE.Matrix4());
  // any disconnected links: place at identity
  for (const n of names) if (!visited.has(n)) walk(n, new THREE.Matrix4());

  return group;
}

function UrdfViewer({ content, fileName, filePath, onFail }) {
  const containerRef = useRef(null);

  const model = useMemo(() => {
    try {
      return parseUrdf(content);
    } catch {
      return null;
    }
  }, [content]);

  useEffect(() => {
    if (!model || Object.keys(model.links).length === 0) {
      onFail();
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1d23);
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / Math.max(container.clientHeight, 1), 0.001, 100000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const group = buildUrdfScene(model);
    if (!group) {
      onFail();
      return;
    }
    scene.add(group);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const grid = new THREE.GridHelper(maxDim * 6, 24, 0x3a4050, 0x262b36);
    grid.position.y = box.min.y;
    scene.add(grid);

    const dist = maxDim * 2.2;
    camera.position.set(center.x + dist, center.y + dist * 0.7, center.z + dist);
    controls.target.copy(center);
    camera.near = maxDim / 1000;
    camera.far = maxDim * 1000;
    camera.updateProjectionMatrix();
    controls.update();

    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth, h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  const linkCount = model ? Object.keys(model.links).length : 0;
  const jointCount = model ? model.joints.length : 0;
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1a1d23]">
      <div ref={containerRef} className="absolute inset-0" />
      <PreviewBadge fileName={fileName} filePath={filePath} content={content} icon={Bot} hint="拖拽旋转 · 滚轮缩放" />
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-md border border-border/40 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur">
        {linkCount} 连杆 · {jointCount} 关节
      </div>
    </div>
  );
}
