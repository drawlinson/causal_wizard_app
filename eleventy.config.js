export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  // Articles collection, sorted by title (Eleventy's default tag-based
  // collections sort by date, which isn't useful here).
  eleventyConfig.addCollection("articles", (api) =>
    api.getFilteredByTag("articles").sort((a, b) => a.data.title.localeCompare(b.data.title))
  );

  // Look up a category's display name from its slug (categories.json is
  // available as the global `categories` data in every template).
  eleventyConfig.addFilter("categoryName", (slug, categories) => {
    const match = categories.find((c) => c.slug === slug);
    return match ? match.name : slug;
  });

  // Does `slugs` (an array) contain `slug`?
  eleventyConfig.addFilter("hasSlug", (slugs, slug) => slugs.includes(slug));

  // Do two slug arrays share at least one entry?
  eleventyConfig.addFilter("sharesSlug", (slugsA, slugsB) => slugsA.some((s) => slugsB.includes(s)));

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
    },
  };
}
