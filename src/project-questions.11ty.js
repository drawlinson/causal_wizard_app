// Publishes src/_data/projectQuestions.js as a static JSON asset, so
// client-side JS (project-list.js, project-builder.js, project-view.js)
// can fetch the exact same question bank the Nunjucks tips pages render
// from - one source of truth, no content duplicated between the static
// tips pages and the interactive wizard.
export const data = {
  permalink: "/assets/data/project-questions.json",
  eleventyExcludeFromCollections: true,
};

export function render({ projectQuestions }) {
  return JSON.stringify(projectQuestions);
}
