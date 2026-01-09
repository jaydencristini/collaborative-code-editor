import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import cors from "cors";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage for documents
const documents = new Map();

// Store connected clients per document
const documentClients = new Map();

// WebSocket connection handling
wss.on("connection", (ws) => {
  let currentDocId = null;

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case "join":
          currentDocId = data.docId;

          // Add client to document's client list
          if (!documentClients.has(currentDocId)) {
            documentClients.set(currentDocId, new Set());
          }
          documentClients.get(currentDocId).add(ws);

          // Send current document state
          const doc = documents.get(currentDocId);
          if (doc) {
            ws.send(
              JSON.stringify({
                type: "init",
                data: doc,
              })
            );
          }

          // Broadcast user count
          broadcastUserCount(currentDocId);
          break;

        case "update":
          if (currentDocId) {
            // Save document
            documents.set(currentDocId, {
              code: data.code,
              language: data.language,
              lastModified: new Date().toISOString(),
            });

            // Broadcast to all other clients viewing this document
            const clients = documentClients.get(currentDocId);
            if (clients) {
              clients.forEach((client) => {
                if (client !== ws && client.readyState === 1) {
                  client.send(
                    JSON.stringify({
                      type: "update",
                      data: {
                        code: data.code,
                        language: data.language,
                      },
                    })
                  );
                }
              });
            }
          }
          break;
      }
    } catch (error) {
      console.error("WebSocket error:", error);
    }
  });

  ws.on("close", () => {
    if (currentDocId && documentClients.has(currentDocId)) {
      documentClients.get(currentDocId).delete(ws);
      broadcastUserCount(currentDocId);

      // Clean up empty document client lists
      if (documentClients.get(currentDocId).size === 0) {
        documentClients.delete(currentDocId);
      }
    }
  });
});

function broadcastUserCount(docId) {
  const clients = documentClients.get(docId);
  if (clients) {
    const count = clients.size;
    clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(
          JSON.stringify({
            type: "userCount",
            count,
          })
        );
      }
    });
  }
}

// REST API endpoints (backup/fallback)
app.get("/api/document/:id", (req, res) => {
  const doc = documents.get(req.params.id);
  if (doc) {
    res.json(doc);
  } else {
    res.status(404).json({ error: "Document not found" });
  }
});

app.post("/api/document/:id", (req, res) => {
  const { code, language } = req.body;
  documents.set(req.params.id, {
    code,
    language,
    lastModified: new Date().toISOString(),
  });
  res.json({ success: true });
});

const PORT = 3001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready for connections`);
});
