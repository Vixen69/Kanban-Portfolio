// Splitting of the SP_total « Nom » cell: an embedded « PE » code becomes
// the codename, the rest is the title. Reading is tolerant, anomalies are
// named (docs/IMPORT-MAPPING.md « Codes PE anormaux (4/6 chiffres, espaces,
// minuscules) : lecture tolérante + signalement »).

/** Outcome of splitting one « Nom » cell. */
export interface NameSplit {
  title: string;
  codename: string | null;
  /** French anomaly labels, one per oddity — the caller tallies them. */
  anomalies: string[];
}

/**
 * Extracts the PE code (4-6 digits tolerated) and derives the title.
 * Inputs: the raw « Nom » cell (trimmed by the caller).
 * Outputs: the cleaned title, the normalized codename (PE + digits, upper
 * case) or null, and the anomaly labels: unusual length, lowercase code,
 * space/hyphen between PE and digits, name reduced to the code alone,
 * 7-digit-plus codes left unextracted.
 * Failure modes: none.
 */
export function splitSubjectName(nom: string): NameSplit {
  const anomalies: string[] = [];
  const m = nom.match(/\bPE([\s-]?)(\d{4,6})\b/i);
  if (m === null || m.index === undefined) {
    if (/PE[\s-]?\d{7,}/i.test(nom)) anomalies.push("code PE de plus de 6 chiffres — non extrait");
    return { title: tidy(nom), codename: null, anomalies };
  }
  const digits = m[2] ?? "";
  if (digits.length !== 5) anomalies.push("code projet de longueur inhabituelle");
  if (m[0].slice(0, 2) !== "PE") anomalies.push("code projet en minuscules");
  if ((m[1] ?? "") !== "") anomalies.push("code projet avec espace ou tiret");
  const rest = tidy(nom.slice(0, m.index) + " " + nom.slice(m.index + m[0].length));
  if (rest === "") anomalies.push("nom réduit au code (sans libellé)");
  return {
    title: rest === "" ? `PE${digits}` : rest,
    codename: `PE${digits}`,
    anomalies,
  };
}

// Collapses the scars left by excising a mid-name code: emptied
// parentheses, doubled separators, dangling edges.
function tidy(s: string): string {
  return s
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/(\s*[-–—:·]\s*){2,}/g, " - ")
    .replace(/^[\s\-–—:·]+|[\s\-–—:·]+$/g, "")
    .trim();
}
