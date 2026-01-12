import express from "express";
import http from "http";
import cors from "cors";
import session from "express-session";
import bcrypt from "bcryptjs";
import { WebSocketServer } from "ws";
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";

// ---------- Paths ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "data", "app.sqlite");

// ---------- SQLite helpers ----------
sqlite3.verbose();
const db = new sqlite3.Database(DB_PATH);

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

async function initDb() {
  // Users
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Documents
  await run(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      owner_user_id INTEGER,
      title TEXT NOT NULL DEFAULT 'Untitled document',
      code TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT 'javascript',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(owner_user_id) REFERENCES users(id)
    )
  `);

  // Document shares: which users can access which documents
  await run(`
    CREATE TABLE IF NOT EXISTS document_shares (
      doc_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      permission TEXT NOT NULL DEFAULT 'edit', -- 'edit' | 'view'
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (doc_id, user_id),
      FOREIGN KEY(doc_id) REFERENCES documents(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // Share links: token -> doc access (a user can "accept" a token to add it to their account)
  await run(`
    CREATE TABLE IF NOT EXISTS document_share_links (
      token TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'edit', -- 'edit' | 'view'
      created_by_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      FOREIGN KEY(doc_id) REFERENCES documents(id),
      FOREIGN KEY(created_by_user_id) REFERENCES users(id)
    )
  `);

  await run(
    `CREATE INDEX IF NOT EXISTS idx_document_shares_user ON document_shares(user_id)`
  );
  await run(
    `CREATE INDEX IF NOT EXISTS idx_document_shares_doc ON document_shares(doc_id)`
  );

  // Helpful index for recents
  await run(
    `CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at)`
  );
}

// ---------- Validation ----------
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function passwordPolicyErrors(password) {
  const p = String(password);
  const errors = [];
  if (p.length < 10) errors.push("At least 10 characters");
  if (!/[A-Z]/.test(p)) errors.push("At least 1 uppercase letter");
  if (!/[a-z]/.test(p)) errors.push("At least 1 lowercase letter");
  if ((p.match(/\d/g) || []).length < 2) errors.push("At least 2 numbers");
  if (!/[^A-Za-z0-9]/.test(p)) errors.push("At least 1 symbol");
  return errors;
}

// ---------- Express ----------
const app = express();
app.use(express.json());

// CORS (allow localhost + LAN for phones/tablets)
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origin === "http://localhost:5173") return cb(null, true);
      if (origin === "http://127.0.0.1:5173") return cb(null, true);
      if (/^http:\/\/192\.168\.\d+\.\d+:5173$/.test(origin))
        return cb(null, true);
      return cb(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
  })
);

// ---------- Sessions persisted in SQLite ----------
import connectSqlite3 from "connect-sqlite3";
const SQLiteStore = connectSqlite3(session);

const sessionParser = session({
  name: "sid",
  secret: "dev_secret_change_me",
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({
    db: "sessions.sqlite",
    dir: path.join(__dirname, "data"),
  }),
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
});

app.use(sessionParser);

function requireAuth(req, res, next) {
  if (!req.session?.userId)
    return res.status(401).json({ error: "unauthorized" });
  next();
}

// ---------- Auth API ----------
app.post("/api/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "missing email/password" });

    const norm = String(email).trim().toLowerCase();
    if (!isValidEmail(norm))
      return res.status(400).json({ error: "invalid email" });

    const pwErrors = passwordPolicyErrors(password);
    if (pwErrors.length)
      return res
        .status(400)
        .json({ error: "weak password", details: pwErrors });

    const existing = await get("SELECT id FROM users WHERE email = ?", [norm]);
    if (existing)
      return res.status(409).json({ error: "email already exists" });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const ins = await run(
      "INSERT INTO users (email, password_hash) VALUES (?, ?)",
      [norm, passwordHash]
    );

    req.session.userId = ins.lastID;
    req.session.email = norm;

    res.json({ ok: true, user: { id: String(ins.lastID), email: norm } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "missing email/password" });

    const norm = String(email).trim().toLowerCase();
    const user = await get(
      "SELECT id, email, password_hash FROM users WHERE email = ?",
      [norm]
    );
    if (!user) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    req.session.userId = user.id;
    req.session.email = user.email;

    res.json({ ok: true, user: { id: String(user.id), email: user.email } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ ok: true });
  });
});

app.get("/api/me", (req, res) => {
  if (!req.session?.userId)
    return res.status(401).json({ error: "unauthorized" });
  res.json({
    ok: true,
    user: { id: String(req.session.userId), email: req.session.email },
  });
});

// ---------- Docs API (persistent list for home screen) ----------
app.get("/api/docs", requireAuth, async (req, res) => {
  const userId = req.session.userId;

  const owned = await all(
    `SELECT id, title, updated_at AS lastEdited
     FROM documents
     WHERE owner_user_id = ?
     ORDER BY updated_at DESC`,
    [userId]
  );

  const shared = await all(
    `SELECT d.id, d.title, d.updated_at AS lastEdited,
            u.email AS ownerEmail,
            s.permission AS permission
     FROM document_shares s
     JOIN documents d ON d.id = s.doc_id
     JOIN users u ON u.id = d.owner_user_id
     WHERE s.user_id = ?
     ORDER BY d.updated_at DESC`,
    [userId]
  );

  res.json({ ok: true, owned, shared });
});

app.post("/api/docs", requireAuth, async (req, res) => {
  const { id, title } = req.body || {};
  if (!id) return res.status(400).json({ error: "missing id" });

  const safeTitle = (title && String(title).trim()) || "Untitled document";

  await run(
    `INSERT OR IGNORE INTO documents (id, owner_user_id, title, code, language, updated_at)
     VALUES (?, ?, ?, '', 'javascript', datetime('now'))`,
    [id, req.session.userId, safeTitle]
  );

  res.json({ ok: true, doc: { id, title: safeTitle } });
});

app.patch("/api/docs/:id", requireAuth, async (req, res) => {
  const { title } = req.body || {};
  const docId = req.params.id;

  const safeTitle = (title && String(title).trim()) || "Untitled document";

  await run(
    `UPDATE documents
     SET title = ?, updated_at = datetime('now')
     WHERE id = ? AND owner_user_id = ?`,
    [safeTitle, docId, req.session.userId]
  );

  res.json({ ok: true });
});

app.delete("/api/docs/:id", requireAuth, async (req, res) => {
  const docId = req.params.id;
  await run(`DELETE FROM documents WHERE id = ? AND owner_user_id = ?`, [
    docId,
    req.session.userId,
  ]);
  res.json({ ok: true });
});

app.post("/api/share/create-link", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { docId, permission } = req.body || {};
    const perm = permission === "view" ? "view" : "edit";

    if (!docId) return res.status(400).json({ error: "missing docId" });

    // ✅ Allow: owner OR users with 'edit' share permission
    const access = await userCanAccessDoc(userId, docId);
    if (!access.ok) return res.status(403).json({ error: "forbidden" });

    // ✅ Block: view-only users cannot create share links
    if (access.permission === "view") {
      return res.status(403).json({ error: "view-only cannot share" });
    }

    const token = makeToken();
    await run(
      `INSERT INTO document_share_links (token, doc_id, permission, created_by_user_id)
       VALUES (?, ?, ?, ?)`,
      [token, docId, perm, userId]
    );

    res.json({ ok: true, token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

app.post("/api/share/accept", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "missing token" });

  const link = await get(
    `SELECT doc_id, permission, expires_at
     FROM document_share_links
     WHERE token = ?`,
    [token]
  );
  if (!link) return res.status(404).json({ error: "invalid link" });

  if (link.expires_at) {
    const expired = await get(
      `SELECT datetime('now') > datetime(?) AS expired`,
      [link.expires_at]
    );
    if (expired?.expired)
      return res.status(410).json({ error: "link expired" });
  }

  const doc = await get(
    `SELECT id, owner_user_id FROM documents WHERE id = ?`,
    [link.doc_id]
  );
  if (!doc) return res.status(404).json({ error: "doc not found" });

  // Owners don't need a share entry
  if (doc.owner_user_id !== userId) {
    await run(
      `INSERT OR IGNORE INTO document_shares (doc_id, user_id, permission)
       VALUES (?, ?, ?)`,
      [link.doc_id, userId, link.permission === "view" ? "view" : "edit"]
    );
  }

  res.json({ ok: true, docId: link.doc_id });
});

app.post("/api/share/grant", requireAuth, async (req, res) => {
  const ownerId = req.session.userId;
  const { docId, email, permission } = req.body || {};
  const perm = permission === "view" ? "view" : "edit";

  if (!docId || !email)
    return res.status(400).json({ error: "missing docId/email" });

  const doc = await get(
    `SELECT id, owner_user_id FROM documents WHERE id = ?`,
    [docId]
  );
  if (!doc) return res.status(404).json({ error: "not found" });
  if (doc.owner_user_id !== ownerId)
    return res.status(403).json({ error: "forbidden" });

  const target = await get(`SELECT id FROM users WHERE email = ?`, [
    String(email).trim().toLowerCase(),
  ]);
  if (!target) return res.status(404).json({ error: "no such user" });

  if (target.id === ownerId) return res.json({ ok: true });

  await run(
    `INSERT OR REPLACE INTO document_shares (doc_id, user_id, permission)
     VALUES (?, ?, ?)`,
    [docId, target.id, perm]
  );

  res.json({ ok: true });
});

// List who a doc is shared with (owner only)
app.get("/api/share/list", requireAuth, async (req, res) => {
  try {
    const ownerId = req.session.userId;
    const docId = String(req.query.docId || "").trim();
    if (!docId) return res.status(400).json({ error: "missing docId" });

    const doc = await get(
      `SELECT id, owner_user_id FROM documents WHERE id = ?`,
      [docId]
    );
    if (!doc) return res.status(404).json({ error: "not found" });
    if (doc.owner_user_id !== ownerId)
      return res.status(403).json({ error: "forbidden" });

    const rows = await all(
      `
      SELECT u.email AS email, ds.permission AS permission
      FROM document_shares ds
      JOIN users u ON u.id = ds.user_id
      WHERE ds.doc_id = ?
      ORDER BY u.email ASC
      `,
      [docId]
    );

    // Owner is implicit (not in document_shares)
    const owner = await get(`SELECT email FROM users WHERE id = ?`, [ownerId]);

    res.json({
      ok: true,
      ownerEmail: owner?.email || null,
      shares: rows || [],
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

// Update a user's permission (OWNER ONLY)
// Update another user's permission (owner only)
app.post("/api/share/set-permission", requireAuth, async (req, res) => {
  try {
    const ownerId = req.session.userId;
    const { docId, email, permission } = req.body || {};
    const perm = permission === "view" ? "view" : "edit";

    if (!docId || !email)
      return res.status(400).json({ error: "missing docId/email" });

    const doc = await get(
      `SELECT id, owner_user_id FROM documents WHERE id = ?`,
      [docId]
    );
    if (!doc) return res.status(404).json({ error: "not found" });
    if (doc.owner_user_id !== ownerId)
      return res.status(403).json({ error: "forbidden" });

    const normEmail = String(email).trim().toLowerCase();
    const target = await get(`SELECT id FROM users WHERE email = ?`, [
      normEmail,
    ]);
    if (!target) return res.status(404).json({ error: "no such user" });

    // You can't change the owner's permission (owner is implicit)
    if (target.id === ownerId) return res.json({ ok: true });

    await run(
      `INSERT OR REPLACE INTO document_shares (doc_id, user_id, permission)
       VALUES (?, ?, ?)`,
      [String(docId), target.id, perm]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

// Revoke a user's access (OWNER ONLY)
app.post("/api/share/revoke", requireAuth, async (req, res) => {
  try {
    const ownerId = req.session.userId;
    const { docId, email } = req.body || {};
    if (!docId || !email)
      return res.status(400).json({ error: "missing docId/email" });

    const doc = await get(
      `SELECT id, owner_user_id FROM documents WHERE id = ?`,
      [docId]
    );
    if (!doc) return res.status(404).json({ error: "not found" });
    if (doc.owner_user_id !== ownerId)
      return res.status(403).json({ error: "forbidden" });

    const normEmail = String(email).trim().toLowerCase();
    const target = await get(`SELECT id FROM users WHERE email = ?`, [
      normEmail,
    ]);
    if (!target) return res.status(404).json({ error: "no such user" });

    if (target.id === ownerId) return res.json({ ok: true });

    await run(`DELETE FROM document_shares WHERE doc_id = ? AND user_id = ?`, [
      docId,
      target.id,
    ]);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

// ---------- HTTP + WS ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  sessionParser(req, {}, () => {
    if (!req.session?.userId) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req)
    );
  });
});

async function loadDocFromDb(docId) {
  let row = await get(
    "SELECT id, code, language, title, owner_user_id FROM documents WHERE id = ?",
    [docId]
  );
  return row;
}

async function ensureDocExists(docId, ownerUserId) {
  await run(
    `INSERT OR IGNORE INTO documents (id, owner_user_id, title, code, language, updated_at)
     VALUES (?, ?, 'Untitled document', '', 'javascript', datetime('now'))`,
    [docId, ownerUserId]
  );
}

function makeToken(bytes = 18) {
  // URL-safe-ish token
  return (
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2) +
    "_" +
    Math.random()
      .toString(36)
      .slice(2, 2 + bytes)
  );
}

async function getSharePermission(userId, docId) {
  const row = await get(
    `SELECT permission FROM document_shares WHERE doc_id = ? AND user_id = ?`,
    [docId, userId]
  );
  return row?.permission || null;
}

async function userCanAccessDoc(userId, docId) {
  const doc = await loadDocFromDb(docId);
  if (!doc)
    return { ok: false, reason: "not_found", doc: null, permission: null };

  if (doc.owner_user_id === userId) {
    return { ok: true, doc, permission: "owner" };
  }

  const perm = await getSharePermission(userId, docId);
  if (!perm) return { ok: false, reason: "forbidden", doc, permission: null };

  return { ok: true, doc, permission: perm }; // 'edit' | 'view'
}

const docClients = new Map(); // docId -> Set(ws)

// Replace your broadcast() with this:
function broadcast(docId, obj, excludeWs = null) {
  const set = docClients.get(docId);
  if (!set) return;
  const msg = JSON.stringify(obj);
  for (const c of set) {
    if (excludeWs && c === excludeWs) continue;
    if (c.readyState === c.OPEN) c.send(msg);
  }
}

function userCount(docId) {
  return docClients.get(docId)?.size || 0;
}

wss.on("connection", (ws, req) => {
  ws._docId = null;
  ws._canEdit = false;

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "join") {
      const { docId } = msg;
      if (!docId) return;

      // remove from old doc set
      if (ws._docId) {
        const oldSet = docClients.get(ws._docId);
        if (oldSet) oldSet.delete(ws);
        broadcast(ws._docId, {
          type: "userCount",
          count: userCount(ws._docId),
        });
      }

      ws._docId = docId;

      // If doc doesn't exist, only allow creating it for the current user (owner)
      let row = await loadDocFromDb(docId);
      if (!row) {
        await ensureDocExists(docId, req.session.userId);
        row = await loadDocFromDb(docId);
      }

      // Access control: owner OR shared permission
      const access = await userCanAccessDoc(req.session.userId, docId);
      if (!access.ok) {
        try {
          ws.send(JSON.stringify({ type: "error", error: "forbidden" }));
        } catch {}
        try {
          ws.close();
        } catch {}
        return;
      }

      ws._canEdit =
        access.permission === "owner" || access.permission === "edit";

      // add to new doc set
      if (!docClients.has(docId)) docClients.set(docId, new Set());
      docClients.get(docId).add(ws);

      // load latest doc state from DB
      ws.send(
        JSON.stringify({
          type: "init",
          data: {
            code: row?.code || "",
            language: row?.language || "javascript",
          },
        })
      );

      broadcast(docId, { type: "userCount", count: userCount(docId) });
    }

    // must join first
    if (!ws._docId) return;

    if (msg.type === "update") {
      if (!ws._canEdit) return;

      const code = typeof msg.code === "string" ? msg.code : "";
      const language = msg.language || "javascript";

      // persist content
      await run(
        `UPDATE documents
         SET code = ?, language = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [code, language, ws._docId]
      );

      // broadcast to everyone EXCEPT the sender
      broadcast(ws._docId, { type: "update", data: { code, language } }, ws);
    }

    if (msg.type === "cursor") {
      broadcast(
        ws._docId,
        {
          type: "cursor",
          clientId: ws._clientId,
          data: msg.data,
        },
        ws // 👈 exclude sender
      );
    }
  });

  ws.on("close", () => {
    if (!ws._docId) return;
    const set = docClients.get(ws._docId);
    if (set) set.delete(ws);
    broadcast(ws._docId, { type: "userCount", count: userCount(ws._docId) });
  });
});

// ---------- Serve Vite build (production) ----------
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "dist");

  // Serve static assets (JS/CSS/etc)
  app.use(express.static(distPath));

  // SPA fallback: serve index.html for all non-API routes
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// ---------- Start ----------
await initDb();

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (persistent SQLite)`);
});
