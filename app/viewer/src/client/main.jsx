import { StrictMode, useSyncExternalStore, useState, useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";
import CadWorkspace from "./components/CadWorkspace";
import GenerateWorkspace from "./components/workbench/GenerateWorkspace";
import faviconUrl from "./assets/favicon.ico";
import "./styles/globals.css";
import { getCadManifestSnapshot, subscribeCadManifest } from "./workbench/cadManifestStore.js";

const ROOT_ID = "root";
const ROOT_CACHE_KEY = "__cadViewerRoot";
const GENERATE_HASH = "#generate";
const VIEWER_HASH = "#viewer";

function ensureFavicon() {
  if (typeof document === "undefined") {
    return;
  }

  let icon = document.querySelector('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement("link");
    icon.rel = "icon";
    document.head.appendChild(icon);
  }
  icon.type = "image/x-icon";
  icon.href = `${faviconUrl}?v=planetary-gear-workbench`;
}

function bootstrap() {
  const rootElement = document.getElementById(ROOT_ID);
  if (!rootElement) {
    throw new Error(`Missing #${ROOT_ID} mount point.`);
  }
  ensureFavicon();
  document.title = "CAD Viewer";
  const cachedRoot = globalThis[ROOT_CACHE_KEY];
  const root = cachedRoot?.element === rootElement && cachedRoot?.root
    ? cachedRoot.root
    : createRoot(rootElement);
  globalThis[ROOT_CACHE_KEY] = {
    element: rootElement,
    root
  };
  root.render(
    <StrictMode>
      <AppRoot />
    </StrictMode>,
  );
}

function initialView() {
  return typeof window !== "undefined" && window.location.hash === VIEWER_HASH
    ? "viewer"
    : "generate";
}

function AppRoot() {
  const { manifest, generationStatus, revision, catalogHydrated, catalogRefreshing, catalogError, activeDir } = useSyncExternalStore(
    subscribeCadManifest,
    getCadManifestSnapshot,
    getCadManifestSnapshot,
  );
  const [view, setView] = useState(initialView);

  // Keep URL hash in sync with the view
  useEffect(() => {
    const target = view === "viewer" ? VIEWER_HASH : GENERATE_HASH;
    if (window.location.hash !== target) {
      window.history.replaceState(null, "", target);
    }
  }, [view]);

  const openGenerate = useCallback(() => setView("generate"), []);
  const backToViewer = useCallback(() => setView("viewer"), []);

  if (view === "generate") {
    return <GenerateWorkspace onBack={backToViewer} />;
  }

  return (
    <>
      <CadWorkspace
        manifestRevision={revision}
        manifestEntries={manifest.entries}
        generationStatus={generationStatus}
        catalogHydrated={catalogHydrated}
        catalogRefreshing={catalogRefreshing}
        catalogError={catalogError}
        activeDir={activeDir}
      />
      {/* Prominent entry to AI CAD Studio */}
      <button
        type="button"
        onClick={openGenerate}
        className="group fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-xl shadow-primary/25 ring-1 ring-primary-foreground/20 transition-all hover:scale-[1.04] hover:shadow-2xl hover:shadow-primary/35 active:scale-[0.98]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:rotate-12">
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
          <path d="M5 3v4" />
          <path d="M19 17v4" />
          <path d="M3 5h4" />
          <path d="M17 19h4" />
        </svg>
        AI CAD Studio
      </button>
    </>
  );
}

bootstrap();
