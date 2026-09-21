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

function toColumnar(fields, rows) {
  const columns = {};
  for (const field of fields) columns[field] = new Array(rows.length);
  rows.forEach((row, i) => {
    for (const field of fields) columns[field][i] = row[field];
  });
  return columns;
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
          const fields = results.meta.fields || [];
          resolve({ columnNames: fields, columns: toColumnar(fields, results.data) });
        },
        error: reject,
      });
    });
  }
  if (type === "xlsx") {
    return file.arrayBuffer().then((buffer) => {
      const workbook = XLSX.read(buffer, { type: "array", sheetRows: PEEK_ROWS });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const fields = rows.length ? Object.keys(rows[0]) : [];
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
      let fields = [];
      let rowCount = 0;
      Papa.parse(file, {
        header: true,
        worker: true,
        skipEmptyLines: true,
        step: (results) => {
          if (fields.length === 0) {
            fields = results.meta.fields || [];
            for (const field of fields) columns[field] = [];
          }
          for (const field of fields) columns[field].push(results.data[field]);
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
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const fields = rows.length ? Object.keys(rows[0]) : [];
      const columns = toColumnar(fields, rows);
      return { columnNames: fields, columns, rowCount: rows.length };
    });
  }
  return Promise.reject(new Error("Unsupported file type. Please upload a CSV or Excel file."));
}
