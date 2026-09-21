// Client-side article/category search. Replaces the old server-side
// /inference/search endpoint - everything here runs against a small
// pre-built index (see search-index.json) fetched once on page load.

(function () {
  const SEARCH_INDEX_URL = "/assets/data/search-index.json";

  function splitTerms(query) {
    return query
      .replace(/[,.]/g, " ")
      .toLowerCase()
      .split(" ")
      .filter((term) => term.length > 0);
  }

  function matchesAnyTerm(haystack, terms) {
    const lower = haystack.toLowerCase();
    return terms.some((term) => lower.includes(term));
  }

  function listItemHtml(text, url) {
    const label = url ? `<a href="${url}">${text}</a>` : text;
    return `<li><h5>${label}</h5></li>`;
  }

  function renderResults(matchedArticles, matchedCategories) {
    const articlesHtml = matchedArticles.length
      ? matchedArticles.map((a) => listItemHtml(a.title, `/articles/${a.slug}/`)).join("")
      : listItemHtml("No results found.", null);

    const categoriesHtml = matchedCategories.length
      ? matchedCategories.map((c) => listItemHtml(c.name, `/category/${c.slug}/`)).join("")
      : listItemHtml("No results found.", null);

    document.getElementById("search-articles").innerHTML = articlesHtml;
    document.getElementById("search-categories").innerHTML = categoriesHtml;
    document.getElementById("search-results").style.display = "";

    const topics = document.getElementById("topics");
    if (topics && (matchedArticles.length || matchedCategories.length)) {
      topics.style.display = "none";
    }
  }

  function runSearch(index, query) {
    const terms = splitTerms(query);
    if (terms.length === 0) {
      return;
    }
    const matchedArticles = index.articles.filter(
      (a) => matchesAnyTerm(a.title, terms) || matchesAnyTerm(a.keywords, terms)
    );
    const matchedCategories = index.categories.filter((c) => matchesAnyTerm(c.name, terms));
    renderResults(matchedArticles, matchedCategories);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("search-form");
    const queryInput = document.getElementById("search-query");
    if (!form || !queryInput) {
      return;
    }

    let indexPromise = null;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!indexPromise) {
        indexPromise = fetch(SEARCH_INDEX_URL).then((response) => response.json());
      }
      indexPromise.then((index) => runSearch(index, queryInput.value));
    });
  });
})();
