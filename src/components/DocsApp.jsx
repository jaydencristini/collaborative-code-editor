import React, { useEffect, useMemo, useState } from "react";
import CollaborativeCodeEditor from "./CollaborativeCodeEditor";

const STORAGE_KEY = "docs:index:v1";

function loadIndex() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveIndex(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function nowISO() {
  return new Date().toISOString();
}

function generateDocId() {
  return "doc_" + Math.random().toString(36).slice(2, 11);
}

function RenameModal({ open, initialValue, onCancel, onConfirm }) {
  const [value, setValue] = useState(initialValue || "");

  useEffect(() => {
    if (open) setValue(initialValue || "");
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm(value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm, value]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <button
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        aria-label="Close rename dialog"
      />

      {/* dialog */}
      <div className="relative w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl">
        <div className="p-4 border-b border-neutral-800">
          <div className="text-lg font-semibold text-white">Rename document</div>
          <div className="text-sm text-neutral-400 mt-1">
            Choose a clear name so it’s easy to find later.
          </div>
        </div>

        <div className="p-4">
          <label className="block text-sm text-neutral-300 mb-2">Document name</label>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Untitled document"
          />
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-neutral-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-200 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(value)}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DocsApp() {
  // docs index: [{ id, title, lastEdited }]
  const [docs, setDocs] = useState(() => loadIndex());

  // active docId comes from URL: ?doc=...
  const [activeDocId, setActiveDocId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("doc") || "";
  });

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("grid"); // "grid" | "list"

  // keep docs saved
  useEffect(() => {
    saveIndex(docs);
  }, [docs]);

  // keep URL in sync with activeDocId
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeDocId) url.searchParams.set("doc", activeDocId);
    else url.searchParams.delete("doc");
    window.history.replaceState({}, "", url.toString());
  }, [activeDocId]);

  // find the active doc entry in our index
  const activeDoc = useMemo(() => {
    return docs.find((d) => d.id === activeDocId) || null;
  }, [docs, activeDocId]);

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = docs
      .slice()
      .sort((a, b) => (b.lastEdited || "").localeCompare(a.lastEdited || ""));
    if (!q) return sorted;
    return sorted.filter(
      (d) =>
        (d.title || "").toLowerCase().includes(q) ||
        (d.id || "").toLowerCase().includes(q)
    );
  }, [docs, query]);

  // ensure a doc exists in the index if someone opens a shared link ?doc=...
  useEffect(() => {
    if (!activeDocId) return;
    setDocs((prev) => {
      if (prev.some((d) => d.id === activeDocId)) return prev;
      return [
        { id: activeDocId, title: "Untitled document", lastEdited: nowISO() },
        ...prev,
      ];
    });
  }, [activeDocId]);

  const createDoc = () => {
    const id = generateDocId();
    setDocs((prev) => [
      { id, title: "Untitled document", lastEdited: nowISO() },
      ...prev,
    ]);
    setActiveDocId(id);
  };

  const openDoc = (id) => setActiveDocId(id);

  const deleteDoc = (id) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
    if (activeDocId === id) setActiveDocId("");
  };

  const renameDoc = (id, title) => {
    const clean = title.trim() || "Untitled document";
    setDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, title: clean, lastEdited: nowISO() } : d))
    );
  };

  const openRename = (id) => {
    setRenameTargetId(id);
    setRenameOpen(true);
  };

  const closeRename = () => {
    setRenameOpen(false);
    setRenameTargetId("");
  };

  const touchDoc = (id) => {
    setDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, lastEdited: nowISO() } : d))
    );
  };

  // HOME SCREEN
  if (!activeDocId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 text-white">
        {/* Top bar */}
        <div className="border-b border-neutral-800/80 bg-neutral-950/30 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
              <span className="font-black">{"</>"}</span>
            </div>

            <div className="flex-1">
              <div className="text-lg font-semibold">My Documents</div>
              <div className="text-xs text-neutral-400">
                Create, organize, and share collaborative code documents
              </div>
            </div>

            <button
              onClick={createDoc}
              className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg font-semibold shadow-sm"
            >
              + New
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          {/* Search + view controls */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
            <div className="flex-1">
              <div className="relative">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search documents by name or id…"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950/60 px-4 py-3 pr-10 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">
                  ⌘K
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setView("grid")}
                className={`px-3 py-2 rounded-lg border ${view === "grid"
                    ? "border-neutral-500 bg-neutral-800 text-white"
                    : "border-neutral-700 bg-neutral-900/40 text-neutral-300 hover:bg-neutral-800/60"
                  }`}
                title="Grid view"
              >
                ⬚⬚
              </button>
              <button
                onClick={() => setView("list")}
                className={`px-3 py-2 rounded-lg border ${view === "list"
                    ? "border-neutral-500 bg-neutral-800 text-white"
                    : "border-neutral-700 bg-neutral-900/40 text-neutral-300 hover:bg-neutral-800/60"
                  }`}
                title="List view"
              >
                ≡
              </button>
            </div>
          </div>

          {/* Templates / filler row (Google Docs vibe) */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-neutral-200">Start new</div>
              <div className="text-xs text-neutral-500">Templates</div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                onClick={createDoc}
                className="rounded-xl border border-neutral-700 bg-neutral-900/40 hover:bg-neutral-800/60 p-4 text-left transition"
              >
                <div className="text-2xl mb-2">＋</div>
                <div className="font-semibold">Blank</div>
                <div className="text-xs text-neutral-400 mt-1">Start from scratch</div>
              </button>

              <button
                onClick={() => {
                  const id = generateDocId();
                  setDocs((prev) => [
                    { id, title: "Interview Prep", lastEdited: nowISO() },
                    ...prev,
                  ]);
                  setActiveDocId(id);
                }}
                className="rounded-xl border border-neutral-700 bg-neutral-900/40 hover:bg-neutral-800/60 p-4 text-left transition"
              >
                <div className="text-2xl mb-2">🧠</div>
                <div className="font-semibold">Interview Prep</div>
                <div className="text-xs text-neutral-400 mt-1">Snippets + notes</div>
              </button>

              <button
                onClick={() => {
                  const id = generateDocId();
                  setDocs((prev) => [
                    { id, title: "Project Notes", lastEdited: nowISO() },
                    ...prev,
                  ]);
                  setActiveDocId(id);
                }}
                className="rounded-xl border border-neutral-700 bg-neutral-900/40 hover:bg-neutral-800/60 p-4 text-left transition"
              >
                <div className="text-2xl mb-2">🗂️</div>
                <div className="font-semibold">Project Notes</div>
                <div className="text-xs text-neutral-400 mt-1">Plans + todos</div>
              </button>

              <button
                onClick={() => {
                  const id = generateDocId();
                  setDocs((prev) => [
                    { id, title: "Code Review", lastEdited: nowISO() },
                    ...prev,
                  ]);
                  setActiveDocId(id);
                }}
                className="rounded-xl border border-neutral-700 bg-neutral-900/40 hover:bg-neutral-800/60 p-4 text-left transition"
              >
                <div className="text-2xl mb-2">✅</div>
                <div className="font-semibold">Code Review</div>
                <div className="text-xs text-neutral-400 mt-1">Checklist</div>
              </button>
            </div>
          </div>

          {/* Recent */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-neutral-200">Recent</div>
            <div className="text-xs text-neutral-500">
              {filteredDocs.length} document{filteredDocs.length === 1 ? "" : "s"}
            </div>
          </div>

          {/* Empty state */}
          {docs.length === 0 ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/30 p-8 text-center">
              <div className="text-3xl mb-3">📄</div>
              <div className="text-lg font-semibold">Create your first document</div>
              <div className="text-sm text-neutral-400 mt-1">
                You can share a link and edit together in real time.
              </div>
              <button
                onClick={createDoc}
                className="mt-5 inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 rounded-lg font-semibold"
              >
                + New document
              </button>
            </div>
          ) : (
            <>
              {/* Grid view */}
              {view === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredDocs.map((d) => (
                    <div
                      key={d.id}
                      className="bg-neutral-800/50 border border-neutral-700 rounded-2xl p-4 hover:border-neutral-500 transition"
                    >
                      <button
                        onClick={() => openDoc(d.id)}
                        className="text-left w-full"
                        title="Open document"
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-xl bg-neutral-900/70 border border-neutral-700 flex items-center justify-center">
                            <span className="text-lg">{"</>"}</span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-base truncate">
                              {d.title || "Untitled document"}
                            </div>
                            <div className="text-xs text-neutral-400 mt-1">
                              Last edited:{" "}
                              {d.lastEdited ? new Date(d.lastEdited).toLocaleString() : "—"}
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-1 font-mono truncate">
                              {d.id}
                            </div>
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-3 mt-4">
                        <button
                          onClick={() => openRename(d.id)}
                          className="text-sm text-neutral-200 hover:text-white underline"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => deleteDoc(d.id)}
                          className="text-sm text-neutral-300 hover:text-white ml-auto px-2 py-1 rounded-md hover:bg-neutral-700"
                          title="Delete"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* List view */
                <div className="rounded-2xl border border-neutral-800 overflow-hidden">
                  <div className="grid grid-cols-12 bg-neutral-900/50 px-4 py-2 text-xs text-neutral-400">
                    <div className="col-span-6">Name</div>
                    <div className="col-span-4">Last edited</div>
                    <div className="col-span-2 text-right">Actions</div>
                  </div>

                  {filteredDocs.map((d) => (
                    <div
                      key={d.id}
                      className="grid grid-cols-12 items-center px-4 py-3 border-t border-neutral-800 bg-neutral-950/20 hover:bg-neutral-900/40 transition"
                    >
                      <button
                        onClick={() => openDoc(d.id)}
                        className="col-span-6 text-left min-w-0"
                      >
                        <div className="font-semibold truncate">
                          {d.title || "Untitled document"}
                        </div>
                        <div className="text-[11px] text-neutral-500 font-mono truncate">
                          {d.id}
                        </div>
                      </button>

                      <div className="col-span-4 text-xs text-neutral-400">
                        {d.lastEdited ? new Date(d.lastEdited).toLocaleString() : "—"}
                      </div>

                      <div className="col-span-2 flex justify-end gap-2">
                        <button
                          onClick={() => openRename(d.id)}
                          className="px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-200 hover:bg-neutral-800 text-sm"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => deleteDoc(d.id)}
                          className="px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-200 hover:bg-neutral-800 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Rename modal stays here (your existing one) */}
          <RenameModal
            open={renameOpen}
            initialValue={docs.find((x) => x.id === renameTargetId)?.title || "Untitled document"}
            onCancel={closeRename}
            onConfirm={(val) => {
              renameDoc(renameTargetId, val);
              closeRename();
            }}
          />
        </div>
      </div>
    );
  }

  // EDITOR SCREEN
  return (
    <>
      <CollaborativeCodeEditor
        docId={activeDocId}
        title={activeDoc?.title || "Untitled document"}
        onBackHome={() => setActiveDocId("")}
        onRename={() => openRename(activeDocId)}
        onTouched={() => touchDoc(activeDocId)}
      />

      <RenameModal
        open={renameOpen}
        initialValue={activeDoc?.title || "Untitled document"}
        onCancel={closeRename}
        onConfirm={(val) => {
          renameDoc(activeDocId, val);
          closeRename();
        }}
      />
    </>
  );

}
