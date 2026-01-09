import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, Users, Share2, Code2, Wifi, WifiOff, Moon, Sun } from 'lucide-react';

export default function CollaborativeCodeEditor() {
    const [code, setCode] = useState('');
    const [language, setLanguage] = useState('javascript');
    const [docId, setDocId] = useState('');
    const [isOwner, setIsOwner] = useState(false);
    const [copied, setCopied] = useState(false);
    const [activeUsers, setActiveUsers] = useState(1);
    const [connected, setConnected] = useState(false);
    const [darkMode, setDarkMode] = useState(true);
    const textareaRef = useRef(null);
    const highlightRef = useRef(null);
    const wsRef = useRef(null);
    const updateTimeoutRef = useRef(null);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        setDarkMode(mediaQuery.matches);
        const handler = (e) => setDarkMode(e.matches);
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const urlDocId = urlParams.get('doc');
        if (urlDocId) {
            setDocId(urlDocId);
        } else {
            const newDocId = generateDocId();
            setDocId(newDocId);
            setIsOwner(true);
            const url = `${window.location.origin}${window.location.pathname}?doc=${newDocId}`;
            window.history.pushState({}, '', url);
        }
    }, []);

    useEffect(() => {
        if (!docId) return;
        const ws = new WebSocket('ws://localhost:3001');
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('Connected to server');
            setConnected(true);
            ws.send(JSON.stringify({ type: 'join', docId }));
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            switch (message.type) {
                case 'init':
                    if (message.data) {
                        setCode(message.data.code || '');
                        setLanguage(message.data.language || 'javascript');
                    }
                    break;
                case 'update':
                    setCode(message.data.code);
                    setLanguage(message.data.language);
                    break;
                case 'userCount':
                    setActiveUsers(message.count);
                    break;
            }
        };

        ws.onclose = () => {
            console.log('Disconnected from server');
            setConnected(false);
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            setConnected(false);
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN) ws.close();
        };
    }, [docId]);

    useEffect(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (!docId) return;

        if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);

        updateTimeoutRef.current = setTimeout(() => {
            wsRef.current.send(JSON.stringify({ type: 'update', docId, code, language }));
        }, 300);
    }, [code, language, docId]);

    useEffect(() => {
        autoResizeEditor();
    }, [code, language]);


    const generateDocId = () => 'doc_' + Math.random().toString(36).substr(2, 9);

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


    const handleCodeChange = (e) => setCode(e.target.value);
    const handleLanguageChange = (e) => setLanguage(e.target.value);

    const copyShareLink = () => {
        const url = `${window.location.origin}${window.location.pathname}?doc=${docId}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
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
    const accentTextClass = darkMode ? 'text-emerald-400' : 'text-blue-600';
    const selectClass = darkMode ? 'bg-neutral-700 border-neutral-600 text-white' : 'bg-white border-gray-300 text-gray-900';
    const footerClass = darkMode ? 'bg-neutral-800/30 border-neutral-700' : 'bg-white/50 border-gray-200';

    return (
        <div className={`min-h-screen ${bgClass} p-4 transition-colors duration-300`}>
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
                <div className={`${headerClass} rounded-t-xl border p-4 transition-colors duration-300`}>
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2 rounded-lg shadow-lg">
                                <Code2 size={24} className="text-white" />
                            </div>
                            <div>
                                <h1 className={`text-xl font-bold ${textClass}`}>Collaborative Code Editor</h1>
                                <p className={`text-sm ${mutedTextClass}`}>Real-time code sharing</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${darkMode
                                    ? connected
                                        ? 'bg-green-500/20 text-green-400'
                                        : 'bg-red-500/20 text-red-400'
                                    : connected
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-red-100 text-red-700'
                                    }`}
                            >
                                {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
                                <span className="text-sm">{connected ? 'Connected' : 'Disconnected'}</span>
                            </div>

                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${darkMode ? 'bg-neutral-700/50' : 'bg-white shadow-sm border border-gray-200'}`}>
                                <Users size={16} className={darkMode ? 'text-emerald-400' : 'text-green-600'} />
                                <span className={`text-sm ${textClass}`}>{activeUsers} online</span>
                            </div>

                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${darkMode ? 'bg-neutral-700/50' : 'bg-white shadow-sm border border-gray-200'}`}>
                                {darkMode ? <Moon size={16} className="text-violet-400" /> : <Sun size={16} className="text-amber-500" />}
                                <span className={`text-sm ${textClass}`}>{darkMode ? 'Dark' : 'Light'}</span>
                            </div>

                            <button
                                onClick={copyShareLink}
                                className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-4 py-2 rounded-lg transition-all shadow-md hover:shadow-lg"
                            >
                                {copied ? <Check size={16} /> : <Share2 size={16} />}
                                {copied ? 'Copied!' : 'Share'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className={`${controlsClass} border-x border p-3 transition-colors duration-300`}>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm">
                            <span className={mutedTextClass}>Language:</span>
                        </label>

                        <select
                            value={language}
                            onChange={handleLanguageChange}
                            className={`${selectClass} border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors duration-300`}
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

                        <div className={`ml-auto text-xs ${mutedTextClass}`}>
                            Document ID: <span className={`font-mono ${accentTextClass}`}>{docId}</span>
                        </div>
                    </div>
                </div>

                <div className={`${editorBgClass} border rounded-b-xl overflow-hidden transition-colors duration-300`}>
                    <div className="relative">
                        <div className={`absolute left-0 top-0 bottom-0 w-12 ${lineNumberClass} border-r p-4 text-right text-sm font-mono select-none overflow-hidden transition-colors duration-300 z-10`}>
                            {code.split('\n').map((_, i) => (
                                <div key={i} className="leading-6">
                                    {i + 1}
                                </div>
                            ))}
                        </div>

                        <div
                            ref={highlightRef}
                            className="absolute left-12 top-0 w-[calc(100%-3rem)] p-4 font-mono text-sm leading-6 pointer-events-none whitespace-pre-wrap break-words"
                            style={{ height: 500 }}
                            dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }}
                        />

                        <textarea
                            ref={textareaRef}
                            value={code}
                            onChange={(e) => {
                                setCode(e.target.value);
                                requestAnimationFrame(autoResizeEditor);
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="Start typing your code here... (Press Tab for indentation)"
                            className="relative w-full bg-transparent text-transparent font-mono text-sm p-4 pl-16 focus:outline-none resize-none leading-6 transition-colors duration-300 z-20 overflow-hidden"
                            style={{ height: 500, caretColor: darkMode ? 'white' : 'black' }}
                            spellCheck="false"
                        />

                    </div>
                </div>

                <div className={`mt-4 p-4 ${footerClass} rounded-lg border transition-colors duration-300`}>
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
                </div>
            </div>
        </div>
    );
}
