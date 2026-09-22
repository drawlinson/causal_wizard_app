// AI/ML Project (the "project designer" wizard, distinct from a causal
// inference Study) storage. Mirrors the old site's Project model
// ({name, answers}) but with no server, no login and no magic-link
// sharing - like everything else in this app, a project just lives in
// this browser's IndexedDB. Question TEXT (prompts/tips) is NOT part of
// a Project record - it's shared, static content from
// src/_data/projectQuestions.js, not per-user data.
//
// Record shape:
// {
//   id, name,
//   answers: { [uid]: text },  // uid = "<section>_<sequence>", e.g. "1_1" - matches
//     projectQuestions.js's question.uid exactly
//   currentSection,             // 1..7 - which wizard chapter to resume on
//   createdAt, modifiedAt,
// }

import { openDb, requestToPromise, STORES } from "../db.js";

const STORE = STORES.PROJECTS;

export const ProjectStore = {
  async list() {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const records = await requestToPromise(tx.objectStore(STORE).getAll());
    return records.sort((a, b) => b.modifiedAt - a.modifiedAt);
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
