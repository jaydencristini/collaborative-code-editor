// Mock storage implementation for local development
window.storage = {
  async get(key, shared) {
    const data = localStorage.getItem(key);
    return data ? { key, value: data, shared } : null;
  },

  async set(key, value, shared) {
    localStorage.setItem(key, value);
    return { key, value, shared };
  },

  async delete(key, shared) {
    localStorage.removeItem(key);
    return { key, deleted: true, shared };
  },

  async list(prefix, shared) {
    const keys = Object.keys(localStorage).filter(
      (k) => !prefix || k.startsWith(prefix)
    );
    return { keys, prefix, shared };
  },
};
