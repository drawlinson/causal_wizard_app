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
//     treatmentSpec,                       // treatment-widget.js spec (Control/Treated groups)
//     variableTypes: { [columnName]: "numerical" | "categorical" },  // per-study override; also
//       drives treatmentSpec's editor kind (numeric range vs per-value table)
//     effect: "ate" | "att" | "atc",       // desired target units; pd+fe always uses att regardless
//     splitTestPc,                          // % of rows randomly held out as a test set
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
