// Check-pipeline issue vocabulary, adapted from the old site's ~25-key
// validation message set (identification.py / wizard.js onValidate()) to
// this site's actual data model (treatment-widget specs instead of the old
// single-threshold/tag fields). Conceptually the same coverage; some keys
// keep the old names where the underlying check is unchanged, others are
// new because our treatment model is more general (arbitrary half-open
// ranges, not just one threshold).

export const ISSUES = {
  treatment_or_outcome_missing: {
    message: "Choose both a treatment and an outcome variable.",
  },
  treatment_is_outcome: {
    message: "Treatment and outcome can't be the same column.",
  },
  treatment_or_outcome_not_in_graph: {
    message: "Both the treatment and outcome variable need a node in the causal diagram.",
    articleSlug: "causal-diagram",
  },
  has_cycles: {
    message: "Your causal diagram contains a cycle (a loop of arrows). Causal diagrams must be acyclic.",
    articleSlug: "dag",
  },
  no_directed_path: {
    message: "There's no directed path from treatment to outcome in your diagram - add the arrows that connect them (directly, or via other variables).",
    articleSlug: "causal-diagram",
  },
  no_valid_estimand: {
    message: "We couldn't find a way to estimate this effect from your diagram - the treatment and outcome may be too entangled with unobserved variables. Try adding any confounders you know about as nodes.",
    articleSlug: "identification",
  },
  treatment_group_undefined: {
    message: "Define both a Control and a Treated group for your treatment variable.",
    articleSlug: "control-and-treated",
  },
  treatment_zero_control: {
    message: "No rows fall into the Control group with the current definition.",
    articleSlug: "positivity",
  },
  treatment_zero_treated: {
    message: "No rows fall into the Treated group with the current definition.",
    articleSlug: "positivity",
  },
  class_imbalance: {
    message: "One group has fewer than 5% of samples. Estimates for the smaller group will be less reliable.",
    articleSlug: "class-imbalance",
  },
  excessive_cardinality: {
    message: "A categorical covariate has more than 10 distinct values - consider grouping rare categories or excluding it.",
    articleSlug: "cardinality",
  },
  excessive_cardinality_outcome: {
    message: "The outcome must be numeric, or categorical with exactly 2 distinct values.",
    articleSlug: "cardinality",
  },
  outcome_not_usable: {
    message: "This column doesn't look usable as an outcome (numeric or 2-category only).",
    articleSlug: "outcome",
  },
  test_set_bad: {
    message: "The test-set split leaves too few rows for a meaningful held-out evaluation.",
  },
  entity_non_unique: {
    message: "Panel data needs an entity column identifying each unit being tracked over time.",
    articleSlug: "panel-data",
  },
  time_non_unique: {
    message: "Each entity/time combination should appear only once - check your data or your entity/time column choices.",
    articleSlug: "panel-data",
  },
};

export function issueMessage(key) {
  return ISSUES[key] || { message: `Unrecognized issue: ${key}` };
}

export function issueHtml(key) {
  const issue = issueMessage(key);
  const link = issue.articleSlug
    ? ` <a href="/articles/${issue.articleSlug}/" target="_blank">Learn more</a>`
    : "";
  return `${issue.message}${link}`;
}
