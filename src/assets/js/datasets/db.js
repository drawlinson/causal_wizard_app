// IndexedDB storage for datasets. Each record holds the raw uploaded file
// (as a Blob) plus a small cached schema (computed once at upload time, and
// whenever the file is replaced) so the dataset list and XDA page don't need
// to re-scan the file just to show column names/counts.
//
// Record shape:
// {
//   id: string (uuid),
//   name: string,
//   fileName: string,
//   fileType: "csv" | "xlsx",
//   fileBlob: Blob,
//   createdAt: number (epoch ms),
//   modifiedAt: number (epoch ms),
//   schema: {
//     rowCount: number,
//     columns: [{
//       name, inferredType, peekType, missingCount, uniqueCount,
//       min, max, mean, std, topCategories: [{value, count}], isConstant, isNearUnique
//     }],
//   } | null,   // null until the background full scan finishes
// }

const DB_NAME = "causal-wizard";
const DB_VERSION = 1;
const STORE = "datasets";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const DatasetStore = {
  async list() {
    return withStore("readonly", (store) => requestToPromise(store.getAll())).then((records) =>
      records.sort((a, b) => b.modifiedAt - a.modifiedAt)
    );
  },

  async get(id) {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    return requestToPromise(tx.objectStore(STORE).get(id));
  },

  async put(record) {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  },

  async delete(id) {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  newId() {
    return crypto.randomUUID();
  },
};
