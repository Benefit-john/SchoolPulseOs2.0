export type ResultStudent = { dbId: string; name: string; code?: string };

export type ImportedResult = {
  id: string;
  studentLabel: string;
  studentId: string;
  subject: string;
  score: number | null;
  grade: string;
  term: string;
};

type Column = "student" | "studentCode" | "subject" | "score" | "grade" | "term";

const aliases: Record<Column, string[]> = {
  student: ["student", "studentname", "name", "pupil", "pupilname", "learner", "learnername"],
  studentCode: ["studentid", "studentcode", "admissionno", "admissionnumber", "admission"],
  subject: ["subject", "course", "learningarea"],
  score: ["score", "mark", "marks", "markobtained", "marksobtained", "percentage", "percent"],
  grade: ["grade", "lettergrade"],
  term: ["term", "semester", "period"],
};

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findColumns(header: string[]): Partial<Record<Column, number>> {
  const found: Partial<Record<Column, number>> = {};
  header.forEach((value, index) => {
    const key = normalize(value);
    for (const column of Object.keys(aliases) as Column[]) {
      if (found[column] === undefined && aliases[column].includes(key)) found[column] = index;
    }
  });
  return found;
}

export function parseScore(value: string): number | null {
  const cleaned = value.trim().replace(/%/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const fraction = cleaned.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  const numeric = fraction ? (Number(fraction[1]) / Number(fraction[2])) * 100 : Number(cleaned);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100
    ? Math.round(numeric * 100) / 100
    : null;
}

function matchStudent(label: string, roster: ResultStudent[]) {
  const key = normalize(label);
  if (!key) return "";
  const matches = roster.filter(
    (student) =>
      normalize(student.name) === key ||
      normalize(student.dbId) === key ||
      normalize(student.code ?? "") === key,
  );
  return matches.length === 1 ? (matches[0]?.dbId ?? "") : "";
}

function createImportedRow(
  studentLabel: string,
  subject: string,
  scoreValue: string,
  grade: string,
  term: string,
  roster: ResultStudent[],
  rowId: number,
  studentCode = "",
): ImportedResult | null {
  const cleanSubject = subject.trim();
  const cleanLabel = studentLabel.trim() || studentCode.trim();
  const score = parseScore(scoreValue);
  if (!cleanSubject || score === null) return null;
  return {
    id: `${rowId}-${normalize(cleanSubject)}-${normalize(cleanLabel)}`,
    studentLabel: cleanLabel,
    studentId: matchStudent(studentCode, roster) || matchStudent(cleanLabel, roster),
    subject: cleanSubject,
    score,
    grade: grade.trim(),
    term: term.trim(),
  };
}

export function parseResultMatrix(
  matrix: string[][],
  roster: ResultStudent[],
  defaultTerm: string,
  defaultStudent = "",
): ImportedResult[] {
  const headerIndex = matrix.findIndex((row) => {
    const columns = findColumns(row);
    return columns.subject !== undefined && columns.score !== undefined;
  });
  if (headerIndex < 0) {
    throw new Error("Could not find Subject and Score columns. Add a header row to the file.");
  }
  const columns = findColumns(matrix[headerIndex] ?? []);
  const inheritedStudent =
    defaultStudent ||
    matrix
      .slice(0, headerIndex)
      .find((row) =>
        ["studentname", "student", "pupilname", "pupil"].includes(normalize(row[0] ?? "")),
      )?.[1]
      ?.trim() ||
    "";
  const rows: ImportedResult[] = [];
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index] ?? [];
    const cell = (column: Column) => row[columns[column] ?? -1] ?? "";
    if (!row.some((value) => value.trim())) continue;
    const imported = createImportedRow(
      cell("student") || inheritedStudent,
      cell("subject"),
      cell("score"),
      cell("grade"),
      cell("term") || defaultTerm,
      roster,
      index + 1,
      cell("studentCode"),
    );
    if (imported) rows.push(imported);
  }
  return rows;
}

function extractStudentLabel(text: string) {
  const match = text.match(
    /(?:student(?:\s*name)?|pupil(?:\s*name)?|learner(?:\s*name)?)\s*[:#-]\s*([^\r\n]+)/i,
  );
  return match?.[1]?.trim() ?? "";
}

function splitOcrRow(line: string, starts: number[]) {
  return starts.map((start, index) => line.slice(start, starts[index + 1] ?? undefined).trim());
}

export function parseOcrResults(
  text: string,
  roster: ResultStudent[],
  defaultTerm: string,
  defaultStudent = "",
): ImportedResult[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
  const studentLabel = extractStudentLabel(text) || defaultStudent;
  const headerIndex = lines.findIndex((line) => {
    const normalized = normalize(line);
    return (
      /\b(subject|course|learning area)\b/i.test(line) &&
      /\b(score|marks?|percentage|percent)\b/i.test(line) &&
      normalized.length > 0
    );
  });
  const imported: ImportedResult[] = [];

  if (headerIndex >= 0) {
    const header = lines[headerIndex] ?? "";
    const starts: Partial<Record<Column, number>> = {};
    for (const column of Object.keys(aliases) as Column[]) {
      for (const alias of aliases[column]) {
        const label = new RegExp(
          `\\b${alias.replace(/(student|pupil|learner|learning|admission|marks?)(?=name|id|code|area|obtained|no|number)/g, "$1\\s*")}\\b`,
          "i",
        );
        const found = label.exec(header);
        if (found && (starts[column] === undefined || found.index < starts[column])) {
          starts[column] = found.index;
        }
      }
    }
    const sortedColumns = (Object.keys(starts) as Column[])
      .filter((column) => starts[column] !== undefined)
      .sort((a, b) => starts[a]! - starts[b]!);
    const indices = sortedColumns.map((column) => starts[column]!);
    for (let index = headerIndex + 1; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      if (!line.trim() || /^\s*[-=_]{3,}\s*$/.test(line)) continue;
      const cells = splitOcrRow(line, indices);
      const cell = (column: Column) => {
        const position = sortedColumns.indexOf(column);
        return position < 0 ? "" : (cells[position] ?? "");
      };
      const row = createImportedRow(
        cell("student") || studentLabel,
        cell("subject"),
        cell("score"),
        cell("grade"),
        cell("term") || defaultTerm,
        roster,
        index + 1,
        cell("studentCode"),
      );
      if (row) imported.push(row);
    }
  }

  if (imported.length) return imported;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    const match = line.match(
      /^(.{2,48}?)\s{1,}(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?%?)\s*(?:\s+([A-F][+-]?))?$/i,
    );
    if (!match) continue;
    const subject = match[1]?.trim() ?? "";
    if (/^(student|name|term|subject|total|average|score|marks?)\b/i.test(subject)) continue;
    const row = createImportedRow(
      studentLabel,
      subject,
      match[2] ?? "",
      match[3] ?? "",
      defaultTerm,
      roster,
      index + 1,
    );
    if (row) imported.push(row);
  }
  if (!imported.length) {
    throw new Error(
      "No result rows could be read. Use a clear table with Subject and Score columns, or upload a spreadsheet.",
    );
  }
  return imported;
}

export function matchImportedStudent(label: string, roster: ResultStudent[]) {
  return matchStudent(label, roster);
}
