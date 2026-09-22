// File parsing: a fast "peek" (first ~200 rows, for instant type-sniffing
// feedback) and a full background parse (for exact structural stats). CSV
// parsing runs off the main thread via PapaParse's built-in worker mode.
// XLSX has no equivalent streaming/worker API in SheetJS, so large Excel
// files will block the UI thread during the full parse - the upload page
// warns about this and recommends CSV for big files.

const PEEK_ROWS = 200;

export function fileTypeFor(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return "csv";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx";
  return null;
}

// A blank header (common for an exported pandas row-index column, e.g.
// ",mkt_costs,purchase,city") produces an empty-string column name. Left
// alone, an empty string is indistinguishable from "nothing selected" in
// every <select> across the app (it silently becomes the default/first
// option) - so give it a stable, non-empty fallback name here, once, at
// the source, rather than special-casing "blank column name" in every UI
// that lists columns.
function sanitizeFieldNames(fields) {
  return fields.map((f, i) => (f && f.trim() !== "" ? f : `column_${i + 1}`));
}

function toColumnar(fields, rows) {
  const columns = {};
  for (const field of fields) columns[field] = new Array(rows.length);
  rows.forEach((row, i) => {
    for (const field of fields) columns[field][i] = row[field];
  });
  return columns;
}

/** Renames each row's keys from rawFields[i] to sanitizedFields[i]. */
function remapRows(rows, rawFields, sanitizedFields) {
  if (rawFields.every((f, i) => f === sanitizedFields[i])) return rows; // nothing to do
  return rows.map((row) => {
    const newRow = {};
    for (let i = 0; i < rawFields.length; i++) newRow[sanitizedFields[i]] = row[rawFields[i]];
    return newRow;
  });
}

export function peekFile(file) {
  const type = fileTypeFor(file);
  if (type === "csv") {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        preview: PEEK_ROWS,
        skipEmptyLines: true,
        complete: (results) => {
          const rawFields = results.meta.fields || [];
          const fields = sanitizeFieldNames(rawFields);
          const rows = remapRows(results.data, rawFields, fields);
          resolve({ columnNames: fields, columns: toColumnar(fields, rows) });
        },
        error: reject,
      });
    });
  }
  if (type === "xlsx") {
    return file.arrayBuffer().then((buffer) => {
      const workbook = XLSX.read(buffer, { type: "array", sheetRows: PEEK_ROWS });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const rawFields = rawRows.length ? Object.keys(rawRows[0]) : [];
      const fields = sanitizeFieldNames(rawFields);
      const rows = remapRows(rawRows, rawFields, fields);
      return { columnNames: fields, columns: toColumnar(fields, rows) };
    });
  }
  return Promise.reject(new Error("Unsupported file type. Please upload a CSV or Excel file."));
}

export function parseFileFull(file, { onProgress } = {}) {
  const type = fileTypeFor(file);
  if (type === "csv") {
    return new Promise((resolve, reject) => {
      const columns = {};
      let rawFields = [];
      let fields = [];
      let rowCount = 0;
      Papa.parse(file, {
        header: true,
        worker: true,
        skipEmptyLines: true,
        step: (results) => {
          if (fields.length === 0) {
            rawFields = results.meta.fields || [];
            fields = sanitizeFieldNames(rawFields);
            for (const field of fields) columns[field] = [];
          }
          for (let i = 0; i < fields.length; i++) columns[fields[i]].push(results.data[rawFields[i]]);
          rowCount += 1;
          if (onProgress && rowCount % 5000 === 0) onProgress(rowCount);
        },
        complete: () => resolve({ columnNames: fields, columns, rowCount }),
        error: reject,
      });
    });
  }
  if (type === "xlsx") {
    return file.arrayBuffer().then((buffer) => {
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const rawFields = rawRows.length ? Object.keys(rawRows[0]) : [];
      const fields = sanitizeFieldNames(rawFields);
      const rows = remapRows(rawRows, rawFields, fields);
      const columns = toColumnar(fields, rows);
      return { columnNames: fields, columns, rowCount: rows.length };
    });
  }
  return Promise.reject(new Error("Unsupported file type. Please upload a CSV or Excel file."));
}
