// Hand-rolled CSV reader (no dependency, SBOM ceiling). Dialect: French
// Excel exports — ";" separator expected ("," sniffed and flagged), double
// quotes with "" escapes, fields may contain separators and newlines when
// quoted, CRLF and LF accepted. Nothing is ever dropped silently: every
// deviation lands in `warnings` (French, report-ready).

/** One record; `line` is the 1-based physical line where the record starts. */
export interface CsvRow {
  line: number;
  cells: string[];
}

/** Outcome of parsing one CSV text. */
export interface CsvParseResult {
  rows: CsvRow[];
  separator: ";" | ",";
  /** French signalements: deviant separator, quote anomalies... */
  warnings: string[];
}

/**
 * Detects the field separator on the first physical line, outside quotes.
 * Inputs: the decoded CSV text.
 * Outputs: the winning separator (";" wins ties) and whether it deviates
 * from the expected ";".
 * Failure modes: none — empty text yields the default ";".
 */
export function sniffSeparator(text: string): { separator: ";" | ","; deviant: boolean } {
  let semicolons = 0;
  let commas = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && ch === ";") semicolons++;
    else if (!inQuotes && ch === ",") commas++;
  }
  const separator = commas > semicolons ? "," : ";";
  return { separator, deviant: separator === "," };
}

interface Scanner {
  text: string;
  pos: number;
  /** Current physical line, 1-based. */
  line: number;
  /** Physical line where the record being built started. */
  rowLine: number;
  separator: ";" | ",";
  field: string;
  cells: string[];
  rows: CsvRow[];
  warnings: string[];
  warnedLiteralQuote: boolean;
}

/**
 * Parses a decoded CSV text into records.
 * Inputs: the text (BOM already stripped by the decoder).
 * Outputs: rows with their starting line numbers, the separator used, and
 * French warnings for every tolerated anomaly (deviant separator, lone
 * quote taken literally, unterminated quote). Empty physical lines yield a
 * single-empty-cell row (callers discard them with a reason); a trailing
 * newline yields no phantom row.
 * Failure modes: none — total function, worst case is warnings.
 */
export function parseCsv(text: string): CsvParseResult {
  const sniffed = sniffSeparator(text);
  const s: Scanner = {
    text, pos: 0, line: 1, rowLine: 1, separator: sniffed.separator,
    field: "", cells: [], rows: [], warnings: [], warnedLiteralQuote: false,
  };
  if (sniffed.deviant) {
    s.warnings.push("séparateur « , » détecté (« ; » attendu) — fichier lu avec « , »");
  }
  while (s.pos < s.text.length) {
    const ch = s.text.charAt(s.pos);
    if (ch === '"') consumeQuote(s);
    else if (ch === s.separator) {
      endField(s);
      s.pos++;
    } else if (ch === "\n" || ch === "\r") consumeNewline(s);
    else {
      s.field += ch;
      s.pos++;
    }
  }
  if (s.field !== "" || s.cells.length > 0) endRow(s);
  return { rows: s.rows, separator: s.separator, warnings: s.warnings };
}

// A quote at field start opens a quoted field; anywhere else it is taken
// literally and flagged once per file.
function consumeQuote(s: Scanner): void {
  if (s.field === "") {
    consumeQuotedField(s);
    return;
  }
  s.field += '"';
  s.pos++;
  if (!s.warnedLiteralQuote) {
    s.warnings.push(
      `guillemet isolé dans un champ non guillemeté (ligne ${s.line}) — pris littéralement`,
    );
    s.warnedLiteralQuote = true;
  }
}

// Scans from the opening quote to the closing one. "" is an escaped quote;
// newlines are kept (normalized to \n) and counted; EOF before the closing
// quote keeps the remainder and warns.
function consumeQuotedField(s: Scanner): void {
  const openedAt = s.line;
  s.pos++;
  while (s.pos < s.text.length) {
    const ch = s.text.charAt(s.pos);
    if (ch === '"') {
      if (s.text.charAt(s.pos + 1) === '"') {
        s.field += '"';
        s.pos += 2;
      } else {
        s.pos++;
        return;
      }
    } else if (ch === "\r" || ch === "\n") {
      s.field += "\n";
      s.pos += ch === "\r" && s.text.charAt(s.pos + 1) === "\n" ? 2 : 1;
      s.line++;
    } else {
      s.field += ch;
      s.pos++;
    }
  }
  s.warnings.push(
    `guillemet non refermé (champ ouvert ligne ${openedAt}) — fin de fichier prise comme valeur`,
  );
}

function endField(s: Scanner): void {
  s.cells.push(s.field);
  s.field = "";
}

function endRow(s: Scanner): void {
  endField(s);
  s.rows.push({ line: s.rowLine, cells: s.cells });
  s.cells = [];
}

// CRLF counts as one line break; the next record starts on the next line.
function consumeNewline(s: Scanner): void {
  endRow(s);
  const ch = s.text.charAt(s.pos);
  s.pos += ch === "\r" && s.text.charAt(s.pos + 1) === "\n" ? 2 : 1;
  s.line++;
  s.rowLine = s.line;
}
