import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { deflateRawSync, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const VIEWER_ROOT = path.resolve(MODULE_DIR, "..", "..");
const PROJECT_ROOT = path.resolve(VIEWER_ROOT, "..");
const SKILLS_DIR = path.resolve(PROJECT_ROOT, "skills");
const GENERATE_SCRIPT = path.resolve(MODULE_DIR, "generate", "generate_cad.py");
const GENERATED_DIR = path.resolve(VIEWER_ROOT, "generated");

function readJsonBody(req, limitBytes = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding?.("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > limitBytes) {
        reject(new Error("Request body too large"));
        req.destroy?.();
      }
    });
    req.on("error", reject);
    req.on("end", () => {
      try {
        resolve(body.trim() ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("access-control-allow-origin", "*");
  res.end(JSON.stringify(payload));
}

// --- Minimal in-memory ZIP builder (Node built-ins only) -------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1) >>> 0;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// entries: [{ name: "relative/path", data: Buffer }]
function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const data = entry.data;
    const crc = crc32(data);
    const compressed = deflateRawSync(data, { level: 6 });
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 flag
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12); // date
    local.writeUInt16LE(0x5921, 14); // time
    local.writeUInt32LE(crc, 16);
    local.writeUInt32LE(compressed.length, 20);
    local.writeUInt32LE(data.length, 24);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, compressed);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(0x0800, 6);
    cen.writeUInt16LE(8, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(0x21, 12);
    cen.writeUInt16LE(0x5921, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(compressed.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt16LE(0, 38);
    cen.writeUInt32LE(0, 40);
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, nameBuf]));
    offset += local.length + nameBuf.length + compressed.length;
  }
  const centralBuf = Buffer.concat(central);
  const centralOffset = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, eocd]);
}

// --- Minimal in-memory TAR.GZ builder (Node built-ins only) ----------------
// Build a single 512-byte ustar header for a file or directory entry.
function tarHeader(name, size, typeflag, mode) {
  const h = Buffer.alloc(512); // zero-filled
  h.write(name, 0, 100, "utf8"); // name (fits; skill paths are short)
  h.write(mode, 100, 8, "binary"); // mode, octal string + NUL
  h.write("0000000\0", 108, 8, "binary"); // uid
  h.write("0000000\0", 116, 8, "binary"); // gid
  h.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "binary"); // size
  h.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0", 136, 12, "binary"); // mtime
  h.write("        ", 148, 8, "binary"); // chksum placeholder (spaces)
  h.write(typeflag, 156, 1, "binary"); // typeflag: '0' file, '5' dir
  h.write("ustar\0", 257, 6, "binary"); // magic
  h.write("00", 263, 2, "binary"); // version
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += h[i];
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "binary"); // checksum
  return h;
}

// entries: [{ name: "relative/path", data: Buffer }] -> gzipped tar Buffer
function buildTarGz(entries) {
  // Derive unique parent directories so archives extract cleanly everywhere.
  const dirs = new Set();
  for (const e of entries) {
    const parts = e.name.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  const blocks = [];
  for (const d of [...dirs].sort()) {
    blocks.push(tarHeader(d + "/", 0, "5", "0000755\0"));
  }
  for (const e of entries) {
    blocks.push(tarHeader(e.name, e.data.length, "0", "0000644\0"));
    blocks.push(e.data);
    const pad = 512 - (e.data.length % 512);
    if (pad < 512) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(1024)); // two zero blocks mark end of archive
  return gzipSync(Buffer.concat(blocks));
}

async function walkDir(dir, base, out) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await walkDir(full, rel, out);
    } else if (entry.isFile()) {
      out.push({ name: rel, data: await fsp.readFile(full) });
    }
  }
  return out;
}

// Resolve a skill-relative path safely inside SKILLS_DIR. Returns null if the
// skill id or sub-path escapes the skills directory.
function resolveSkillPath(skillId, subPath = "") {
  if (!skillId || /[\\/]/.test(skillId) || skillId === "." || skillId === "..") return null;
  const skillDir = path.resolve(SKILLS_DIR, skillId);
  if (!skillDir.startsWith(SKILLS_DIR + path.sep)) return null;
  const target = path.resolve(skillDir, subPath);
  if (target !== skillDir && !target.startsWith(skillDir + path.sep)) return null;
  return target;
}

function runPythonGenerator(request, onChild) {
  return new Promise((resolve) => {
    const python = process.env.VIEWER_CAD_PYTHON || process.env.CAD_PYTHON || "python3";
    const child = spawn(python, [GENERATE_SCRIPT], {
      cwd: VIEWER_ROOT,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (onChild) onChild(child);

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });

    child.on("error", (error) => {
      resolve({ ok: false, error: `Failed to start Python: ${error.message}` });
    });

    child.on("close", (code) => {
      if (code !== 0 && !stdout.trim()) {
        resolve({ ok: false, error: `Generator exited with code ${code}: ${stderr.slice(-1000)}` });
        return;
      }
      try {
        const result = JSON.parse(stdout.trim().split("\n").pop());
        resolve(result);
      } catch {
        resolve({ ok: false, error: `Failed to parse generator output: ${stdout.slice(-500)}` });
      }
    });

    // Write request to stdin
    child.stdin.write(JSON.stringify(request));
    child.stdin.end();

    // Timeout after 600s (14b models on CPU take a while, and the generator may
    // perform up to 2 error-feedback retries, each requiring another LLM call)
    setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, error: "Generation timed out (600s)." });
    }, 600000);
  });
}

// Streaming variant: relays chain-of-thought progress events to onEvent as they
// are printed, then emits the final result as { event: "done", result }.
// The Python generator prints progress lines that carry an "event" field and a
// final result line WITHOUT an "event" field; we tell them apart by that.
function runPythonGeneratorStream(request, onEvent) {
  const python = process.env.VIEWER_CAD_PYTHON || process.env.CAD_PYTHON || "python3";
  const child = spawn(python, [GENERATE_SCRIPT], {
    cwd: VIEWER_ROOT,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderr = "";
  let resultLine = null;
  let lineBuf = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return; // ignore non-JSON noise
    }
    if (obj && typeof obj === "object" && obj.event) {
      onEvent(obj); // progress event -> relay immediately
    } else {
      resultLine = obj; // candidate final result (no "event" field)
    }
  };

  child.stdout.on("data", (chunk) => {
    lineBuf += chunk;
    let idx;
    while ((idx = lineBuf.indexOf("\n")) !== -1) {
      const line = lineBuf.slice(0, idx);
      lineBuf = lineBuf.slice(idx + 1);
      handleLine(line);
    }
  });

  child.on("error", (error) => {
    onEvent({ event: "done", result: { ok: false, error: `Failed to start Python: ${error.message}` } });
  });

  child.on("close", (code) => {
    if (lineBuf.trim()) handleLine(lineBuf);
    if (resultLine) {
      onEvent({ event: "done", result: resultLine });
    } else {
      onEvent({
        event: "done",
        result: { ok: false, error: `Generator exited with code ${code}: ${stderr.slice(-800)}` },
      });
    }
  });

  child.stdin.write(JSON.stringify(request));
  child.stdin.end();

  const timer = setTimeout(() => {
    if (child.exitCode === null) child.kill("SIGTERM");
  }, 600000);
  child.on("close", () => clearTimeout(timer));

  return {
    cancel: () => {
      if (child.exitCode === null) child.kill("SIGTERM");
    },
  };
}

export function createGenerateApiMiddleware() {
  return function generateApi(req, res, next) {
    const reqUrl = new URL(req.url || "/", "http://localhost");
    const pathname = reqUrl.pathname;

    // CORS preflight
    if (req.method === "OPTIONS" && pathname.startsWith("/_generate")) {
      res.statusCode = 204;
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type");
      res.end();
      return;
    }

    // GET /_generate/skills - list available generation skills
    if (pathname === "/_generate/skills" && req.method === "GET") {
      runPythonGenerator({ action: "list_skills" }).then((result) => {
        sendJson(res, result.ok ? 200 : 500, result);
      });
      return;
    }

    // GET /_generate/skill?id=<skill> - download a skill's SKILL.md definition
    if (pathname === "/_generate/skill" && req.method === "GET") {
      const id = reqUrl.searchParams.get("id") || "";
      const target = resolveSkillPath(id, "SKILL.md");
      if (!target) {
        sendJson(res, 400, { ok: false, error: "Invalid skill id." });
        return;
      }
      fs.readFile(target, (err, data) => {
        if (err) {
          sendJson(res, 404, { ok: false, error: `Skill '${id}' not found.` });
          return;
        }
        res.statusCode = 200;
        res.setHeader("content-type", "text/markdown; charset=utf-8");
        res.setHeader("content-disposition", `attachment; filename="${id}-SKILL.md"`);
        res.setHeader("content-length", data.length);
        res.setHeader("cache-control", "no-store");
        res.setHeader("access-control-allow-origin", "*");
        res.end(data);
      });
      return;
    }

    // GET /_generate/skill/zip?id=<skill> - download the whole skill folder as ZIP
    if (pathname === "/_generate/skill/zip" && req.method === "GET") {
      const id = reqUrl.searchParams.get("id") || "";
      const skillDir = resolveSkillPath(id);
      if (!skillDir) {
        sendJson(res, 400, { ok: false, error: "Invalid skill id." });
        return;
      }
      walkDir(skillDir, id, [])
        .then((entries) => {
          if (entries.length === 0) {
            sendJson(res, 404, { ok: false, error: `Skill '${id}' not found.` });
            return;
          }
          const zip = buildZip(entries);
          res.statusCode = 200;
          res.setHeader("content-type", "application/zip");
          res.setHeader("content-disposition", `attachment; filename="${id}.zip"`);
          res.setHeader("content-length", zip.length);
          res.setHeader("cache-control", "no-store");
          res.setHeader("access-control-allow-origin", "*");
          res.end(zip);
        })
        .catch(() => {
          sendJson(res, 500, { ok: false, error: "Failed to package skill." });
        });
      return;
    }

    // GET /_generate/skill/targz?id=<skill> - download the whole skill folder as TAR.GZ
    if (pathname === "/_generate/skill/targz" && req.method === "GET") {
      const id = reqUrl.searchParams.get("id") || "";
      const skillDir = resolveSkillPath(id);
      if (!skillDir) {
        sendJson(res, 400, { ok: false, error: "Invalid skill id." });
        return;
      }
      walkDir(skillDir, id, [])
        .then((entries) => {
          if (entries.length === 0) {
            sendJson(res, 404, { ok: false, error: `Skill '${id}' not found.` });
            return;
          }
          const targz = buildTarGz(entries);
          res.statusCode = 200;
          res.setHeader("content-type", "application/gzip");
          res.setHeader("content-disposition", `attachment; filename="${id}.tar.gz"`);
          res.setHeader("content-length", targz.length);
          res.setHeader("cache-control", "no-store");
          res.setHeader("access-control-allow-origin", "*");
          res.end(targz);
        })
        .catch(() => {
          sendJson(res, 500, { ok: false, error: "Failed to package skill." });
        });
      return;
    }

    // GET /_generate/config - check LLM configuration
    if (pathname === "/_generate/config" && req.method === "GET") {
      runPythonGenerator({ action: "config" }).then((result) => {
        sendJson(res, 200, result);
      });
      return;
    }

    // POST /_generate/test_model - verify a user-supplied model endpoint works.
    // Runs server-side (generation happens on this machine, so it's the server
    // that must be able to reach the API, not the browser).
    if (pathname === "/_generate/test_model" && req.method === "POST") {
      readJsonBody(req)
        .then(async (body) => {
          const baseUrl = String(body.baseUrl || "").trim().replace(/\/+$/, "");
          const apiKey = String(body.apiKey || "").trim();
          const model = String(body.model || "").trim();
          if (!baseUrl || !model) {
            sendJson(res, 400, { ok: false, error: "API 地址和模型 ID 不能为空。" });
            return;
          }
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 20000);
          try {
            const resp = await fetch(`${baseUrl}/chat/completions`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
              },
              body: JSON.stringify({
                model,
                messages: [{ role: "user", content: "hi" }],
                max_tokens: 5,
                temperature: 0,
              }),
              signal: controller.signal,
            });
            clearTimeout(timer);
            if (!resp.ok) {
              let detail = "";
              try {
                detail = (await resp.text()).slice(0, 300);
              } catch {
                /* ignore */
              }
              sendJson(res, 200, {
                ok: false,
                error: `连接失败（HTTP ${resp.status}）${detail ? "：" + detail : ""}`,
              });
              return;
            }
            const data = await resp.json().catch(() => ({}));
            sendJson(res, 200, { ok: true, model: data.model || model });
          } catch (err) {
            clearTimeout(timer);
            const msg =
              err && err.name === "AbortError"
                ? "连接超时（20s），请确认 API 地址正确且服务器可以访问该地址。"
                : `连接失败：${(err && err.message) || err}`;
            sendJson(res, 200, { ok: false, error: msg });
          }
        })
        .catch((error) => {
          if (!res.writableEnded && !res.destroyed) {
            sendJson(res, 400, { ok: false, error: error.message });
          }
        });
      return;
    }

    // POST /_generate/chat - main generation endpoint (streams NDJSON:
    // chain-of-thought progress events followed by a final "done" event)
    if (pathname === "/_generate/chat" && req.method === "POST") {
      readJsonBody(req)
        .then((body) => {
          const { messages, skill, llm } = body;
          if (!messages || !Array.isArray(messages) || messages.length === 0) {
            sendJson(res, 400, { ok: false, error: "messages array is required." });
            return;
          }
          res.statusCode = 200;
          res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.setHeader("access-control-allow-origin", "*");
          res.setHeader("x-accel-buffering", "no"); // don't let proxies buffer the stream

          const sendEvent = (obj) => {
            if (res.writableEnded || res.destroyed) return;
            res.write(JSON.stringify(obj) + "\n");
            if (obj.event === "done") res.end();
          };

          const gen = runPythonGeneratorStream(
            { action: "chat", messages, skill: skill || "cad", llm: llm || null },
            sendEvent
          );
          // If the client aborts (hits "stop generation"), kill the subprocess
          // so we don't waste CPU on a discarded result.
          req.on("close", () => {
            if (!res.writableEnded) gen.cancel();
          });
        })
        .catch((error) => {
          if (!res.writableEnded && !res.destroyed) {
            sendJson(res, 400, { ok: false, error: error.message });
          }
        });
      return;
    }

    // GET /_generate/file?path=... - serve generated files
    if (pathname === "/_generate/file" && req.method === "GET") {
      const filePath = reqUrl.searchParams.get("path") || "";
      const resolved = path.resolve(filePath);
      // Security: only serve from generated directory
      if (!resolved.startsWith(GENERATED_DIR)) {
        sendJson(res, 403, { ok: false, error: "Access denied." });
        return;
      }
      try {
        const stat = fs.statSync(resolved);
        const ext = path.extname(resolved).toLowerCase();
        const mimeTypes = {
          ".step": "application/step",
          ".stp": "application/step",
          ".glb": "model/gltf-binary",
          ".stl": "model/stl",
          ".dxf": "application/dxf",
          ".json": "application/json",
        };
        res.statusCode = 200;
        res.setHeader("content-type", mimeTypes[ext] || "application/octet-stream");
        res.setHeader("content-length", stat.size);
        res.setHeader("cache-control", "no-store");
        res.setHeader("access-control-allow-origin", "*");
        fs.createReadStream(resolved).pipe(res);
      } catch {
        sendJson(res, 404, { ok: false, error: "File not found." });
      }
      return;
    }

    next();
  };
}
