import { ProjectStore } from "./projects/db.js";

let totalQuestions = 0;

function formatDate(ms) {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function answeredCount(record) {
  return Object.values(record.answers || {}).filter((v) => v && v.trim() !== "").length;
}

function rowHtml(record) {
  return `
    <tr data-id="${record.id}">
      <td>
        <span class="sl-name-display">
          <a href="/project/builder/?id=${record.id}">${record.name}</a>
          <button class="btn btn-sm btn-link rename-button" data-id="${record.id}" title="Rename">&#9998;</button>
        </span>
        <span class="sl-name-edit" hidden>
          <input type="text" class="form-control form-control-sm d-inline-block w-auto" value="${record.name}" />
          <button class="btn btn-sm btn-success rename-save">Save</button>
          <button class="btn btn-sm btn-secondary rename-cancel">Cancel</button>
        </span>
      </td>
      <td>${answeredCount(record)} / ${totalQuestions} answered</td>
      <td>${formatDate(record.modifiedAt)}</td>
      <td>
        <a class="btn btn-sm btn-outline-primary" href="/project/builder/?id=${record.id}">Continue</a>
        <a class="btn btn-sm btn-outline-secondary" href="/project/view/?id=${record.id}">View</a>
        <button class="btn btn-sm btn-outline-danger delete-button" data-id="${record.id}" data-name="${record.name}">Delete</button>
      </td>
    </tr>`;
}

async function renderList() {
  const records = await ProjectStore.list();
  const table = document.getElementById("project-table");
  const empty = document.getElementById("project-list-empty");
  const tbody = document.getElementById("project-table-body");

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
      const record = await ProjectStore.get(id);
      record.name = newName;
      record.modifiedAt = Date.now();
      await ProjectStore.put(record);
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
  await ProjectStore.delete(pendingDeleteId);
  pendingDeleteId = null;
  bootstrap.Modal.getInstance(document.getElementById("delete-modal")).hide();
  renderList();
});

document.getElementById("create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const nameInput = document.getElementById("project-name");
  const now = Date.now();
  const record = {
    id: ProjectStore.newId(),
    name: nameInput.value.trim() || "Untitled project",
    answers: {},
    currentSection: 1,
    createdAt: now,
    modifiedAt: now,
  };
  await ProjectStore.put(record);
  window.location.href = `/project/builder/?id=${record.id}`;
});

async function init() {
  const questions = await fetch("/assets/data/project-questions.json").then((r) => r.json());
  totalQuestions = questions.sections.reduce((sum, s) => sum + s.questions.length, 0);
  renderList();
}

init();
