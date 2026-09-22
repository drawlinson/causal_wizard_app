// Study storage. A study references a dataset (by id) plus the causal
// diagram and "question" (treatment/outcome/design/method/etc), mirroring
// the old site's Study model ({name, dataset, graph, question}) but with
// no server and a richer treatment-group spec (see treatment-widget.js).
//
// Record shape:
// {
//   id, name, datasetId,
//   graph: { nodes: [...], edges: [...], variableTypes: {} },  // Cytoscape-shaped
//   question: {
//     method: "cd+po" | "pd+fe",
//     treatment, outcome,                 // column names
//     treatmentDesign: "grouped" | "continuous",
//     treatmentSpec,                       // treatment-widget.js spec, when grouped
//     variableTypes: { [columnName]: "numerical" | "categorical" },  // per-study override
//     effect, targetUnit,
//     splitTestPc,
//     panelData: { entity, time, covariates: [] },  // pd+fe only
//     modelKey,                            // chosen estimator, once Checked
//   },
//   createdAt, modifiedAt,
// }

import { openDb, requestToPromise, STORES } from "../db.js";

const STORE = STORES.STUDIES;

export const StudyStore = {
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
