import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  Download,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Power,
  Send,
  Sparkles,
  Square,
  Trash2,
  User,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/ui/utils";
import PreviewPane from "./PreviewPane";
import { useConversations, titleFromPrompt } from "@/workbench/useConversations";

// Decide how the middle pane should preview a generation result based on the
// artifact the skill produced. 3D models (STEP→GLB) get the full 3D viewer;
// other formats get a format-appropriate renderer, and anything without a
// dedicated renderer falls back to a syntax/text viewer so the middle pane is
// never empty for a generated artifact.
function resolvePreview(result) {
  if (result.previewUrl) {
    return { mode: "model3d", url: result.previewUrl, fileName: result.previewName || "model.glb" };
  }
  const f = (result.files || [])[0];
  if (f) {
    const ext = (f.type || "").toLowerCase();
    if (ext === "dxf") return { mode: "drawing2d", fileName: f.name, filePath: f.path, inline: result.code };
    if (ext === "gcode") return { mode: "toolpath", fileName: f.name, filePath: f.path, inline: result.code };
    if (ext === "urdf") return { mode: "robot", fileName: f.name, filePath: f.path, inline: result.code };
    return { mode: "code", fileName: f.name, filePath: f.path, inline: result.code };
  }
  // advise-mode skills produce no file; show the guidance text in the middle.
  if (result.reply) return { mode: "code", fileName: "生成说明.md", inline: result.reply };
  return null;
}

const DEFAULT_SKILLS = [
  { id: "cad", label: "STEP 参数化建模 (build123d)", icon: "⚙️", description: "从自然语言需求创建参数化 CAD 模型，生成经过验证的 STEP 工件。", mode: "python", ext: "step" },
];

// One-click provider presets for the add-model dialog: picking one auto-fills
// the OpenAI-compatible base URL so users only need to paste their API key and
// choose a model. The base URL stays editable for custom/dedicated endpoints.
const PROVIDER_PRESETS = [
  { id: "bailian", label: "阿里云百炼", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", hint: "qwen3.8-max-preview / qwen-max / qwen-plus 等" },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", hint: "deepseek-chat / deepseek-reasoner 等" },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", hint: "gpt-4o / gpt-4o-mini 等" },
  { id: "moonshot", label: "Moonshot", baseUrl: "https://api.moonshot.cn/v1", hint: "kimi-k2-0711-preview / moonshot-v1-8k 等" },
  { id: "zhipu", label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", hint: "glm-4-plus / glm-4-flash 等" },
  { id: "ollama", label: "本地 Ollama", baseUrl: "http://localhost:11434/v1", hint: "qwen2.5-coder:7b / llama3 等" },
];

// The built-in local offline model (Ollama running on the server). Selecting it
// sends an explicit llm config so generation runs against the server's local
// Ollama instance — fully offline (data never leaves the server) but slower
// than the cloud default. It is a built-in option: not editable or deletable.
const LOCAL_MODEL = {
  id: "local",
  name: "qwen2.5-coder:14b",
  baseUrl: "http://localhost:11434/v1",
  apiKey: "ollama",
  model: "qwen2.5-coder:14b",
};

function formatTime(ts) {
  try {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function ChatMessage({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-2.5 px-4 py-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.error && (
          <p className="mt-1.5 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
            {message.error}
          </p>
        )}
        {message.code && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs opacity-70 hover:opacity-100">
              查看生成代码
            </summary>
            <pre className="mt-1.5 max-h-48 overflow-auto rounded-md bg-black/10 p-2.5 text-[11px] leading-relaxed dark:bg-black/40">
              {message.code}
            </pre>
          </details>
        )}
        {message.files && message.files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.files.map((file, i) => (
              <a
                key={i}
                href={file.path ? `/_generate/file?path=${encodeURIComponent(file.path)}` : "#"}
                download={file.name}
                onClick={(e) => { if (!file.path) e.preventDefault(); }}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 py-0.5 text-[11px] hover:border-primary/50 hover:text-primary"
                title={file.path ? `下载 ${file.name}` : file.name}
              >
                <Sparkles className="size-3 text-primary" />
                {file.name}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingPanel({ thinking }) {
  const [now, setNow] = useState(Date.now());
  const codeRef = useRef(null);
  const reasonRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.scrollTop = codeRef.current.scrollHeight;
    }
    if (reasonRef.current) {
      reasonRef.current.scrollTop = reasonRef.current.scrollHeight;
    }
  }, [thinking.tokens, thinking.reasoning]);

  const elapsed = Math.max(0, Math.floor((now - thinking.startedAt) / 1000));

  return (
    <div className="mx-4 my-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <Loader2 className="size-3.5 animate-spin text-primary" />
        <span className="text-xs font-medium text-primary">AI 正在思考</span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{elapsed}s</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">{thinking.status}</p>
      {thinking.reasoning && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] font-medium text-muted-foreground">思考过程</div>
          <pre
            ref={reasonRef}
            className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-white/40 p-2 text-[10px] leading-relaxed text-foreground/70 dark:bg-black/40"
          >
            {thinking.reasoning}
          </pre>
        </div>
      )}
      {thinking.tokens && (
        <pre
          ref={codeRef}
          className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-black/20 p-2 text-[10px] leading-relaxed text-foreground/70 dark:bg-black/40"
        >
          {thinking.tokens}
        </pre>
      )}
    </div>
  );
}

function AddModelDialog({ onClose, onSave, initial }) {
  const [name, setName] = useState(initial?.name || "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl || "");
  const [apiKey, setApiKey] = useState(initial?.apiKey || "");
  const [model, setModel] = useState(initial?.model || "");
  const [presetId, setPresetId] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, message }

  const canSave = baseUrl.trim() !== "" && model.trim() !== "";

  const inputCls =
    "w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary/50";

  const handleTest = useCallback(async () => {
    if (!canSave) {
      setTestResult({ ok: false, message: "请先填写 API 地址和模型 ID。" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const resp = await fetch("/_generate/test_model", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          model: model.trim(),
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (data.ok) {
        setTestResult({
          ok: true,
          message: `连接成功${data.model ? `，模型 ${data.model} 可用` : ""}。`,
        });
      } else {
        setTestResult({ ok: false, message: data.error || "连接失败。" });
      }
    } catch (e) {
      setTestResult({ ok: false, message: `请求失败：${e.message || "网络错误"}` });
    } finally {
      setTesting(false);
    }
  }, [baseUrl, apiKey, model, canSave]);

  const handleSave = () => {
    onSave({
      id: initial?.id || `custom_${Date.now()}`,
      name: name.trim() || model.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-popover p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-semibold">{initial ? "编辑模型" : "添加模型"}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="关闭"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mb-4 rounded-md bg-muted/60 p-3 text-sm leading-relaxed text-muted-foreground">
          填写 OpenAI 兼容格式的 API 信息（如 OpenAI、DeepSeek、Moonshot、本地 Ollama 等）。
          生成任务在服务器上执行，因此需保证<b>服务器</b>能访问该 API 地址。API Key 仅保存在你的浏览器本地。
          使用阿里云百炼？
          <a
            href="https://help.aliyun.com/zh/model-studio/get-api-key"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2 hover:opacity-80"
          >
            查看 API Key 配置教程
          </a>
          。
        </p>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">快捷选择服务商</span>
            <div className="flex flex-wrap gap-1.5">
              {PROVIDER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPresetId(p.id);
                    setBaseUrl(p.baseUrl);
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    presetId === p.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              API 地址 <span className="text-destructive">*</span>
            </span>
            <input
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setPresetId(null);
              }}
              placeholder="https://api.example.com/v1"
              className={inputCls}
              spellCheck={false}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">API Key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…（本地 Ollama 可留空）"
              className={inputCls}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              模型 ID <span className="text-destructive">*</span>
            </span>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={
                PROVIDER_PRESETS.find((p) => p.id === presetId)?.hint ||
                "gpt-4o / deepseek-chat / qwen2.5-coder:7b 等"
              }
              className={inputCls}
              spellCheck={false}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">显示名称（可选）</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="默认使用模型 ID"
              className={inputCls}
            />
          </label>
        </div>

        {testResult && (
          <p
            className={cn(
              "mt-3 rounded-md px-3 py-2.5 text-xs leading-relaxed",
              testResult.ok
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-destructive/10 text-destructive"
            )}
          >
            {testResult.message}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing || !canSave}
            title="向该 API 发送一个最小请求以验证连通性"
          >
            {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
            {testing ? "测试中…" : "测试连接"}
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function GenerateWorkspace({ onBack }) {
  const {
    conversations,
    selectedId,
    selectedConversation,
    createConversation,
    selectConversation,
    deleteConversation,
    updateConversation,
    appendMessage,
  } = useConversations();

  const [input, setInput] = useState("");
  const [skill, setSkill] = useState("cad");
  const [loading, setLoading] = useState(false);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [skills, setSkills] = useState(DEFAULT_SKILLS);
  const [hovered, setHovered] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [downloadSkill, setDownloadSkill] = useState(null);
  const [thinking, setThinking] = useState(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [editingModel, setEditingModel] = useState(null);
  const [localTip, setLocalTip] = useState(false);
  const [defaultModelName, setDefaultModelName] = useState("qwen2.5-coder:14b");
  const [customModels, setCustomModels] = useState(() => {
    try {
      const raw = localStorage.getItem("t2c.customModels");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  });
  const [selectedModelId, setSelectedModelId] = useState(() => {
    try {
      return localStorage.getItem("t2c.selectedModelId") || "default";
    } catch {
      return "default";
    }
  });
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  // Load the full skill catalog from the backend (every skill under skills/).
  useEffect(() => {
    let cancelled = false;
    fetch("/_generate/skills")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.ok && Array.isArray(data.skills) && data.skills.length > 0) {
          setSkills(data.skills);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Fetch the server's default model name (env-configured) for display.
  useEffect(() => {
    fetch("/_generate/config")
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok && data.config?.model) setDefaultModelName(data.config.model);
      })
      .catch(() => {});
  }, []);

  // Persist model preferences to localStorage.
  useEffect(() => {
    try {
      localStorage.setItem("t2c.customModels", JSON.stringify(customModels));
    } catch { /* ignore */ }
  }, [customModels]);
  useEffect(() => {
    try {
      localStorage.setItem("t2c.selectedModelId", selectedModelId);
    } catch { /* ignore */ }
  }, [selectedModelId]);

  // If the selected custom model was deleted, fall back to the default.
  useEffect(() => {
    if (
      selectedModelId !== "default" &&
      selectedModelId !== "local" &&
      !customModels.some((m) => m.id === selectedModelId)
    ) {
      setSelectedModelId("default");
    }
  }, [selectedModelId, customModels]);

  const deleteCustomModel = useCallback((id) => {
    setCustomModels((prev) => prev.filter((m) => m.id !== id));
    setSelectedModelId((prev) => (prev === id ? "default" : prev));
  }, []);

  const addCustomModel = useCallback((m) => {
    setCustomModels((prev) => {
      const exists = prev.some((x) => x.id === m.id);
      return exists ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m];
    });
    setSelectedModelId(m.id);
    setAddModelOpen(false);
    setEditingModel(null);
  }, []);

  const selectedModelName =
    selectedModelId === "default"
      ? defaultModelName
      : selectedModelId === "local"
        ? LOCAL_MODEL.name
        : customModels.find((m) => m.id === selectedModelId)?.name || defaultModelName;

  const skillLabel = useCallback(
    (id) => skills.find((s) => s.id === id)?.label || id,
    [skills]
  );

  // Sync skill selector with selected conversation
  useEffect(() => {
    if (selectedConversation) {
      setSkill(selectedConversation.skill);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedConversation?.messages?.length, loading]);

  const handleNewConversation = useCallback(() => {
    createConversation(skill);
    setInput("");
    inputRef.current?.focus();
  }, [createConversation, skill]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    // Ensure a conversation exists
    let convId = selectedId;
    if (!convId) {
      convId = createConversation(skill, text);
    } else if (selectedConversation && selectedConversation.messages.length === 0) {
      // Update title from first prompt
      updateConversation(convId, (c) => ({ ...c, title: titleFromPrompt(text), skill }));
    }

    const userMessage = { role: "user", content: text };
    appendMessage(convId, userMessage);
    setInput("");
    setLoading(true);

    // Build chat history for the LLM (from current conversation)
    const conv = conversations.find((c) => c.id === convId);
    const history = [...(conv?.messages || []), userMessage]
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    abortRef.current = controller;
    setThinking({ status: "正在连接生成服务…", tokens: "", reasoning: "", startedAt: Date.now() });

    // Resolve the selected model override (null = server's default model).
    const activeModel =
      selectedModelId === "default"
        ? null
        : selectedModelId === "local"
          ? LOCAL_MODEL
          : customModels.find((m) => m.id === selectedModelId) || null;

    try {
      const response = await fetch("/_generate/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history,
          skill,
          llm: activeModel
            ? {
                base_url: activeModel.baseUrl,
                api_key: activeModel.apiKey,
                model: activeModel.model,
              }
            : null,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        let errMsg = `请求失败（HTTP ${response.status}）`;
        try {
          const j = await response.json();
          if (j && j.error) errMsg = j.error;
        } catch {
          /* ignore */
        }
        throw new Error(errMsg);
      }

      // Read the NDJSON stream: progress events ("status"/"token") update the
      // thinking panel live; the final "done" event carries the result.
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let result = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          let evt;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.event === "status") {
            setThinking((t) => ({
              status: evt.text,
              tokens: t?.tokens || "",
              reasoning: t?.reasoning || "",
              startedAt: t?.startedAt || Date.now(),
            }));
          } else if (evt.event === "reasoning") {
            // Live chain-of-thought from deep-thinking models.
            setThinking((t) => ({
              status: t?.status || "模型正在思考…",
              tokens: t?.tokens || "",
              reasoning: (t?.reasoning || "") + (evt.text || ""),
              startedAt: t?.startedAt || Date.now(),
            }));
          } else if (evt.event === "token") {
            setThinking((t) => ({
              status: t?.status || "正在编写建模代码…",
              tokens: (t?.tokens || "") + (evt.text || ""),
              reasoning: t?.reasoning || "",
              startedAt: t?.startedAt || Date.now(),
            }));
          } else if (evt.event === "done") {
            result = evt.result;
          }
        }
      }

      if (!result) {
        throw new Error("生成服务未返回结果，请重试。");
      }

      if (result.ok) {
        appendMessage(convId, {
          role: "assistant",
          content: result.reply || "模型生成完成。",
          code: result.code || "",
          files: result.files || [],
        });
        // Compute a unified preview descriptor so every skill (3D model, 2D
        // drawing, toolpath, robot, or plain text) can drive the middle pane.
        const preview = resolvePreview(result);
        if (preview) {
          updateConversation(convId, (c) => ({ ...c, preview }));
        }
      } else {
        appendMessage(convId, {
          role: "assistant",
          content: result.reply || "生成失败。",
          error: result.error || "未知错误",
          code: result.code || "",
        });
      }
    } catch (error) {
      if (error && error.name === "AbortError") {
        appendMessage(convId, {
          role: "assistant",
          content: "已手动停止生成。",
        });
      } else {
        appendMessage(convId, {
          role: "assistant",
          content: "请求失败。",
          error: error.message || "网络错误",
        });
      }
    } finally {
      abortRef.current = null;
      setThinking(null);
      setLoading(false);
    }
  }, [input, loading, selectedId, selectedConversation, skill, conversations, createConversation, updateConversation, appendMessage, selectedModelId, customModels]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Manually stop the in-flight generation (if any).
  const stopGeneration = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  // Manually end the current conversation: stop any running generation,
  // deselect the conversation (return to the empty state) and clear the input.
  const endConversation = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    selectConversation(null);
    setInput("");
    setSkillMenuOpen(false);
  }, [selectConversation]);

  const currentSkill = skills.find((s) => s.id === skill) || skills[0];
  const messages = selectedConversation?.messages || [];

  const closeMenu = () => {
    setSkillMenuOpen(false);
    setHovered(null);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* ===== Left sidebar: conversation list ===== */}
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 border-b border-border px-3 py-3">
          <Button variant="ghost" size="icon" className="size-7" onClick={onBack} title="返回技能库">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-primary" />
            <span className="text-sm font-semibold">AI CAD Studio</span>
          </div>
        </div>

        <div className="p-3">
          <Button className="w-full justify-start gap-2" onClick={handleNewConversation}>
            <Plus className="size-4" />
            新建对话
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {conversations.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              暂无对话，
              <br />
              点击上方按钮开始。
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                role="button"
                tabIndex={0}
                onClick={() => selectConversation(conv.id)}
                onKeyDown={(e) => e.key === "Enter" && selectConversation(conv.id)}
                className={cn(
                  "group mb-1 flex w-full cursor-pointer items-start gap-2 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors",
                  conv.id === selectedId
                    ? "border-border bg-muted"
                    : "hover:bg-muted/50"
                )}
              >
                <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{conv.title}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {skillLabel(conv.skill)} · {formatTime(conv.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  className="mt-0.5 hidden shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                  title="删除对话"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ===== Center: unified preview (3D / 2D / toolpath / robot / text) ===== */}
      <main className="relative min-w-0 flex-1">
        <PreviewPane
          preview={
            selectedConversation?.preview ||
            (selectedConversation?.previewUrl
              ? { mode: "model3d", url: selectedConversation.previewUrl, fileName: selectedConversation.previewName || "model.glb" }
              : null)
          }
        />
      </main>

      {/* ===== Right: chat panel ===== */}
      <aside className="flex w-[400px] shrink-0 flex-col border-l border-border">
        {/* Skill selector */}
        <div className="relative border-b border-border px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              生成技能
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground/70">{skills.length} 个技能</span>
              <button
                type="button"
                onClick={endConversation}
                disabled={!selectedId}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                title="结束当前对话（停止生成并返回）"
              >
                <Power className="size-3" />
                结束对话
              </button>
            </div>
          </div>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md border border-border/70 bg-background px-3 py-2 text-left text-sm hover:bg-muted/50"
            onClick={() => setSkillMenuOpen(!skillMenuOpen)}
          >
            <span>{currentSkill?.icon || "🧩"}</span>
            <span className="flex-1 truncate font-medium">{currentSkill?.label || skill}</span>
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", skillMenuOpen && "rotate-180")} />
          </button>
          {skillMenuOpen && (
            <div className="absolute left-4 right-4 top-full z-20 mt-1 max-h-[60vh] overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg">
              <p className="px-3 pb-1 pt-1.5 text-[10px] text-muted-foreground/70">
                悬停查看说明 · 点击选择 · 右侧图标下载技能定义
              </p>
              {skills.map((option) => (
                <div
                  key={option.id}
                  role="button"
                  tabIndex={0}
                  onMouseEnter={(e) => {
                    setHovered(option.id);
                    setTooltipPos({ x: e.clientX, y: e.clientY });
                  }}
                  onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHovered((h) => (h === option.id ? null : h))}
                  onClick={() => {
                    setSkill(option.id);
                    closeMenu();
                    if (selectedId && selectedConversation && selectedConversation.messages.length === 0) {
                      updateConversation(selectedId, (c) => ({ ...c, skill: option.id }));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setSkill(option.id);
                      closeMenu();
                    }
                  }}
                  className={cn(
                    "group flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                    option.id === skill && "bg-muted/70 font-medium"
                  )}
                >
                  <span className="shrink-0">{option.icon || "🧩"}</span>
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <button
                    type="button"
                    title="下载技能定义"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDownloadSkill(option.id);
                    }}
                    className="hidden shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-primary group-hover:inline-flex"
                  >
                    <Download className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-2">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Bot className="size-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">描述你想要的零件</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  例如：“模数 2、齿数 20 的直齿轮” 或
                  <br />
                  “M6 六角螺栓，长度 30mm，端部倒角”
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg, i) => <ChatMessage key={i} message={msg} />)
          )}
          {loading && thinking && <ThinkingPanel thinking={thinking} />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-3">
          {/* Model selector (pull-up popup) */}
          <div className="relative mb-2">
            <button
              type="button"
              onClick={() => setModelMenuOpen(!modelMenuOpen)}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              title="选择生成模型"
            >
              <Cpu className="size-3.5 shrink-0" />
              <span className="truncate font-medium">{selectedModelName}</span>
              <ChevronUp
                className={cn(
                  "size-3.5 shrink-0 transition-transform",
                  modelMenuOpen && "rotate-180"
                )}
              />
            </button>

            {modelMenuOpen && (
              <div className="absolute bottom-full left-0 z-30 mb-1.5 w-80 rounded-md border border-border bg-popover py-1 shadow-lg">
                <p className="px-3 pb-1 pt-1.5 text-[10px] text-muted-foreground/70">
                  选择生成模型
                </p>

                {/* Built-in default model (server env-configured) */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedModelId("default");
                    setModelMenuOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setSelectedModelId("default");
                      setModelMenuOpen(false);
                    }
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                    selectedModelId === "default" && "bg-muted/70 font-medium"
                  )}
                >
                  <Cpu className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{defaultModelName}</span>
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">
                    默认
                  </span>
                  {selectedModelId === "default" && (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  )}
                </div>

                {/* Built-in local offline model (server-side Ollama) */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedModelId("local");
                    setModelMenuOpen(false);
                    setLocalTip(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setSelectedModelId("local");
                      setModelMenuOpen(false);
                      setLocalTip(false);
                    }
                  }}
                  onMouseEnter={(e) => {
                    setLocalTip(true);
                    setTooltipPos({ x: e.clientX, y: e.clientY });
                  }}
                  onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setLocalTip(false)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                    selectedModelId === "local" && "bg-muted/70 font-medium"
                  )}
                >
                  <Cpu className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{LOCAL_MODEL.name}</span>
                  <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-500">
                    本地
                  </span>
                  {selectedModelId === "local" && (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  )}
                </div>

                {/* User-added custom models */}
                {customModels.map((m) => (
                  <div
                    key={m.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedModelId(m.id);
                      setModelMenuOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setSelectedModelId(m.id);
                        setModelMenuOpen(false);
                      }
                    }}
                    className={cn(
                      "group flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                      selectedModelId === m.id && "bg-muted/70 font-medium"
                    )}
                  >
                    <Cpu className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{m.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {m.model} · {m.baseUrl}
                      </p>
                    </div>
                    {selectedModelId === m.id && (
                      <Check className="size-3.5 shrink-0 text-primary" />
                    )}
                    <button
                      type="button"
                      title="编辑模型"
                      onClick={(e) => {
                        e.stopPropagation();
                        setModelMenuOpen(false);
                        setEditingModel(m);
                      }}
                      className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:bg-primary/10 hover:text-primary"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      type="button"
                      title="删除模型"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCustomModel(m.id);
                      }}
                      className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}

                {/* Add model (dashed) */}
                <div className="mx-2 my-1 border-t border-border/60" />
                <button
                  type="button"
                  onClick={() => {
                    setModelMenuOpen(false);
                    setAddModelOpen(true);
                  }}
                  className="mx-2 mb-1 flex w-[calc(100%-16px)] items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <Plus className="size-3.5" />
                  添加模型
                </button>
              </div>
            )}
          </div>

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="描述你的零件…"
              rows={3}
              className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/50"
            />
            <Button
              size="icon"
              className="size-10 shrink-0"
              disabled={!loading && !input.trim()}
              onClick={loading ? stopGeneration : handleSend}
              title={loading ? "停止生成" : "生成"}
            >
              {loading ? <Square className="size-4" /> : <Send className="size-4" />}
            </Button>
          </div>
        </div>
      </aside>

      {/* ===== Floating skill tooltip (follows cursor) ===== */}
      {hovered && (() => {
        const s = skills.find((x) => x.id === hovered);
        if (!s) return null;
        const flipY = tooltipPos.y > window.innerHeight - 140;
        return (
          <div
            className="pointer-events-none fixed z-50 w-64 rounded-lg border border-border bg-popover p-2.5 text-xs shadow-xl"
            style={{
              left: Math.min(tooltipPos.x + 16, window.innerWidth - 272),
              top: flipY ? tooltipPos.y - 16 : tooltipPos.y + 18,
              transform: flipY ? "translateY(-100%)" : "none",
            }}
          >
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              <span>{s.icon || "🧩"}</span>
              <span className="truncate">{s.label}</span>
            </div>
            <p className="leading-relaxed text-muted-foreground">
              {s.description || "暂无说明。"}
            </p>
            <p className="mt-1.5 border-t border-border/60 pt-1 text-[10px] text-muted-foreground/70">
              技能 ID：{s.id}
            </p>
          </div>
        );
      })()}

      {/* ===== Local offline model tooltip (follows cursor) ===== */}
      {localTip && (
        <div
          className="pointer-events-none fixed z-50 w-60 rounded-lg border border-border bg-popover p-2.5 text-xs shadow-xl"
          style={{
            left: Math.min(tooltipPos.x + 16, window.innerWidth - 256),
            top: tooltipPos.y > window.innerHeight - 120 ? tooltipPos.y - 16 : tooltipPos.y + 18,
            transform: tooltipPos.y > window.innerHeight - 120 ? "translateY(-100%)" : "none",
          }}
        >
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <Cpu className="size-3.5 text-emerald-500" />
            <span>本地离线模型</span>
          </div>
          <p className="leading-relaxed text-muted-foreground">
            在服务器本地运行（{LOCAL_MODEL.name}），完全离线、数据不出服务器，无需联网和 API Key；但生成速度明显慢于云端默认模型。
          </p>
        </div>
      )}

      {/* ===== Download format selection modal ===== */}
      {downloadSkill && (() => {
        const s = skills.find((x) => x.id === downloadSkill);
        const enc = encodeURIComponent(downloadSkill);
        const formats = [
          {
            key: "zip",
            label: "ZIP 压缩包",
            ext: ".zip",
            file: `${downloadSkill}.zip`,
            href: `/_generate/skill/zip?id=${enc}`,
            desc: "通用格式，Windows / macOS 可直接解压，适合大多数智能体。",
          },
          {
            key: "targz",
            label: "TAR.GZ 压缩包",
            ext: ".tar.gz",
            file: `${downloadSkill}.tar.gz`,
            href: `/_generate/skill/targz?id=${enc}`,
            desc: "适合 Codex、Claude Code 等命令行智能体，用 tar -xzf 解压。",
          },
          {
            key: "md",
            label: "SKILL.md 单文件",
            ext: ".md",
            file: `${downloadSkill}-SKILL.md`,
            href: `/_generate/skill?id=${enc}`,
            desc: "仅技能定义文档，适合可直接读取 Markdown 的智能体。",
          },
        ];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setDownloadSkill(null)}
          >
            <div
              className="w-full max-w-sm rounded-xl border border-border bg-popover p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-sm font-semibold">下载技能定义</h3>
                <button
                  type="button"
                  onClick={() => setDownloadSkill(null)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="关闭"
                >
                  <X className="size-4" />
                </button>
              </div>
              <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{s?.icon || "🧩"}</span>
                <span className="font-medium text-foreground">{s?.label || downloadSkill}</span>
              </p>
              <p className="mb-4 rounded-md bg-muted/60 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                不同智能体对导入的技能文件格式要求不同（例如 Codex 通常需要 tar.gz，有的智能体只需一个 SKILL.md）。请根据你使用的智能体选择对应格式。
              </p>
              <div className="flex flex-col gap-2">
                {formats.map((f) => (
                  <a
                    key={f.key}
                    href={f.href}
                    download={f.file}
                    className="group flex items-center gap-3 rounded-lg border border-border/70 bg-background px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">
                        {f.label}
                        <span className="ml-1 text-[10px] text-muted-foreground">{f.ext}</span>
                      </p>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{f.desc}</p>
                    </div>
                    <Download className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== Add / edit model dialog ===== */}
      {(addModelOpen || editingModel) && (
        <AddModelDialog
          initial={editingModel}
          onClose={() => {
            setAddModelOpen(false);
            setEditingModel(null);
          }}
          onSave={addCustomModel}
        />
      )}
    </div>
  );
}
