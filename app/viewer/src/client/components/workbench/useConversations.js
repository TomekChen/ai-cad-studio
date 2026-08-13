import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "cad-generate:conversations";

function loadConversations() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveConversations(conversations) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // Storage may be unavailable; keep in-memory state.
  }
}

function makeId() {
  return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function titleFromPrompt(text) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "New conversation";
  return cleaned.length > 24 ? cleaned.slice(0, 24) + "…" : cleaned;
}

/**
 * Manages the list of generation conversations with localStorage persistence.
 * Each conversation: { id, title, skill, messages: [], previewUrl, previewName, createdAt, updatedAt }
 */
export function useConversations() {
  const [conversations, setConversations] = useState(loadConversations);
  const [selectedId, setSelectedId] = useState(() => {
    const list = loadConversations();
    return list.length > 0 ? list[0].id : null;
  });
  const persistTimer = useRef(null);

  // Debounced persistence
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => saveConversations(conversations), 300);
    return () => clearTimeout(persistTimer.current);
  }, [conversations]);

  const createConversation = useCallback((skill = "cad", firstPrompt = "") => {
    const conv = {
      id: makeId(),
      title: titleFromPrompt(firstPrompt) || "New conversation",
      skill,
      messages: [],
      previewUrl: "",
      previewName: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConversations((prev) => [conv, ...prev]);
    setSelectedId(conv.id);
    return conv.id;
  }, []);

  const selectConversation = useCallback((id) => {
    setSelectedId(id);
  }, []);

  const deleteConversation = useCallback((id) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }, []);

  const updateConversation = useCallback((id, updater) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id ? { ...updater(c), updatedAt: Date.now() } : c
      )
    );
  }, []);

  const appendMessage = useCallback((id, message) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, messages: [...c.messages, message], updatedAt: Date.now() }
          : c
      )
    );
  }, []);

  const selectedConversation = conversations.find((c) => c.id === selectedId) || null;

  return {
    conversations,
    selectedId,
    selectedConversation,
    createConversation,
    selectConversation,
    deleteConversation,
    updateConversation,
    appendMessage,
  };
}
