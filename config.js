// config.js - Centralized configuration
const isDevelopment = process.env.NODE_ENV !== "production";

export const config = {
  isDevelopment,

  port: process.env.PORT || 3001,

  // IMPORTANT: same-origin in production
  apiUrl: isDevelopment ? "http://localhost:3001" : "",

  sessionSecret: process.env.SESSION_SECRET || "dev_secret_change_me",

  corsOrigins: isDevelopment
    ? [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        /^http:\/\/192\.168\.\d+\.\d+:5173$/,
      ]
    : [],
};
