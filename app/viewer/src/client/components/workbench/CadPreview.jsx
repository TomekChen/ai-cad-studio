import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Loader2,
  Box,
  Maximize2,
  RotateCw,
  Grid3x3,
  Axis3d,
  Triangle,
  Download,
} from "lucide-react";

/**
 * Standalone Three.js GLB preview for generated CAD models.
 * Renders a GLB file with orbit controls, grid, axes and auto-fit camera, plus
 * an overlay parameter panel (bounding-box size, triangle/vertex counts) and a
 * floating view toolbar (fit / auto-rotate / wireframe / grid / axes / download).
 */

// Format a millimetre dimension: integers for large parts, one decimal otherwise.
function fmtDim(n) {
  if (!Number.isFinite(n)) return "—";
  return n >= 100 ? Math.round(n).toString() : n.toFixed(1);
}

export default function CadPreview({ url, fileName = "" }) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const modelGroupRef = useRef(null);
  const gridRef = useRef(null);
  const axesRef = useRef(null);
  const fitRef = useRef(null);
  const wireframeRef = useRef(false);
  const frameRef = useRef(null);

  const [status, setStatus] = useState(url ? "loading" : "empty");
  const [error, setError] = useState("");
  const [info, setInfo] = useState(null); // { sx, sy, sz, triangles, vertices, meshes }
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);

  // Initialize scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1d23);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      10000
    );
    camera.position.set(60, 45, 60);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(50, 80, 40);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x8899ff, 0.4);
    fillLight.position.set(-40, 30, -40);
    scene.add(fillLight);

    // Grid
    const grid = new THREE.GridHelper(400, 40, 0x3a4050, 0x262b36);
    grid.position.y = -0.01;
    scene.add(grid);
    gridRef.current = grid;

    // Axes helper (unit size, rescaled to the model on load); hidden by default.
    const axes = new THREE.AxesHelper(1);
    axes.visible = false;
    scene.add(axes);
    axesRef.current = axes;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 5, 0);

    // Model group
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    modelGroupRef.current = modelGroup;

    // Animation loop
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handling
    const handleResize = () => {
      const w = container.clientWidth;
      const h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frameRef.current);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Apply wireframe to all meshes in the model group.
  const applyWireframe = useCallback((val) => {
    const group = modelGroupRef.current;
    if (!group) return;
    group.traverse((obj) => {
      if (obj.isMesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (m) m.wireframe = val;
        });
      }
    });
  }, []);

  // Re-frame the camera to fit the current model.
  const frameCamera = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const fit = fitRef.current;
    if (!camera || !controls || !fit) return;
    camera.position.set(fit.dist, fit.dist * 0.75, fit.dist);
    controls.target.set(0, fit.targetY, 0);
    camera.updateProjectionMatrix();
    controls.update();
  }, []);

  // Load model when url changes
  useEffect(() => {
    const modelGroup = modelGroupRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const axes = axesRef.current;
    if (!modelGroup || !camera || !controls) return;

    // Clear previous model
    while (modelGroup.children.length > 0) {
      const child = modelGroup.children[0];
      modelGroup.remove(child);
      child.traverse?.((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    }

    if (!url) {
      setStatus("empty");
      setError("");
      setInfo(null);
      fitRef.current = null;
      return;
    }

    setStatus("loading");
    setError("");

    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;

        // Count geometry stats and apply a nice material if needed.
        let triangles = 0;
        let vertices = 0;
        let meshes = 0;
        model.traverse((obj) => {
          if (obj.isMesh) {
            meshes += 1;
            obj.castShadow = true;
            obj.receiveShadow = true;
            if (!obj.material || obj.material.type === "MeshBasicMaterial") {
              obj.material = new THREE.MeshStandardMaterial({
                color: 0x4a90d9,
                metalness: 0.3,
                roughness: 0.4,
              });
            }
            const g = obj.geometry;
            if (g) {
              const pos = g.attributes.position;
              if (pos) vertices += pos.count;
              if (g.index) triangles += g.index.count / 3;
              else if (pos) triangles += pos.count / 3;
            }
          }
        });

        // Center and fit
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;

        model.position.sub(center);
        model.position.y += size.y / 2; // sit on grid
        modelGroup.add(model);

        // Fit camera
        const fitDistance = maxDim * 1.8;
        camera.position.set(fitDistance, fitDistance * 0.75, fitDistance);
        controls.target.set(0, size.y / 2, 0);
        camera.near = maxDim / 100;
        camera.far = maxDim * 100;
        camera.updateProjectionMatrix();
        controls.update();

        // Scale + position axes helper to the model footprint.
        if (axes) {
          axes.scale.setScalar(Math.max(maxDim * 0.4, 1));
          axes.position.set(0, 0, 0);
        }

        fitRef.current = { dist: fitDistance, targetY: size.y / 2, maxDim };
        // cadpy exports the GLB in metres (glTF convention) but the part is
        // modelled in millimetres, so scale the readout back to mm for display.
        // (Scene/camera math above intentionally keeps the metre-scale size.)
        const mm = 1000;
        setInfo({
          sx: size.x * mm,
          sy: size.y * mm,
          sz: size.z * mm,
          triangles: Math.round(triangles),
          vertices,
          meshes,
        });

        // Honour the current wireframe toggle on the freshly loaded model.
        applyWireframe(wireframeRef.current);

        setStatus("ready");
      },
      undefined,
      (err) => {
        console.error("GLB load error:", err);
        setStatus("error");
        setError("3D 预览加载失败。若这是历史会话，其源文件可能已在服务重建后清理，请重新生成该模型。");
      }
    );
  }, [url, applyWireframe]);

  // Reflect toggle state into the scene.
  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);
  useEffect(() => {
    if (axesRef.current) axesRef.current.visible = showAxes;
  }, [showAxes]);
  useEffect(() => {
    const controls = controlsRef.current;
    if (controls) {
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 2.0;
    }
  }, [autoRotate]);
  useEffect(() => {
    wireframeRef.current = wireframe;
    applyWireframe(wireframe);
  }, [wireframe, applyWireframe]);

  const handleDownload = useCallback(() => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "model.glb";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [url, fileName]);

  const toolBtn =
    "flex size-8 items-center justify-center rounded-md border border-border/50 bg-background/70 text-muted-foreground backdrop-blur transition-colors hover:bg-muted hover:text-foreground";
  const toolBtnActive =
    "flex size-8 items-center justify-center rounded-md border border-primary/50 bg-primary/15 text-primary backdrop-blur transition-colors hover:bg-primary/25";

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {/* File name badge */}
      {fileName && status === "ready" && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border/40 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur">
          {fileName}
        </div>
      )}

      {/* Parameter panel */}
      {info && status === "ready" && (
        <div className="pointer-events-none absolute right-3 top-3 w-44 rounded-md border border-border/40 bg-background/70 p-2.5 text-[11px] text-muted-foreground backdrop-blur">
          <p className="mb-1.5 flex items-center gap-1 font-semibold text-foreground/80">
            <Box className="size-3 text-primary" />
            模型参数
          </p>
          <div className="space-y-1 tabular-nums">
            <div className="flex justify-between gap-2">
              <span>尺寸 (长×宽×高)</span>
            </div>
            <div className="flex justify-between gap-2 text-foreground/80">
              <span>X</span>
              <span>{fmtDim(info.sx)} mm</span>
            </div>
            <div className="flex justify-between gap-2 text-foreground/80">
              <span>Y</span>
              <span>{fmtDim(info.sy)} mm</span>
            </div>
            <div className="flex justify-between gap-2 text-foreground/80">
              <span>Z</span>
              <span>{fmtDim(info.sz)} mm</span>
            </div>
            <div className="my-1 border-t border-border/50" />
            <div className="flex justify-between gap-2">
              <span>三角面数</span>
              <span className="text-foreground/80">{info.triangles.toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>顶点数</span>
              <span className="text-foreground/80">{info.vertices.toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>网格数</span>
              <span className="text-foreground/80">{info.meshes.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* View toolbar */}
      {status === "ready" && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-border/40 bg-background/60 p-1.5 backdrop-blur">
          <button type="button" title="适配视图" className={toolBtn} onClick={frameCamera}>
            <Maximize2 className="size-4" />
          </button>
          <button
            type="button"
            title="自动旋转"
            className={autoRotate ? toolBtnActive : toolBtn}
            onClick={() => setAutoRotate((v) => !v)}
          >
            <RotateCw className="size-4" />
          </button>
          <button
            type="button"
            title="线框模式"
            className={wireframe ? toolBtnActive : toolBtn}
            onClick={() => setWireframe((v) => !v)}
          >
            <Triangle className="size-4" />
          </button>
          <button
            type="button"
            title="显示网格"
            className={showGrid ? toolBtnActive : toolBtn}
            onClick={() => setShowGrid((v) => !v)}
          >
            <Grid3x3 className="size-4" />
          </button>
          <button
            type="button"
            title="显示坐标轴"
            className={showAxes ? toolBtnActive : toolBtn}
            onClick={() => setShowAxes((v) => !v)}
          >
            <Axis3d className="size-4" />
          </button>
          <button type="button" title="下载 GLB" className={toolBtn} onClick={handleDownload}>
            <Download className="size-4" />
          </button>
        </div>
      )}

      {/* Overlay states */}
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/40">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm text-muted-foreground shadow">
            <Loader2 className="size-4 animate-spin" />
            正在加载 3D 模型…
          </div>
        </div>
      )}
      {status === "empty" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <Box className="size-10 text-muted-foreground/40" />
            <p className="max-w-[260px] text-sm text-muted-foreground/70">
              生成的 CAD 模型将在此处预览
            </p>
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-md border border-destructive/40 bg-background px-4 py-2 text-sm text-destructive shadow">
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
