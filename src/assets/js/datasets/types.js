// Column type sniffing. Deliberately more thorough than the old server-side
// version, which just trusted pandas' post-parse dtype (so "Yes"/"No" or
// ISO date strings both came out as plain "string"). Called twice: once on
// a small peek sample for instant feedback, once on the full column during
// the background scan - callers compare the two and flag disagreements.

const BOOLEAN_PAIRS = [
  ["true", "false"],
  ["yes", "no"],
  ["y", "n"],
  ["t", "f"],
  ["1", "0"],
];

const NUMERIC_RE = /^-?\d+(,\d{3})*(\.\d+)?([eE][+-]?\d+)?$/;

const DATE_RES = [
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/, // ISO
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // D/M/Y or M/D/Y
  /^\d{1,2}-\d{1,2}-\d{2,4}$/,
];

function nonMissing(values) {
  return values.filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
}

function looksBoolean(present) {
  const distinct = new Set(present.map((v) => String(v).trim().toLowerCase()));
  if (distinct.size !== 2) return false;
  return BOOLEAN_PAIRS.some((pair) => pair.every((p) => distinct.has(p)));
}

function looksNumeric(present) {
  return present.every((v) => NUMERIC_RE.test(String(v).trim()));
}

function looksDatetime(present) {
  const matches = present.filter((v) => DATE_RES.some((re) => re.test(String(v).trim())));
  return matches.length / present.length >= 0.9;
}

/**
 * @param {Array} values raw cell values (strings, or already-parsed numbers)
 * @returns {{type: "boolean"|"numeric"|"datetime"|"categorical"|"text", uniqueCount: number, missingCount: number, isConstant: boolean, isNearUnique: boolean}}
 */
export function sniffType(values) {
  const present = nonMissing(values);
  const missingCount = values.length - present.length;
  const distinctValues = new Set(present.map((v) => String(v).trim()));
  const uniqueCount = distinctValues.size;

  let type;
  if (present.length === 0) {
    type = "text";
  } else if (looksBoolean(present)) {
    type = "boolean";
  } else if (looksNumeric(present)) {
    type = "numeric";
  } else if (looksDatetime(present)) {
    type = "datetime";
  } else {
    const ratio = uniqueCount / present.length;
    const categorical = uniqueCount <= 20 || ratio <= 0.05;
    type = categorical ? "categorical" : "text";
  }

  return {
    type,
    uniqueCount,
    missingCount,
    isConstant: uniqueCount <= 1,
    // Only meaningful for categorical/text columns (e.g. a customer-id
    // string) - a numeric column is expected to be almost all-unique for
    // any continuous measurement (age, income, a GPS coordinate...), so
    // flagging it here would just be noise, not a sign of an ID column.
    isNearUnique: type !== "numeric" && present.length > 20 && uniqueCount / present.length >= 0.95,
  };
}

export function parseNumeric(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null; // Number("") is 0, not NaN - guard explicitly
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
