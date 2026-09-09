'use strict';

/* =====================================================
   FileStore — встроенная библиотека файлов (IndexedDB).
   Позволяет хранить файлы локально и открывать их
   без какого-либо сервера (работает даже с file://).
   ===================================================== */

const FileStore = (() => {
  const DB_NAME = 'taskflow-files';
  const DB_VERSION = 1;
  const STORE = 'files';

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB недоступен в этом браузере'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Ошибка открытия IndexedDB'));
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let result;
      let req;
      try {
        req = fn(store);
      } catch (e) {
        reject(e);
        return;
      }
      req.onsuccess = () => { result = req.result; };
      req.onerror = () => reject(req.error || new Error('Ошибка IndexedDB'));
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error || new Error('Ошибка IndexedDB'));
      t.onabort = () => reject(t.error || new Error('Транзакция IndexedDB прервана'));
    }));
  }

  return {
    /** Сохранить файл: { id, name, type, size, folderId, blob, addedAt } */
    async put(rec) { await tx('readwrite', s => s.put(rec)); },
    async get(id) { return tx('readonly', s => s.get(id)); },
    async del(id) { await tx('readwrite', s => s.delete(id)); },
    async all() { return tx('readonly', s => s.getAll()); },
    async count() { return tx('readonly', s => s.count()); },
    async clear() { await tx('readwrite', s => s.clear()); },
    async isSupported() {
      try { await open(); return true; } catch (_) { return false; }
    },
  };
})();

window.FileStore = FileStore;
