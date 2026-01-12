// config.js - Centralized configuration

const isDevelopment = process.env.NODE_ENV !== "production";

export const config = {
  isDevelopment,

  // Backend port (used ONLY by the server, not the browser)
  port: process.env.PORT || 3001,

  /*
    API base URL

    - In the browser (Vite / frontend):
      use SAME-ORIGIN requests => "/api/..."
      (prevents mixed content, fixes sessions, fixes share)

    - In local dev server code (Node):
      localhost is fine
  */
  apiUrl: isDevelopment ? "http://localhost:3001" : "",

  // Session secret (backend only)
  sessionSecret: process.env.SESSION_SECRET || "dev_secret_change_me",

  // CORS origins (backend only)
  corsOrigins: isDevelopment
    ? [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        /^http:\/\/192\.168\.\d+\.\d+:5173$/,
      ]
    : [], // same-origin in production (no CORS needed)
};
