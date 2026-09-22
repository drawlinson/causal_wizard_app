import { ProjectStore } from "./projects/db.js";

function showError(message) {
  document.getElementById("pv-loading").hidden = true;
  const el = document.getElementById("pv-error");
  el.textContent = message;
  el.hidden = false;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function sectionHtml(section, answers) {
  const questionsHtml = section.questions
    .map((q, i) => {
      const answer = (answers[q.uid] || "").trim();
      const answerHtml = answer
        ? escapeHtml(answer).replace(/\n/g, "<br>")
        : '<span class="text-muted fst-italic">Not answered</span>';
      return `
        <div class="mb-3">
          <h6 class="mb-1">Q${section.number}.${i + 1}. ${q.objective}</h6>
          <p class="cw-question-answer-prompt small mb-1">${q.prompt}</p>
          <p>${answerHtml}</p>
        </div>`;
    })
    .join("");
  return `<h3 class="cw-builder-section mt-4">${section.number}. ${section.title}</h3>${questionsHtml}`;
}

document.getElementById("pv-download").addEventListener("click", (e) => {
  const btn = e.currentTarget;
  const name = document.getElementById("pv-name").textContent || "project";
  const filename = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project"}.pdf`;
  btn.disabled = true;
  btn.textContent = "Generating…";
  html2pdf()
    .from(document.getElementById("pv-pdf-content"))
    .save(filename)
    .then(() => {
      btn.disabled = false;
      btn.textContent = "Download PDF";
    });
});

async function main() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) return showError("No project specified.");

  const [project, questionData] = await Promise.all([
    ProjectStore.get(id),
    fetch("/assets/data/project-questions.json").then((r) => r.json()),
  ]);
  if (!project) return showError("Project not found - it may have been deleted.");

  document.getElementById("pv-name").textContent = project.name;
  document.getElementById("pv-pdf-title").textContent = project.name;
  document.getElementById("pv-edit-link").href = `/project/builder/?id=${project.id}`;
  document.getElementById("pv-sections").innerHTML = questionData.sections
    .map((s) => sectionHtml(s, project.answers || {}))
    .join("");

  document.getElementById("pv-loading").hidden = true;
  document.getElementById("pv-content").hidden = false;
}

main();
