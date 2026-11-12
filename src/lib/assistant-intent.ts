export type AssistantIntent =
  | { type: "greeting" }
  | { type: "attendance-summary" }
  | { type: "attendance-list"; status: "absent" | "late" | "unmarked" }
  | { type: "fee-summary" }
  | { type: "fee-list" }
  | { type: "academic-summary"; term?: string; subject?: string }
  | {
      type: "academic-low-scores";
      threshold: number;
      term?: string;
      subject?: string;
    }
  | { type: "staff-count"; staffKind: "teacher" | "all" }
  | { type: "visitor-count" };

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[-_]/g, " ")
    .replace(/[^a-z0-9%.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function extractTerm(value: string): string | undefined {
  const named = value.match(/\b(first|1st|second|2nd|third|3rd)\s+term\b/);
  if (named) {
    const term = named[1];
    if (term === "first" || term === "1st") return "Term 1";
    if (term === "second" || term === "2nd") return "Term 2";
    return "Term 3";
  }
  const numbered = value.match(/\bterm\s*([123])\b/);
  return numbered ? `Term ${numbered[1]}` : undefined;
}

function extractSubject(value: string): string | undefined {
  const found = value.match(
    /\b(?:in|for|subject)\s+([a-z][a-z0-9 &-]{1,39}?)(?=\s+(?:for|during|in|below|under|above|over|with|scored|score|term)\b|$)/,
  );
  if (!found) return undefined;
  const subject = found[1]?.trim().replace(/\s+/g, " ");
  const ignored = new Set([
    "all subjects",
    "any subject",
    "the subject",
    "this subject",
    "first",
    "second",
    "third",
    "first term",
    "second term",
    "third term",
  ]);
  return subject && !ignored.has(subject) ? subject : undefined;
}

function extractThreshold(value: string): number | undefined {
  const match = value.match(
    /\b(?:below|under|less than|lower than|scored? under|scored? below)\s+(\d{1,3})(?:\s*%)?\b/,
  );
  if (!match) return undefined;
  const threshold = Number(match[1]);
  return threshold >= 0 && threshold <= 100 ? threshold : undefined;
}

function detectAttendance(value: string, previous: string): AssistantIntent | null {
  const isAttendance = hasAny(value, [
    /\battendance\b/,
    /\babsent\b/,
    /\babsence\b/,
    /\blate\b/,
    /\bpresent\b/,
    /\broll call\b/,
    /\bregister\b/,
    /\bunmarked\b/,
    /\bnot marked\b/,
  ]);
  if (!isAttendance) return null;

  const combined = `${value} ${previous}`;
  let status: "absent" | "late" | "unmarked" | undefined;
  if (/\babsent\b|\babsence\b/.test(combined)) status = "absent";
  else if (/\blate\b/.test(combined)) status = "late";
  else if (/\bunmarked\b|\bnot marked\b|\bnot recorded\b/.test(combined)) status = "unmarked";

  const asksForList = hasAny(value, [
    /\bwho\b/,
    /\bwhich students\b/,
    /\blist\b/,
    /\bnames\b/,
    /\bshow me\b/,
  ]);
  const asksForSummary = hasAny(value, [
    /\bsummary\b/,
    /\bsummarize\b/,
    /\bsummarise\b/,
    /\boverview\b/,
    /\btotals?\b/,
    /\beveryone\b/,
  ]);

  if (status && asksForList && !asksForSummary) {
    return { type: "attendance-list", status };
  }
  if (status && /\bwho\b|\bwhich students\b|\blist\b|\bnames\b|\bshow me\b/.test(value)) {
    return { type: "attendance-list", status };
  }
  if (
    hasAny(value, [
      /\bhow many\b/,
      /\bsummary\b/,
      /\bsummarize\b/,
      /\bsummarise\b/,
      /\boverview\b/,
      /\btotals?\b/,
      /\battendance\b/,
      /\bregister\b/,
      /\bhow is .{0,30} attendance\b/,
    ])
  ) {
    return { type: "attendance-summary" };
  }
  if (status && /\bhow many\b|\bcount\b/.test(value)) {
    return { type: "attendance-summary" };
  }
  return null;
}

export function detectAssistantIntent(
  question: string,
  previousQuestion?: string,
): AssistantIntent | null {
  const value = normalize(question);
  const previous = normalize(previousQuestion ?? "");
  if (!value) return null;

  if (/^(hi|hello|hey|good morning|good afternoon|good evening)$/.test(value)) {
    return { type: "greeting" };
  }

  if (/^(which ones|who are they|show me the names|and their names|list them)\b/.test(value)) {
    const previousIntent = detectAssistantIntent(previous);
    if (previousIntent?.type === "attendance-summary") {
      if (/\babsent\b|\babsence\b/.test(previous)) {
        return { type: "attendance-list", status: "absent" };
      }
      if (/\blate\b/.test(previous)) return { type: "attendance-list", status: "late" };
      if (/\bunmarked\b|\bnot marked\b/.test(previous)) {
        return { type: "attendance-list", status: "unmarked" };
      }
      return null;
    }
    if (
      previousIntent?.type === "attendance-list" ||
      previousIntent?.type === "academic-low-scores"
    ) {
      return previousIntent;
    }
    if (previousIntent?.type === "fee-summary") return { type: "fee-list" };
  }

  const attendanceIntent = detectAttendance(value, previous);
  if (attendanceIntent) return attendanceIntent;

  const isFee = hasAny(value, [
    /\bfees?\b/,
    /\bpayment\b/,
    /\bpaid\b/,
    /\bunpaid\b/,
    /\bbalance\b/,
    /\boutstanding\b/,
    /\bdebtors?\b/,
  ]);
  if (isFee) {
    if (
      hasAny(value, [
        /\bwho\b/,
        /\bwhich students\b/,
        /\blist\b/,
        /\bnames\b/,
        /\bshow me\b/,
        /\bprepare a list\b/,
      ])
    ) {
      return { type: "fee-list" };
    }
    if (
      hasAny(value, [
        /\bhow many\b/,
        /\bhow much\b/,
        /\btotal\b/,
        /\bsummar/,
        /\bperform/,
        /\bcollection\b/,
        /\boutstanding\b/,
        /\bfees?\b/,
      ])
    ) {
      return { type: "fee-summary" };
    }
  }

  const isAcademic = hasAny(value, [
    /\bgrade\b/,
    /\bgrades\b/,
    /\bscore\b/,
    /\bscores\b/,
    /\bmarks\b/,
    /\bresult\b/,
    /\bresults\b/,
    /\bacademic\b/,
    /\bperformance\b/,
    /\bmathematics\b/,
    /\bmaths\b/,
    /\benglish\b/,
    /\bscience\b/,
  ]);
  if (isAcademic) {
    const threshold = extractThreshold(value);
    const subject = /\bmathematics\b|\bmaths\b/.test(value) ? "mathematics" : extractSubject(value);
    const term = extractTerm(value);
    const details = {
      ...(term ? { term } : {}),
      ...(subject ? { subject } : {}),
    };
    if (threshold !== undefined) {
      return { type: "academic-low-scores", threshold, ...details };
    }
    return { type: "academic-summary", ...details };
  }

  if (
    hasAny(value, [/\bteacher/, /\bstaff\b/, /\bemployed\b/, /\bworkforce\b/]) &&
    hasAny(value, [/\bhow many\b/, /\bcount\b/, /\bnumber of\b/, /\btotal\b/])
  ) {
    return { type: "staff-count", staffKind: /\bteacher/.test(value) ? "teacher" : "all" };
  }

  if (
    hasAny(value, [/\bvisitor/, /\bguest/, /\bon campus\b/]) &&
    hasAny(value, [/\bhow many\b/, /\bcount\b/, /\bcurrently\b/, /\bon campus\b/])
  ) {
    return { type: "visitor-count" };
  }

  return null;
}
