/**
 * catalog-seed.csv encoding/decoding, shared by fetch-catalog.ts (writer) and
 * seed-db.ts (reader). Hand-rolled on purpose: the seed pipeline is the only
 * CSV producer/consumer in the project and a dependency-free script keeps the
 * "runs with plain `node`" property (no bundler, no csv library).
 *
 * Dialect: RFC 4180 — comma separator, \n row terminator, fields quoted only
 * when they contain a comma, quote, or newline; quotes escaped by doubling.
 * Hebrew product names survive as plain UTF-8.
 */

export const CSV_HEADER = ["barcode", "name", "brand", "package_size", "category"] as const;

/** One catalog product as persisted in the CSV. Empty string = NULL in the DB. */
export interface SeedRow {
  barcode: string;
  name: string;
  brand: string;
  package_size: string;
  category: string;
}

function encodeField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function encodeCsv(rows: SeedRow[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const row of rows) {
    lines.push(CSV_HEADER.map((column) => encodeField(row[column])).join(","));
  }
  return lines.join("\n") + "\n";
}

/** Split CSV text into raw records, honoring quoted commas/newlines. */
function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      field = "";
      record = [];
    } else {
      field += char;
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

export function decodeCsv(text: string): SeedRow[] {
  const records = parseRecords(text.replace(/^\uFEFF/, ""));
  if (records.length === 0) {
    throw new Error("catalog CSV is empty");
  }

  const header = records[0];
  if (header.join(",") !== CSV_HEADER.join(",")) {
    throw new Error(
      `catalog CSV header mismatch: expected "${CSV_HEADER.join(",")}", got "${header.join(",")}"`,
    );
  }

  return records.slice(1).map((record, index) => {
    if (record.length !== CSV_HEADER.length) {
      throw new Error(
        `catalog CSV row ${index + 2} has ${record.length} fields, expected ${CSV_HEADER.length}`,
      );
    }
    const [barcode, name, brand, package_size, category] = record;
    return { barcode, name, brand, package_size, category };
  });
}
