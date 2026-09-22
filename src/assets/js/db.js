// Single shared IndexedDB connection for the whole app. Both datasets/db.js
// and studies/db.js open the same database, so the schema (object stores)
// has to be owned in one place - two independent indexedDB.open() calls
// with different version numbers/upgrade logic on the same DB name is a
// recipe for version-conflict bugs.

const DB_NAME = "causal-wizard";
const DB_VERSION = 3;
export const STORES = { DATASETS: "datasets", STUDIES: "studies", PROJECTS: "projects" };

export function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
