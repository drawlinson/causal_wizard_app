import { StudyStore } from "./studies/db.js";
import { DatasetStore } from "./datasets/db.js";

function formatDate(ms) {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

let datasetsById = {};

function rowHtml(record) {
  const datasetName = datasetsById[record.datasetId]?.name || "(dataset deleted)";
  return `
    <tr data-id="${record.id}">
      <td>
        <span class="sl-name-display">
          <a href="/studies/view/?id=${record.id}">${record.name}</a>
          <button class="btn btn-sm btn-link rename-button" data-id="${record.id}" title="Rename">&#9998;</button>
        </span>
        <span class="sl-name-edit" hidden>
          <input type="text" class="form-control form-control-sm d-inline-block w-auto" value="${record.name}" />
          <button class="btn btn-sm btn-success rename-save">Save</button>
          <button class="btn btn-sm btn-secondary rename-cancel">Cancel</button>
        </span>
      </td>
      <td>${datasetName}</td>
      <td>${formatDate(record.modifiedAt)}</td>
      <td>
        <a class="btn btn-sm btn-outline-primary" href="/studies/view/?id=${record.id}">Open</a>
        <button class="btn btn-sm btn-outline-danger delete-button" data-id="${record.id}" data-name="${record.name}">Delete</button>
      </td>
    </tr>`;
}

async function renderList() {
  const records = await StudyStore.list();
  const table = document.getElementById("study-table");
  const empty = document.getElementById("study-list-empty");
  const tbody = document.getElementById("study-table-body");

  if (records.length === 0) {
    table.hidden = true;
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  table.hidden = false;
  tbody.innerHTML = records.map(rowHtml).join("");

  tbody.querySelectorAll(".delete-button").forEach((btn) => {
    btn.addEventListener("click", () => openDeleteModal(btn.dataset.id, btn.dataset.name));
  });

  tbody.querySelectorAll("tr").forEach((row) => {
    const id = row.dataset.id;
    const displayEl = row.querySelector(".sl-name-display");
    const editEl = row.querySelector(".sl-name-edit");
    const input = editEl.querySelector("input");

    row.querySelector(".rename-button").addEventListener("click", () => {
      displayEl.hidden = true;
      editEl.hidden = false;
      input.focus();
      input.select();
    });
    row.querySelector(".rename-cancel").addEventListener("click", () => {
      editEl.hidden = true;
      displayEl.hidden = false;
    });
    row.querySelector(".rename-save").addEventListener("click", async () => {
      const newName = input.value.trim();
      if (!newName) return;
      const record = await StudyStore.get(id);
      record.name = newName;
      record.modifiedAt = Date.now();
      await StudyStore.put(record);
      renderList();
    });
  });
}

let pendingDeleteId = null;

function openDeleteModal(id, name) {
  pendingDeleteId = id;
  document.getElementById("delete-modal-name").textContent = name;
  new bootstrap.Modal(document.getElementById("delete-modal")).show();
}

document.getElementById("delete-modal-confirm").addEventListener("click", async () => {
  if (!pendingDeleteId) return;
  await StudyStore.delete(pendingDeleteId);
  pendingDeleteId = null;
  bootstrap.Modal.getInstance(document.getElementById("delete-modal")).hide();
  renderList();
});

document.getElementById("create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const nameInput = document.getElementById("study-name");
  const datasetSelect = document.getElementById("study-dataset");
  const datasetId = datasetSelect.value;
  if (!datasetId) return;

  const now = Date.now();
  const record = {
    id: StudyStore.newId(),
    name: nameInput.value.trim() || "Untitled study",
    datasetId,
    graph: { nodes: [], edges: [], variableTypes: {} },
    question: {
      method: "cd+po",
      treatment: null,
      outcome: null,
      treatmentDesign: "grouped",
      treatmentSpec: null,
      // Per-study type overrides, keyed by column name - resolves the
      // dataset's sniffed/overridden type, the diagram node's type, and
      // the treatment/outcome type selectors into one consistent model.
      // See effectiveVariableType()/setVariableType() in study-view.js.
      variableTypes: {},
      effect: "ate",
      splitTestPc: 20,
      panelData: { entity: null, time: null, covariates: [] },
      modelKey: null,
    },
    createdAt: now,
    modifiedAt: now,
  };
  await StudyStore.put(record);
  window.location.href = `/studies/view/?id=${record.id}`;
});

async function init() {
  const datasets = await DatasetStore.list();
  datasetsById = Object.fromEntries(datasets.map((d) => [d.id, d]));

  if (datasets.length === 0) {
    document.getElementById("studies-no-dataset").hidden = false;
  } else {
    document.getElementById("studies-create-card").hidden = false;
    const select = document.getElementById("study-dataset");
    select.innerHTML = datasets.map((d) => `<option value="${d.id}">${d.name}</option>`).join("");
  }

  renderList();
}

init();
