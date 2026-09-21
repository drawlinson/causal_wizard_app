import { DatasetStore } from "./datasets/db.js";
import { fileTypeFor, peekFile } from "./datasets/parse.js";
import { sniffType } from "./datasets/types.js";

function formatDate(ms) {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function rowHtml(record) {
  const rows = record.schema && record.schema.rowCount !== null ? record.schema.rowCount.toLocaleString() : "&hellip;";
  const cols = record.schema ? record.schema.columns.length : "&hellip;";
  return `
    <tr data-id="${record.id}">
      <td>
        <span class="dv-name-display">
          <a href="/data/view/?id=${record.id}">${record.name}</a>
          <button class="btn btn-sm btn-link rename-button" data-id="${record.id}" title="Rename">&#9998;</button>
        </span>
        <span class="dv-name-edit" hidden>
          <input type="text" class="form-control form-control-sm d-inline-block w-auto" value="${record.name}" />
          <button class="btn btn-sm btn-success rename-save">Save</button>
          <button class="btn btn-sm btn-secondary rename-cancel">Cancel</button>
        </span>
      </td>
      <td>${rows}</td>
      <td>${cols}</td>
      <td>${formatDate(record.modifiedAt)}</td>
      <td>
        <a class="btn btn-sm btn-outline-primary" href="/data/view/?id=${record.id}">View</a>
        <button class="btn btn-sm btn-outline-danger delete-button" data-id="${record.id}" data-name="${record.name}">Delete</button>
      </td>
    </tr>`;
}

async function renderList() {
  const records = await DatasetStore.list();
  const table = document.getElementById("dataset-table");
  const empty = document.getElementById("dataset-list-empty");
  const tbody = document.getElementById("dataset-table-body");

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
    const displayEl = row.querySelector(".dv-name-display");
    const editEl = row.querySelector(".dv-name-edit");
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
      const record = await DatasetStore.get(id);
      record.name = newName;
      record.modifiedAt = Date.now();
      await DatasetStore.put(record);
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
  await DatasetStore.delete(pendingDeleteId);
  pendingDeleteId = null;
  bootstrap.Modal.getInstance(document.getElementById("delete-modal")).hide();
  renderList();
});

document.getElementById("upload-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const fileInput = document.getElementById("dataset-file");
  const nameInput = document.getElementById("dataset-name");
  const status = document.getElementById("upload-status");
  const file = fileInput.files[0];

  if (!file) {
    status.textContent = "Choose a file first.";
    return;
  }
  const fileType = fileTypeFor(file);
  if (!fileType) {
    status.textContent = "Unsupported file type - please choose a CSV or Excel file.";
    return;
  }

  document.getElementById("upload-button").disabled = true;
  status.textContent = "Checking file&hellip;";

  try {
    // Fast peek, just to catch obviously-bad files (unparseable, empty)
    // before we commit to storing them.
    const peek = await peekFile(file);
    if (peek.columnNames.length === 0) {
      status.textContent = "Couldn't find any columns in that file. Is it a valid CSV/Excel file?";
      document.getElementById("upload-button").disabled = false;
      return;
    }

    const now = Date.now();
    const record = {
      id: DatasetStore.newId(),
      name: nameInput.value.trim() || file.name.replace(/\.[^.]+$/, ""),
      fileName: file.name,
      fileType,
      fileBlob: file,
      createdAt: now,
      modifiedAt: now,
      // Peek-derived schema so the view page has something to show
      // immediately; it kicks off the full background scan itself and
      // refines this.
      schema: {
        rowCount: null,
        columns: peek.columnNames.map((name) => {
          const sniff = sniffType(peek.columns[name]);
          return { name, inferredType: sniff.type, peekOnly: true };
        }),
      },
    };
    await DatasetStore.put(record);
    window.location.href = `/data/view/?id=${record.id}`;
  } catch (err) {
    console.error(err);
    status.textContent = `Couldn't read that file: ${err.message}`;
    document.getElementById("upload-button").disabled = false;
  }
});

renderList();
