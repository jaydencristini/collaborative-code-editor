import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, Users, Share2, Code2, Wifi, WifiOff, Moon, Sun } from 'lucide-react';

export default function CollaborativeCodeEditor({
    docId,
    title,
    onBackHome,
    onRename,
    onTouched,
    canEdit = true,
    canShare = true,
    canManageShares = false,
}) {
    const [code, setCode] = useState('');
    const [language, setLanguage] = useState('javascript');
    // const [docId, setDocId] = useState('');
    // const [isOwner, setIsOwner] = useState(false);
    const [copied, setCopied] = useState(false);
    const [activeUsers, setActiveUsers] = useState(1);
    const [connected, setConnected] = useState(false);
    const [darkMode, setDarkMode] = useState(true);
    const [remoteCursors, setRemoteCursors] = useState({});
    const [shareOpen, setShareOpen] = useState(false);
    const [shareEmail, setShareEmail] = useState("");
    const [sharePermission, setSharePermission] = useState("edit"); // 'edit' | 'view'
    const [shareError, setShareError] = useState("");
    const [shareBusy, setShareBusy] = useState(false);
    const [shareListBusy, setShareListBusy] = useState(false);
    const [shareListError, setShareListError] = useState("");
    const [shareList, setShareList] = useState([]); // [{ email, permission }]
    const [ownerEmail, setOwnerEmail] = useState("");
    const [shareListSaving, setShareListSaving] = useState(false);

    const textareaRef = useRef(null);
    const highlightRef = useRef(null);
    const wsRef = useRef(null);
    const updateTimeoutRef = useRef(null);
    const applyingRemoteRef = useRef(false);
    const reconnectTimerRef = useRef(null);
    const reconnectAttemptRef = useRef(0);
    const clientIdRef = useRef(crypto?.randomUUID?.() ?? `c_${Math.random().toString(36).slice(2)}`);
    const cursorSendTimeoutRef = useRef(null);

    const LINE_HEIGHT_PX = 24; // must match visual line spacing everywhere
    const gutterWidthClass = "w-10 sm:w-12";            // line number gutter width
    const editorLeftPadClass = "pl-14 sm:pl-16";        // textarea padding-left to clear gutter
    const editorPaddingClass = "p-3 sm:p-4";            // inner padding
    const editorFontClass = "text-base sm:text-sm"; // base ~16px on mobile

    <style>{`
        :root {
            --galaxy-indigo: #6366f1;
            --galaxy-purple: #8b5cf6;
            --galaxy-blue: #3b82f6;
        }
    `}</style>

    function getCursorLineCol(text, index) {
        const before = text.slice(0, index);
        const lines = before.split("\n");
        return {
            line: lines.length - 1,
            col: lines[lines.length - 1].length
        };
    }

    function cursorToPixels({ line, col }) {
        return {
            top: line * LINE_HEIGHT_PX,
            left: col * 8 // approx monospace char width
        };
    }

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        setDarkMode(mediaQuery.matches);
        const handler = (e) => setDarkMode(e.matches);
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    useEffect(() => {
        if (!docId) return;

        let cancelled = false;

        const connect = () => {
            if (cancelled) return;

            // close any existing socket (prevents ghost state)
            if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
                try { wsRef.current.close(); } catch { }
            }

            setConnected(false);

            const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
            const wsUrl = `${wsProtocol}://${window.location.host}`;
            const ws = new WebSocket(wsUrl);

            wsRef.current = ws;

            ws.onopen = () => {
                if (cancelled) return;
                if (wsRef.current !== ws) return; // stale socket guard

                reconnectAttemptRef.current = 0;
                setConnected(true);
                ws.send(JSON.stringify({
                    type: "join",
                    docId,
                    clientId: clientIdRef.current
                }));
            };

            ws.onmessage = (event) => {
                if (cancelled) return;
                if (wsRef.current !== ws) return; // stale socket guard

                const message = JSON.parse(event.data);
                switch (message.type) {
                    case "init":
                        if (message.data) {
                            applyingRemoteRef.current = true;
                            setCode(message.data.code || "");
                            setLanguage(message.data.language || "javascript");
                            setTimeout(() => (applyingRemoteRef.current = false), 0);
                        }
                        break;

                    case "update":
                        if (message.clientId === clientIdRef.current) break;
                        setCode(message.data.code);
                        setLanguage(message.data.language);
                        break;

                    case "userCount":
                        setActiveUsers(message.count);
                        break;

                    case "cursor": {
                        broadcast(
                            ws._docId,
                            {
                                type: "cursor",
                                clientId: ws._clientId,
                                data: msg.data
                            },
                            ws // exclude sender
                        );
                        break;
                    }
                }
            };

            const scheduleReconnect = () => {
                if (cancelled) return;
                if (wsRef.current !== ws) return; // stale socket guard

                setConnected(false);

                // backoff: 250ms, 500ms, 1000ms, 2000ms, 4000ms (cap)
                const attempt = reconnectAttemptRef.current++;
                const delay = Math.min(4000, 250 * Math.pow(2, attempt));

                if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = setTimeout(connect, delay);
            };

            ws.onclose = scheduleReconnect;
            ws.onerror = () => {
                // onerror is often followed by onclose, but not always; ensure we reconnect
                try { ws.close(); } catch { }
                scheduleReconnect();
            };
        };

        connect();

        return () => {
            cancelled = true;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            try { wsRef.current?.close(); } catch { }
            wsRef.current = null;
            setConnected(false);
        };
    }, [docId]);


    useEffect(() => {
        autoResizeEditor();
    }, [code, language]);


    //const generateDocId = () => 'doc_' + Math.random().toString(36).substr(2, 9);

    const autoResizeEditor = () => {
        const ta = textareaRef.current;
        const hi = highlightRef.current;
        if (!ta || !hi) return;

        // allow shrinking when deleting text
        ta.style.height = 'auto';

        // grow to content (minimum 500px)
        const nextHeight = Math.max(500, ta.scrollHeight);
        ta.style.height = `${nextHeight}px`;
        hi.style.height = `${nextHeight}px`;
    };


    const escapeHtml = (text) => {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    const highlightCode = (code, lang) => {
        if (!code) return '';

        const kw = {
            javascript:
                'const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|super|extends|static|get|set|typeof|instanceof|delete|void|yield|break|continue|switch|case|default|do|in|of',
            typescript:
                'const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|super|extends|static|get|set|typeof|instanceof|delete|void|yield|break|continue|switch|case|default|do|interface|type|enum|namespace|abstract|readonly|public|private|protected|implements|as|in|of',
            python:
                'def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|with|lambda|pass|break|continue|global|nonlocal|assert|raise|yield|async|await|match|case'
        };

        const language = lang in kw ? lang : 'javascript';
        const isKeyword = new RegExp(`^(?:${kw[language] || kw.javascript})$`);

        // === Pass 1: collect declared identifiers (so we only highlight real vars) ===
        const declared = new Set();

        if (language === 'python') {
            // def foo(
            for (const m of code.matchAll(/\bdef\s+([A-Za-z_]\w*)\b/g)) declared.add(m[1]);
            // class Foo
            for (const m of code.matchAll(/\bclass\s+([A-Za-z_]\w*)\b/g)) declared.add(m[1]);
            // simple assignments: name =
            for (const m of code.matchAll(/\b([A-Za-z_]\w*)\s*=(?!=)/g)) declared.add(m[1]);
        } else {
            // function foo
            for (const m of code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\b/g)) declared.add(m[1]);
            // class Foo
            for (const m of code.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)\b/g)) declared.add(m[1]);
            // const/let/var foo
            for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/g)) declared.add(m[1]);
            // const foo = (...) =>
            for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)) {
                declared.add(m[1]);
            }
            // (optional) add parameters from function foo(a,b) { ... }
            for (const m of code.matchAll(/\bfunction\s+[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g)) {
                m[1]
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean)
                    .forEach(p => {
                        const name = p.replace(/=.*$/, '').replace(/:.*/, '').replace(/^\.\.\./, '').trim();
                        if (name) declared.add(name);
                    });
            }
            // (optional) add arrow params: (a,b) => or a =>
            for (const m of code.matchAll(/(?:\(([^)]*)\)|\b([A-Za-z_$][\w$]*)\b)\s*=>/g)) {
                const params = (m[1] ?? m[2] ?? '').trim();
                if (!params) continue;
                params
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean)
                    .forEach(p => {
                        const name = p.replace(/=.*$/, '').replace(/:.*/, '').replace(/^\.\.\./, '').trim();
                        if (name) declared.add(name);
                    });
            }
        }

        // === Pass 2: highlight using a master regex (no "catch-all variableRef" coloring) ===
        const masters = {
            javascript: new RegExp(
                [
                    '(?<comment>//.*$|/\\*[\\s\\S]*?\\*/)',
                    '(?<string>`(?:\\\\.|[^`\\\\])*`|"(?:\\\\.|[^"\\\\])*"|' + "'(?:\\\\.|[^'\\\\])*')",
                    '(?<arrowDecl>\\b(?<arrowKw>const|let|var)\\s+(?<arrowName>[A-Za-z_$][\\w$]*)\\s*=\\s*(?:async\\s*)?(?:\\([^\\)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>)',
                    '(?<funcDecl>\\b(?<funcKw>function)\\s+(?<funcName>[A-Za-z_$][\\w$]*)\\b)',
                    '(?<classDecl>\\b(?<classKw>class)\\s+(?<className>[A-Za-z_$][\\w$]*)\\b)',
                    '(?<varDecl>\\b(?<varKw>const|let|var)\\s+(?<varName>[A-Za-z_$][\\w$]*)\\b)',
                    `(?<keyword>\\b(?:${kw.javascript})\\b)`,
                    '(?<boolean>\\b(?:true|false|null|undefined)\\b)',
                    '(?<number>\\b\\d+(?:\\.\\d+)?\\b)',

                    // identifiers (for references) — we will only color if in `declared`
                    '(?<ident>(?<!\\.)\\b[A-Za-z_$][\\w$]*\\b)',

                    '(?<funcCall>\\b(?<callName>[A-Za-z_$][\\w$]*)\\s*(?=\\())'
                ].join('|'),
                'gm'
            ),

            typescript: new RegExp(
                [
                    '(?<comment>//.*$|/\\*[\\s\\S]*?\\*/)',
                    '(?<string>`(?:\\\\.|[^`\\\\])*`|"(?:\\\\.|[^"\\\\])*"|' + "'(?:\\\\.|[^'\\\\])*')",
                    '(?<arrowDecl>\\b(?<arrowKw>const|let|var)\\s+(?<arrowName>[A-Za-z_$][\\w$]*)\\s*=\\s*(?:async\\s*)?(?:\\([^\\)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>)',
                    '(?<funcDecl>\\b(?<funcKw>function)\\s+(?<funcName>[A-Za-z_$][\\w$]*)\\b)',
                    '(?<classDecl>\\b(?<classKw>class)\\s+(?<className>[A-Za-z_$][\\w$]*)\\b)',
                    '(?<varDecl>\\b(?<varKw>const|let|var)\\s+(?<varName>[A-Za-z_$][\\w$]*)\\b)',
                    `(?<keyword>\\b(?:${kw.typescript})\\b)`,
                    '(?<boolean>\\b(?:true|false|null|undefined)\\b)',
                    '(?<number>\\b\\d+(?:\\.\\d+)?\\b)',
                    '(?<ident>(?<!\\.)\\b[A-Za-z_$][\\w$]*\\b)',
                    '(?<funcCall>\\b(?<callName>[A-Za-z_$][\\w$]*)\\s*(?=\\())'
                ].join('|'),
                'gm'
            ),

            python: new RegExp(
                [
                    '(?<comment>#[^\\n]*)',
                    '(?<string>\'\'\'[\\s\\S]*?\'\'\'|"""[\\s\\S]*?"""|\'(?:[^\'\\\\]|\\\\.)*\'|"(?:[^"\\\\]|\\\\.)*")',
                    '(?<funcDecl>\\b(?<funcKw>def)\\s+(?<funcName>[A-Za-z_][\\w]*)\\b)',
                    '(?<classDecl>\\b(?<classKw>class)\\s+(?<className>[A-Za-z_][\\w]*)\\b)',
                    '(?<varDecl>\\b(?<varName>[A-Za-z_][\\w]*)\\s*=(?!=))',
                    `(?<keyword>\\b(?:${kw.python})\\b)`,
                    '(?<boolean>\\b(?:True|False|None)\\b)',
                    '(?<number>\\b\\d+(?:\\.\\d+)?\\b)',
                    '(?<ident>(?<!\\.)\\b[A-Za-z_][\\w]*\\b)',
                    '(?<funcCall>\\b(?<callName>[A-Za-z_][\\w]*)\\s*(?=\\())'
                ].join('|'),
                'gm'
            )
        };

        const master = masters[language] || masters.javascript;
        const wrap = (cls, text) => `<span class="${cls}">${escapeHtml(text)}</span>`;

        let out = '';
        let lastIndex = 0;

        master.lastIndex = 0;
        let m;
        while ((m = master.exec(code)) !== null) {
            const start = m.index;
            const end = start + m[0].length;

            if (start > lastIndex) out += escapeHtml(code.slice(lastIndex, start));

            const g = m.groups || {};

            if (g.comment) out += wrap('token-comment', g.comment);
            else if (g.string) out += wrap('token-string', g.string);
            else if (g.arrowDecl) {
                const kwText = g.arrowKw;
                const name = g.arrowName;
                const rest = g.arrowDecl.slice(kwText.length).replace(/^\s+/, '');
                const namePos = rest.indexOf(name);
                const beforeName = rest.slice(0, namePos);
                const afterName = rest.slice(namePos + name.length);
                out += wrap('token-keyword', kwText) + ' ' + escapeHtml(beforeName) + wrap('token-function', name) + escapeHtml(afterName);
            } else if (g.funcDecl) {
                out += wrap('token-keyword', g.funcKw) + ' ' + wrap('token-function', g.funcName);
            } else if (g.classDecl) {
                out += wrap('token-keyword', g.classKw) + ' ' + wrap('token-function', g.className);
            } else if (g.varDecl && language !== 'python') {
                out += wrap('token-keyword', g.varKw) + ' ' + wrap('token-variable', g.varName);
            } else if (g.varDecl && language === 'python') {
                const raw = m[0];
                const name = g.varName;
                const eq = raw.slice(name.length);
                out += wrap('token-variable', name) + escapeHtml(eq);
            } else if (g.keyword) out += wrap('token-keyword', g.keyword);
            else if (g.boolean) out += wrap('token-boolean', g.boolean);
            else if (g.number) out += wrap('token-number', g.number);
            else if (g.funcCall) out += wrap('token-function', g.callName);
            else if (g.ident) {
                // ONLY highlight references if we've seen it declared
                if (isKeyword.test(g.ident)) out += wrap('token-keyword', g.ident);
                else if (declared.has(g.ident)) out += wrap('token-variable', g.ident);
                else out += escapeHtml(g.ident);
            } else {
                out += escapeHtml(m[0]);
            }

            lastIndex = end;
        }

        if (lastIndex < code.length) out += escapeHtml(code.slice(lastIndex));
        return out;
    };


    const handleCodeChange = (e) => {
        const next = e.target.value;
        setCode(next);

        // If this change came from a remote update, don't broadcast it back
        if (applyingRemoteRef.current) return;

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        // debounce sends so we don't spam
        if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);

        updateTimeoutRef.current = setTimeout(() => {
            wsRef.current.send(JSON.stringify({
                type: "update",
                docId,
                code: next,
                language,
                clientId: clientIdRef.current
            }));

        }, 120);
    };
    const handleLanguageChange = (e) => {
        const nextLang = e.target.value;
        setLanguage(nextLang);

        if (applyingRemoteRef.current) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        wsRef.current.send(JSON.stringify({ type: 'update', docId, code, language: nextLang }));
    };

    const shareByEmail = async () => {
        setShareError("");
        setShareBusy(true);

        try {
            const res = await fetch(
                "/api/share/grant",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        docId,
                        email: shareEmail.trim(),
                        permission: sharePermission,
                    }),
                }
            );

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setShareError(data.error || "Failed to share document");
                return;
            }

            // keep modal open so owner can immediately manage permissions
            await loadShareList();
            setShareEmail("");
            setSharePermission("edit");
        } catch {
            setShareError("Network error");
        } finally {
            setShareBusy(false);
        }
    };

    const loadShareList = async () => {
        if (!canManageShares) return;
        setShareListError("");
        setShareListBusy(true);
        try {
            const res = await fetch(`/api/share/list?docId=${encodeURIComponent(docId)}`,
                { credentials: "include" }
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setShareListError(data.error || "Failed to load share list");
                setShareList([]);
                return;
            }
            setOwnerEmail(data.ownerEmail || "");
            setShareList(Array.isArray(data.shares) ? data.shares : []);
        } catch {
            setShareListError("Network error");
            setShareList([]);
        } finally {
            setShareListBusy(false);
        }
    };

    const setSharePermissionFor = async (email, permission) => {
        if (!canManageShares) return;

        // Optimistic UI update
        setShareList((prev) =>
            prev.map((x) => (x.email === email ? { ...x, permission } : x))
        );

        try {
            const res = await fetch("/api/share/set-permission", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ docId, email, permission }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                // revert by reloading truth from server
                await loadShareList();
                alert(data.error || "Failed to update permission");
            }
        } catch {
            await loadShareList();
            alert("Network error");
        }
    };

    const setPermissionForEmail = async (email, permission) => {
        setShareListError("");
        setShareListSaving(true);

        try {
            const res = await fetch(
                "/api/share/set-permission",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ docId, email, permission }),
                }
            );

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setShareListError(data.error || "Failed to update permission");
                return;
            }

            // refresh list so UI is always correct
            await loadShareList();
        } catch {
            setShareListError("Network error updating permission");
        } finally {
            setShareListSaving(false);
        }
    };

    const revokeEmail = async (email) => {
        setShareListError("");
        setShareListSaving(true);

        try {
            const res = await fetch(
                "/api/share/revoke",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ docId, email }),
                }
            );

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setShareListError(data.error || "Failed to remove access");
                return;
            }

            await loadShareList();
        } catch {
            setShareListError("Network error removing access");
        } finally {
            setShareListSaving(false);
        }
    };

    const copyShareLink = async () => {
        try {
            const res = await fetch("/api/share/create-link", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ docId, permission: "edit" }), // or "view"
            });

            if (!res.ok) throw new Error("failed to create link");
            const data = await res.json();

            const url = `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(
                data.token
            )}`;

            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(url);
            } else {
                const ta = document.createElement("textarea");
                ta.value = url;
                ta.setAttribute("readonly", "");
                ta.style.position = "fixed";
                ta.style.top = "-1000px";
                ta.style.left = "-1000px";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
            }

            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error(err);
            alert("Couldn’t create/copy a share link.");
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = e.target.selectionStart;
            const end = e.target.selectionEnd;
            const newCode = code.substring(0, start) + '  ' + code.substring(end);
            setCode(newCode);
            setTimeout(() => {
                textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
            }, 0);
        }
    };

    const bgClass = darkMode
        ? 'bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 text-white'
        : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 text-gray-900';
    const headerClass = darkMode
        ? 'bg-neutral-800/50 backdrop-blur-sm border-neutral-700'
        : 'bg-white/70 backdrop-blur-sm border-gray-200 shadow-sm';
    const controlsClass = darkMode ? 'bg-neutral-800/30 border-neutral-700' : 'bg-white/50 border-gray-200';
    const editorBgClass = darkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-300';
    const lineNumberClass = darkMode
        ? 'bg-neutral-800/50 border-neutral-700 text-neutral-500'
        : 'bg-gray-50 border-gray-200 text-gray-400';
    const textClass = darkMode ? 'text-white' : 'text-gray-900';
    const mutedTextClass = darkMode ? 'text-neutral-400' : 'text-gray-600';
    const accentTextClass = darkMode ? 'text-indigo-400' : 'text-blue-600';
    const selectClass = darkMode ? 'bg-neutral-700 border-neutral-600 text-white' : 'bg-white border-gray-300 text-gray-900';
    const footerClass = darkMode ? 'bg-neutral-800/30 border-neutral-700' : 'bg-white/50 border-gray-200';

    return (
        <div className={`min-h-screen ${bgClass} p-2 sm:p-4 transition-colors duration-300`}>
            <style>{`
        .token-variable { color: ${darkMode ? '#f1fa8c' : '#b08800'}; }
        .token-keyword { color: ${darkMode ? '#ff79c6' : '#d73a49'}; font-weight: 600; }
        .token-string { color: ${darkMode ? '#50fa7b' : '#22863a'}; }
        .token-comment { color: ${darkMode ? '#6272a4' : '#6a737d'}; font-style: italic; }
        .token-number { color: ${darkMode ? '#bd93f9' : '#005cc5'}; }
        .token-function { color: ${darkMode ? '#8be9fd' : '#6f42c1'}; }
        .token-boolean { color: ${darkMode ? '#582d96ff' : '#d73a49'}; }
        .token-operator { color: ${darkMode ? '#582d96ff' : '#d73a49'}; }
        .token-tag { color: ${darkMode ? '#ff79c6' : '#d73a49'}; }
        .token-attribute { color: ${darkMode ? '#50fa7b' : '#22863a'}; }
        .token-property { color: ${darkMode ? '#ff79c6' : '#d73a49'}; }
      `}</style>

            <div className="max-w-6xl mx-auto">
                <div className={`${headerClass} rounded-t-xl border p-3 sm:p-4 transition-colors duration-300`}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg shadow-lg">
                                <Code2 size={24} className="text-white" />
                            </div>
                            <div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={onBackHome}
                                        className="px-3 py-2 rounded-lg hover:bg-white/10 border border-white/10"
                                        title="Back to documents"
                                    >
                                        ←
                                    </button>

                                    <button
                                        onClick={onRename}
                                        className={`text-xl font-bold ${textClass} text-left hover:underline`}
                                        title="Rename"
                                    >
                                        {title}
                                    </button>
                                </div>

                                <p className={`text-sm ${mutedTextClass}`}>Real-time collaboration</p>

                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div
                                className={`flex items-center gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg ${darkMode ? connected
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-red-500/20 text-red-400'
                                    : connected
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-red-100 text-red-700'
                                    }`}
                            >
                                {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
                                <span className="text-xs sm:text-sm hidden xs:inline">
                                    {connected ? 'Connected' : 'Disconnected'}
                                </span>

                            </div>

                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${darkMode ? 'bg-neutral-700/50' : 'bg-white shadow-sm border border-gray-200'}`}>
                                <Users size={16} className={darkMode ? 'text-indigo-400' : 'text-green-600'} />
                                <span className={`text-sm ${textClass}`}>{activeUsers} online</span>
                            </div>

                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${darkMode ? 'bg-neutral-700/50' : 'bg-white shadow-sm border border-gray-200'}`}>
                                {darkMode ? <Moon size={16} className="text-violet-400" /> : <Sun size={16} className="text-amber-500" />}
                                <span className={`text-sm ${textClass}`}>{darkMode ? 'Dark' : 'Light'}</span>
                            </div>

                            {canShare && (
                                <button
                                    onClick={() => {
                                        setShareError("");
                                        setShareEmail("");
                                        setSharePermission("edit");
                                        setShareOpen(true);

                                        // load the share list when opening the modal (owners only)
                                        if (canManageShares) loadShareList();
                                    }}
                                    className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-3 sm:px-4 py-2 rounded-lg transition-all shadow-md hover:shadow-lg"
                                >
                                    Share
                                </button>
                            )}

                        </div>
                    </div>
                </div>

                <div className={`${controlsClass} border-x border p-3 transition-colors duration-300`}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <label className="flex items-center gap-2 text-sm">
                            <span className={mutedTextClass}>Language:</span>
                        </label>

                        <select
                            value={language}
                            onChange={handleLanguageChange}
                            className={`${selectClass} border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors duration-300`}
                        >
                            <option value="javascript">JavaScript</option>
                            <option value="python">Python</option>
                            <option value="java">Java</option>
                            <option value="cpp">C++</option>
                            <option value="html">HTML</option>
                            <option value="css">CSS</option>
                            <option value="typescript">TypeScript</option>
                            <option value="rust">Rust</option>
                            <option value="go">Go</option>
                        </select>

                        <div className={`text-xs ${mutedTextClass} sm:ml-auto`}>
                            Document ID: <span className={`font-mono ${accentTextClass}`}>{docId}</span>
                        </div>
                    </div>
                </div>

                <div className={`${editorBgClass} border rounded-b-xl overflow-hidden transition-colors duration-300 shadow-[0_0_0_1px_rgba(139,92,246,0.15),0_20px_60px_-15px_rgba(59,130,246,0.25)]`}>
                    <div className="relative">
                        <div className={`absolute left-0 top-0 bottom-0 ${gutterWidthClass} ${lineNumberClass} border-r ${editorPaddingClass} text-right ${editorFontClass} font-mono select-none overflow-hidden transition-colors duration-300 z-10`}>
                            {code.split('\n').map((_, i) => (
                                <div
                                    key={i}
                                    style={{ height: `${LINE_HEIGHT_PX}px`, lineHeight: `${LINE_HEIGHT_PX}px` }}
                                    className="flex items-center justify-end"
                                >
                                    {i + 1}
                                </div>
                            ))}
                        </div>

                        <div
                            ref={highlightRef}
                            className={`absolute left-10 sm:left-12 top-0 w-[calc(100%-2.5rem)] sm:w-[calc(100%-3rem)] ${editorPaddingClass} font-mono ${editorFontClass} pointer-events-none whitespace-pre`}
                            style={{ height: 500, lineHeight: `${LINE_HEIGHT_PX}px` }}
                            dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }}
                        />

                        {/* --- Collaborator cursors overlay (INSERT HERE) --- */}
                        <div
                            className={`absolute left-10 sm:left-12 top-0 w-[calc(100%-2.5rem)] sm:w-[calc(100%-3rem)] ${editorPaddingClass} pointer-events-none z-15`}
                            style={{ height: 500 }}
                        >
                            {Object.entries(remoteCursors).map(([id, cursor]) => {
                                const top = (cursor.line ?? 0) * LINE_HEIGHT_PX;
                                const left = (cursor.col ?? 0) * charWidth;

                                return (
                                    <div
                                        key={id}
                                        style={{
                                            position: "absolute",
                                            top,
                                            left,
                                            width: 2,
                                            height: LINE_HEIGHT_PX,
                                            backgroundColor: "#a78bfa",
                                            borderRadius: 1,
                                            opacity: 0.9,
                                        }}
                                        title={`Cursor: ${id}`}
                                    />
                                );
                            })}
                        </div>

                        <textarea
                            readOnly={!canEdit}
                            ref={textareaRef}
                            value={code}
                            wrap="off"
                            onChange={(e) => {
                                if (!canEdit) return;

                                handleCodeChange(e);
                                requestAnimationFrame(autoResizeEditor);

                                const cursorIndex = e.target.selectionStart;
                                const { line, col } = getCursorLineCol(next, cursorIndex);

                                clearTimeout(cursorSendTimeoutRef.current);
                                cursorSendTimeoutRef.current = setTimeout(() => {
                                    wsRef.current?.send(JSON.stringify({
                                        type: "cursor",
                                        docId,
                                        data: { line, col }
                                    }));
                                }, 30);
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="Start typing your code here... (Press Tab for indentation)"
                            className={`relative w-full bg-transparent text-transparent font-mono ${editorFontClass} ${editorPaddingClass} ${editorLeftPadClass} focus:outline-none resize-none transition-colors duration-300 z-20 overflow-auto`}
                            style={{
                                height: 500,
                                caretColor: '#a78bfa',
                                lineHeight: `${LINE_HEIGHT_PX}px`
                            }}
                            spellCheck="false"
                        />

                    </div>
                </div>

                {/* <div className={`mt-4 p-4 ${footerClass} rounded-lg border transition-colors duration-300`}>
                    <div className={`text-sm ${mutedTextClass}`}>
                        <p className="mb-2">
                            <strong className={textClass}>✨ Real-time collaboration with syntax highlighting!</strong>
                        </p>
                        <ul className="space-y-1 ml-4">
                            <li>• Changes appear instantly on all connected devices</li>
                            <li>• Syntax highlighting adapts to your chosen language</li>
                            <li>
                                • Click <strong className={accentTextClass}>Share</strong> to copy the link
                            </li>
                            <li>• Anyone with the link can view and edit together</li>
                            <li>• Theme automatically matches your system preferences</li>
                        </ul>
                    </div>
                </div> */}
            </div>
            {/* ================= SHARE MODAL (INSERTED HERE) ================= */}
            {shareOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="w-full max-w-md rounded-xl bg-neutral-900 border border-neutral-700 shadow-xl">
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-neutral-800 text-sm font-semibold">
                            Share document
                        </div>

                        {/* Body */}
                        <div className="p-4 space-y-4">
                            {/* Share by email */}
                            <div className="space-y-2">
                                <div className="text-xs text-neutral-400">Share with people</div>

                                <input
                                    type="email"
                                    value={shareEmail}
                                    onChange={(e) => setShareEmail(e.target.value)}
                                    placeholder="Email address"
                                    className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />

                                <select
                                    value={sharePermission}
                                    onChange={(e) => setSharePermission(e.target.value)}
                                    className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700"
                                >
                                    <option value="edit">Can edit</option>
                                    <option value="view">View only</option>
                                </select>

                                <button
                                    onClick={shareByEmail}
                                    disabled={!shareEmail.trim() || shareBusy}
                                    className="w-full mt-2 px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {shareBusy ? "Sharing..." : "Share"}
                                </button>

                                {canManageShares && (
                                    <div className="pt-3 border-t border-neutral-800">
                                        <div className="text-xs text-neutral-400 mb-2">People with access</div>

                                        {shareListBusy ? (
                                            <div className="text-sm text-neutral-300">Loading…</div>
                                        ) : shareList.length === 0 ? (
                                            <div className="text-sm text-neutral-500">Only you have access.</div>
                                        ) : (
                                            <div className="space-y-2">
                                                {shareList.map((s) => (
                                                    <div
                                                        key={s.email}
                                                        className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2"
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm text-neutral-200 truncate">{s.email}</div>
                                                            <div className="text-xs text-neutral-500">
                                                                {s.created_at ? `Added ${new Date(s.created_at).toLocaleString()}` : ""}
                                                            </div>
                                                        </div>

                                                        <select
                                                            value={s.permission === "view" ? "view" : "edit"}
                                                            disabled={shareListSaving}
                                                            onChange={(e) => setPermissionForEmail(s.email, e.target.value)}
                                                            className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-sm"
                                                            title="Change permission"
                                                        >
                                                            <option value="edit">Can edit</option>
                                                            <option value="view">View only</option>
                                                        </select>

                                                        <button
                                                            disabled={shareListSaving}
                                                            onClick={() => revokeEmail(s.email)}
                                                            className="text-sm text-red-300 hover:text-red-200 px-2 py-1"
                                                            title="Remove access"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {shareListError && (
                                            <div className="text-sm text-red-400 mt-2">{shareListError}</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 3.4 — Share list + permission editor (owners only) */}
                            {canManageShares && (
                                <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
                                    <div className="text-xs text-neutral-400 mb-2">People with access</div>

                                    {shareListBusy ? (
                                        <div className="text-sm text-neutral-300">Loading…</div>
                                    ) : shareListError ? (
                                        <div className="text-sm text-red-400">{shareListError}</div>
                                    ) : (
                                        <div className="space-y-2">
                                            {/* Owner row */}
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium truncate">{ownerEmail || "Owner"}</div>
                                                    <div className="text-xs text-neutral-500">Owner</div>
                                                </div>
                                                <div className="text-xs text-neutral-400">Full access</div>
                                            </div>

                                            {/* Shared rows */}
                                            {shareList.length === 0 ? (
                                                <div className="text-sm text-neutral-500">Not shared with anyone yet.</div>
                                            ) : (
                                                shareList.map((row) => (
                                                    <div key={row.email} className="flex items-center justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="text-sm truncate">{row.email}</div>
                                                        </div>

                                                        <select
                                                            value={row.permission === "view" ? "view" : "edit"}
                                                            onChange={(e) => setSharePermissionFor(row.email, e.target.value)}
                                                            className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-sm"
                                                        >
                                                            <option value="edit">Can edit</option>
                                                            <option value="view">View only</option>
                                                        </select>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Divider */}
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-px bg-neutral-800" />
                                <div className="text-xs text-neutral-500">OR</div>
                                <div className="flex-1 h-px bg-neutral-800" />
                            </div>

                            {/* Share by link */}
                            <button
                                onClick={copyShareLink}
                                className="w-full px-3 py-2 rounded border border-neutral-700 hover:bg-neutral-800"
                            >
                                Copy share link
                            </button>

                            {shareError && <div className="text-sm text-red-400">{shareError}</div>}
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-3 border-t border-neutral-800 flex justify-end">
                            <button
                                onClick={() => setShareOpen(false)}
                                className="text-sm text-neutral-400 hover:text-neutral-200"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
