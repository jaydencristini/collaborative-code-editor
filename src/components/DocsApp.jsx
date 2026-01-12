import { useEffect, useRef, useState } from "react";
import CollaborativeCodeEditor from "./CollaborativeCodeEditor";

export default function DocsApp() {
  const [ownedDocs, setOwnedDocs] = useState([]);
  const [sharedDocs, setSharedDocs] = useState([]);
  const [activeDocId, setActiveDocId] = useState(null);

  const [accountOpen, setAccountOpen] = useState(false);
  const accountBtnRef = useRef(null);
  const accountMenuRef = useRef(null);

  const userEmail =
    (() => {
      try {
        return localStorage.getItem("userEmail") || "";
      } catch {
        return "";
      }
    })();

  const avatarLetter = (userEmail || "A").trim().charAt(0).toUpperCase();

  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  /* ---------------- LOAD DOCS ---------------- */
  useEffect(() => {
    fetch("/api/docs", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setOwnedDocs(data.owned || []);
        setSharedDocs(data.shared || []);
      });
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const token = sp.get("share");
    if (!token) return;

    (async () => {
      const res = await fetch("/api/share/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ docId, email, permission }),
      })


      if (res.ok) {
        const data = await res.json();
        setActiveDocId(data.docId);

        // refresh lists so it appears under "Shared with me"
        const listRes = await fetch("/api/docs", { credentials: "include" })
        const listData = await listRes.json();
        setOwnedDocs(listData.owned || []);
        setSharedDocs(listData.shared || []);

        // remove ?share=... from URL
        sp.delete("share");
        const next = `${window.location.pathname}${sp.toString() ? "?" + sp.toString() : ""}`;
        window.history.replaceState({}, "", next);
      } else {
        alert("That share link is invalid or expired.");
      }
    })();
  }, []);

  useEffect(() => {
    const onDown = (e) => {
      if (!accountOpen) return;

      const btn = accountBtnRef.current;
      const menu = accountMenuRef.current;

      // close if clicked outside both the button and the menu
      if (btn && btn.contains(e.target)) return;
      if (menu && menu.contains(e.target)) return;

      setAccountOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [accountOpen]);

  const allDocs = [...ownedDocs, ...sharedDocs];
  const activeDoc = allDocs.find((d) => d.id === activeDocId);


  /* ---------------- ACTIONS ---------------- */
  const createDoc = async () => {
    const id = "doc_" + Math.random().toString(36).slice(2);
    const title = "Untitled document";

    setOwnedDocs((d) => [{ id, title }, ...d]);
    setActiveDocId(id);

    await fetch("/api/share/docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ docId, email, permission }),
    })
  };

  const deleteDoc = async (id) => {
    setOwnedDocs((d) => d.filter((x) => x.id !== id));
    if (id === activeDocId) setActiveDocId(null);

    await fetch("/api/docs", { method: "DELETE", credentials: "include" });
  };

  const startRename = (doc) => {
    setRenamingId(doc.id);
    setRenameValue(doc.title);
  };

  const confirmRename = async () => {
    if (!renamingId) return;

    setOwnedDocs((d) =>
      d.map((doc) =>
        doc.id === renamingId
          ? { ...doc, title: renameValue || "Untitled document" }
          : doc
      )
    );


    await fetch("/api/docs",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: renameValue }),
      }
    );

    setRenamingId(null);
    setRenameValue("");
  };

  const logout = async () => {
    await fetch("/api/logout",
      { method: "POST", credentials: "include" }
    );
    window.location.reload();
  };

  /* ---------------- HOME ---------------- */
  if (!activeDocId) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `
      radial-gradient(circle at 20% 30%, rgba(255,255,255,0.35) 0.5px, transparent 0.5px),
      radial-gradient(circle at 80% 70%, rgba(255,255,255,0.3) 0.5px, transparent 0.5px),
      radial-gradient(circle at 50% 50%, rgba(255,255,255,0.25) 0.5px, transparent 0.5px)
    `,
            backgroundSize: "120px 120px",
          }}
        />

        {/* Top bar */}
        <div className="border-b border-neutral-800 px-6 py-4 flex justify-between items-center">
          {/* Brand */}
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="w-9 h-9 rounded-lg flex items-center justify-center transition-transform hover:scale-105
                bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-500 shadow-lg">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {/* Document outline */}
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />

                {/* Code brackets */}
                <path d="M10 13l-2 2 2 2" />
                <path d="M14 17l2-2-2-2" />
              </svg>
            </div>

            {/* Brand name */}
            <span className="text-lg font-semibold tracking-tight">
              CollabDocs
            </span>
          </div>

          {/* Account */}
          <div className="relative">
            <button
              ref={accountBtnRef}
              onClick={() => setAccountOpen((v) => !v)}
              className="w-10 h-10 rounded-full flex items-center justify-center
               bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-500
               shadow-lg border border-white/10 hover:brightness-110 transition"
              aria-label="Account menu"
            >
              <span className="text-sm font-semibold text-white">{avatarLetter}</span>
            </button>

            {accountOpen && (
              <div
                ref={accountMenuRef}
                className="absolute right-0 mt-2 w-64 rounded-xl border border-neutral-700
                 bg-neutral-900/95 backdrop-blur shadow-xl overflow-hidden z-50"
              >
                <div className="px-4 py-3 border-b border-neutral-800">
                  <div className="text-xs text-neutral-400">Signed in as</div>
                  <div className="text-sm font-medium truncate">
                    {userEmail || "Unknown user"}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setAccountOpen(false);
                    logout();
                  }}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-neutral-800 transition"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>

        </div>

        <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">
          <h1 className="text-2xl font-semibold">
            My Documents
          </h1>
          {/* Start new */}
          <section>
            <h2 className="text-sm font-semibold text-neutral-400 mb-4">
              Start a new document
            </h2>

            <div className="flex gap-4">
              <button
                onClick={createDoc}
                className="w-40 h-52 rounded-xl border border-neutral-700 bg-neutral-800
           hover:bg-neutral-700/80 hover:shadow-lg
           flex flex-col items-center justify-center transition"
              >
                <div className="text-4xl mb-3">+</div>
                <div className="text-sm font-medium">Blank</div>
              </button>
            </div>
          </section>

          {/* Recent docs */}
          {/* My documents */}
          <section>
            <h2 className="text-sm font-semibold text-neutral-400 mb-4">
              My documents
            </h2>

            {ownedDocs.length === 0 ? (
              <div className="text-neutral-500 text-sm">
                No documents yet. Create one to get started.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {ownedDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="border border-neutral-700 rounded-xl p-4 hover:bg-neutral-800 transition"
                  >
                    <button
                      onClick={() => setActiveDocId(doc.id)}
                      className="text-left w-full"
                    >
                      <div className="font-semibold truncate">
                        {doc.title}
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        Last edited{" "}
                        {doc.lastEdited
                          ? new Date(doc.lastEdited).toLocaleString()
                          : ""}
                      </div>
                    </button>

                    <div className="flex gap-3 mt-3 text-sm">
                      <button
                        onClick={() => startRename(doc)}
                        className="underline"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => deleteDoc(doc.id)}
                        className="ml-auto text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Shared with me */}
          <section>
            <h2 className="text-sm font-semibold text-neutral-400 mb-4">
              Shared with me
            </h2>

            {sharedDocs.length === 0 ? (
              <div className="text-neutral-500 text-sm">
                Nothing shared with you yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {sharedDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="border border-neutral-700 rounded-xl p-4 hover:bg-neutral-800 transition"
                  >
                    <button
                      onClick={() => setActiveDocId(doc.id)}
                      className="text-left w-full"
                    >
                      <div className="font-semibold truncate">
                        {doc.title}
                      </div>

                      <div className="text-xs text-neutral-400 mt-1">
                        From {doc.ownerEmail || "unknown"} •{" "}
                        {doc.lastEdited
                          ? new Date(doc.lastEdited).toLocaleString()
                          : ""}
                      </div>
                    </button>

                    <div className="flex gap-3 mt-3 text-sm">
                      <span className="text-neutral-400">
                        {doc.permission === "view" ? "View only" : "Can edit"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Rename modal (unchanged) */}
        {renamingId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
            <div className="bg-neutral-800 p-4 rounded w-80">
              <div className="mb-2 font-semibold">Rename document</div>
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="w-full p-2 bg-neutral-900 border rounded"
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={() => setRenamingId(null)}>Cancel</button>
                <button
                  onClick={confirmRename}
                  className="px-3 py-1 rounded font-medium text-white
             bg-gradient-to-r from-indigo-500 via-purple-500 to-blue-500
             hover:from-indigo-600 hover:via-purple-600 hover:to-blue-600"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }


  /* ---------------- EDITOR ---------------- */
  const isOwned = ownedDocs.some((d) => d.id === activeDocId);
  const canEdit = isOwned ? true : (activeDoc?.permission !== "view");
  const canShare = isOwned ? true : (activeDoc?.permission === "edit"); // allow editors to share links too
  const canManageShares = isOwned; // only owners can view/edit the share list

  return (
    <CollaborativeCodeEditor
      docId={activeDocId}
      title={activeDoc?.title}
      onBackHome={() => setActiveDocId(null)}
      onRename={() => activeDoc && isOwned && startRename(activeDoc)}
      canEdit={canEdit}
      canShare={canShare}
      canManageShares={canManageShares}
    />
  );
}