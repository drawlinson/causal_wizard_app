import { ProjectStore } from "./projects/db.js";

const state = {
  project: null,
  sections: null, // from /assets/data/project-questions.json
};

function showError(message) {
  document.getElementById("pb-loading").hidden = true;
  const el = document.getElementById("pb-error");
  el.textContent = message;
  el.hidden = false;
}

async function persist() {
  state.project.modifiedAt = Date.now();
  await ProjectStore.put(state.project);
}

function currentSection() {
  return state.sections.find((s) => s.number === state.project.currentSection) || state.sections[0];
}

function answeredCount(section) {
  return section.questions.filter((q) => (state.project.answers[q.uid] || "").trim() !== "").length;
}

function totalAnsweredCount() {
  return Object.values(state.project.answers).filter((v) => (v || "").trim() !== "").length;
}

function totalQuestionCount() {
  return state.sections.reduce((sum, s) => sum + s.questions.length, 0);
}

function renderChapterNav() {
  const nav = document.getElementById("pb-chapter-nav");
  const current = currentSection();
  nav.innerHTML = state.sections
    .map((s) => {
      const active = s.number === current.number;
      const count = answeredCount(s);
      return `<button type="button" class="btn btn-sm ${active ? "btn-primary" : "btn-outline-secondary"}" data-section="${s.number}">
        ${s.number}. ${s.navLabel} <span class="badge ${active ? "bg-light text-dark" : "bg-secondary"}">${count}/${s.questions.length}</span>
      </button>`;
    })
    .join("");
  nav.querySelectorAll("button[data-section]").forEach((btn) => {
    btn.addEventListener("click", () => goToSection(Number(btn.dataset.section)));
  });
}

function questionBlockHtml(section, question, index) {
  const value = state.project.answers[question.uid] || "";
  return `
    <div class="mb-4">
      <label class="form-label" for="a-${question.uid}"><b>Q${section.number}.${index + 1}. ${question.objective}</b></label>
      <div class="mb-2">${question.prompt}</div>
      ${
        question.moreInfo
          ? `<div class="card card-body bg-light mb-2"><small class="text-muted">
              <div class="fw-bold mb-1">Additional context &amp; tips</div>
              ${question.moreInfo}
            </small></div>`
          : ""
      }
      <textarea class="form-control" id="a-${question.uid}" data-uid="${question.uid}" rows="3">${escapeHtml(value)}</textarea>
    </div>`;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderSection() {
  const section = currentSection();
  document.getElementById("pb-section-title").textContent = section.title;
  document.getElementById("pb-section-subtitle").textContent = section.subtitle;
  document.getElementById("pb-section-intro").innerHTML = section.builderIntro || "";

  const container = document.getElementById("pb-questions");
  container.innerHTML = section.questions.map((q, i) => questionBlockHtml(section, q, i)).join("");
  container.querySelectorAll("textarea[data-uid]").forEach((textarea) => {
    let timer = null;
    textarea.addEventListener("input", () => {
      state.project.answers[textarea.dataset.uid] = textarea.value;
      clearTimeout(timer);
      timer = setTimeout(() => {
        persist();
        renderChapterNav(); // keep the answered-count badges live
        renderProgress();
      }, 400);
    });
  });

  document.getElementById("pb-prev").disabled = section.number === 1;
  const nextBtn = document.getElementById("pb-next");
  nextBtn.textContent = section.number === state.sections.length ? "Finish →" : "Next →";

  renderProgress();
}

function renderProgress() {
  const section = currentSection();
  document.getElementById("pb-progress").textContent =
    `Section ${section.number} of ${state.sections.length} · ${totalAnsweredCount()}/${totalQuestionCount()} questions answered overall`;
}

async function goToSection(number) {
  state.project.currentSection = number;
  await persist();
  renderChapterNav();
  renderSection();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.getElementById("pb-prev").addEventListener("click", () => {
  const section = currentSection();
  if (section.number > 1) goToSection(section.number - 1);
});

document.getElementById("pb-next").addEventListener("click", () => {
  const section = currentSection();
  if (section.number < state.sections.length) {
    goToSection(section.number + 1);
  } else {
    window.location.href = `/project/view/?id=${state.project.id}`;
  }
});

async function main() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) return showError("No project specified.");

  const [project, questionData] = await Promise.all([
    ProjectStore.get(id),
    fetch("/assets/data/project-questions.json").then((r) => r.json()),
  ]);
  if (!project) return showError("Project not found - it may have been deleted.");

  state.project = project;
  if (!state.project.answers) state.project.answers = {};
  if (!state.project.currentSection) state.project.currentSection = 1;
  state.sections = questionData.sections;

  document.getElementById("pb-name").textContent = project.name;
  document.getElementById("pb-view-link").href = `/project/view/?id=${project.id}`;

  document.getElementById("pb-loading").hidden = true;
  document.getElementById("pb-content").hidden = false;

  renderChapterNav();
  renderSection();
}

main();
