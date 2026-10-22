// Kleine IndexedDB-wrapper. Alles blijft lokaal op het apparaat.
const DB_NAME = 'toetsentuin';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('results')) {
        const s = db.createObjectStore('results', { keyPath: 'id', autoIncrement: true });
        s.createIndex('profileId', 'profileId');
      }
      if (!db.objectStoreNames.contains('practice')) {
        const s = db.createObjectStore('practice', { keyPath: ['profileId', 'day'] });
        s.createIndex('profileId', 'profileId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await open();
  const t = db.transaction(store, mode);
  const result = await fn(t.objectStore(store));
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  return result;
}

export const db = {
  get: (store, key) => tx(store, 'readonly', (s) => wrap(s.get(key))),
  put: (store, value) => tx(store, 'readwrite', (s) => wrap(s.put(value))),
  delete: (store, key) => tx(store, 'readwrite', (s) => wrap(s.delete(key))),
  all: (store) => tx(store, 'readonly', (s) => wrap(s.getAll())),
  byIndex: (store, index, value) => tx(store, 'readonly', (s) => wrap(s.index(index).getAll(value))),
  async deleteByIndex(store, index, value) {
    return tx(store, 'readwrite', async (s) => {
      const keys = await wrap(s.index(index).getAllKeys(value));
      await Promise.all(keys.map((k) => wrap(s.delete(k))));
    });
  },
};

// localStorage alleen voor gemak (laatst gekozen profiel); mag ontbreken.
export const prefs = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem('tt:' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('tt:' + key, JSON.stringify(value));
    } catch {
      /* privémodus e.d. */
    }
  },
};
