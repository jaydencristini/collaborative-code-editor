// config.js - Centralized configuration
const isDevelopment = process.env.NODE_ENV !== "production";

export const config = {
  // Server will use PORT from environment (Render sets this) or 3001 locally
  port: process.env.PORT || 3001,

  // In production, Render provides the URL. In dev, use localhost
  apiUrl: process.env.RENDER_EXTERNAL_URL
    ? `https://${process.env.RENDER_EXTERNAL_URL}`
    : "http://localhost:3001",

  isDevelopment,

  // Session secret (use environment variable in production)
  sessionSecret: process.env.SESSION_SECRET || "dev_secret_change_me",

  // CORS origins
  corsOrigins: isDevelopment
    ? [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        /^http:\/\/192\.168\.\d+\.\d+:5173$/,
      ]
    : [process.env.RENDER_EXTERNAL_URL].filter(Boolean),
};
