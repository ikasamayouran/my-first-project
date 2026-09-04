// localStorageを使った汎用の永続化ヘルパー。
// このアプリは自分専用・単一ブラウザ利用の想定のため、サーバーは持たない。
const Storage = {
  load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error(`Failed to load "${key}" from localStorage`, e);
      return fallback;
    }
  },
  save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`Failed to save "${key}" to localStorage`, e);
    }
  },
};
