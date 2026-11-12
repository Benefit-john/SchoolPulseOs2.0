import { createFileRoute } from "@tanstack/react-router";
import { FileUp, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { ImportedResult } from "@/lib/result-import";
import { useSchoolStore } from "@/lib/school-store";
import { requireRoles } from "@/lib/route-guards";

type ResultRow = {
  id: string;
  subject: string;
  score: number | null;
  grade: string | null;
  term: string;
};

const db = () =>
  supabase as unknown as {
    from: (table: string) => ReturnType<typeof supabase.from>;
  };

export const Route = createFileRoute("/_authenticated/teacher/results")({
  ssr: false,
  beforeLoad: () => requireRoles(["admin", "teacher"]),
  component: TeacherResultsPage,
});

function TeacherResultsPage() {
  const { state } = useSchoolStore();
  const [studentId, setStudentId] = useState("");
  const [term, setTerm] = useState("Term 1");
  const [subject, setSubject] = useState("");
  const [score, setScore] = useState("");
  const [grade, setGrade] = useState("");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [importRows, setImportRows] = useState<ImportedResult[]>([]);
  const [importWarning, setImportWarning] = useState("");
  const uploadInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const schoolId = state.school?.id;
    if (!schoolId || !studentId || !term.trim()) {
      setResults([]);
      return () => {
        active = false;
      };
    }
    void (async () => {
      const { data, error } = await db()
        .from("student_results")
        .select("id,subject,score,grade,term")
        .eq("school_id", schoolId)
        .eq("student_id", studentId)
        .eq("term", term.trim())
        .order("subject");
      if (!active) return;
      if (error) setNotice(error.message);
      setResults((data ?? []) as ResultRow[]);
    })();
    return () => {
      active = false;
    };
  }, [studentId, state.school?.id, term]);

  const saveResult = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericScore = Number(score);
    if (
      !state.school ||
      !studentId ||
      !state.students.some((student) => student.dbId === studentId) ||
      !subject.trim() ||
      !term.trim() ||
      !Number.isFinite(numericScore) ||
      numericScore < 0 ||
      numericScore > 100
    ) {
      setNotice("Choose a student, enter a subject and term, and use a score from 0 to 100.");
      return;
    }

    setBusy(true);
    setNotice("");
    const existing = await db()
      .from("student_results")
      .select("id")
      .eq("school_id", state.school.id)
      .eq("student_id", studentId)
      .eq("term", term.trim())
      .eq("subject", subject.trim())
      .maybeSingle();
    if (existing.error) {
      setBusy(false);
      setNotice(existing.error.message);
      return;
    }

    const payload = {
      school_id: state.school.id,
      student_id: studentId,
      term: term.trim(),
      subject: subject.trim(),
      score: numericScore,
      grade: grade.trim() || null,
      published_at: new Date().toISOString(),
    };
    const result = existing.data?.id
      ? await db()
          .from("student_results")
          .update(payload)
          .eq("school_id", state.school.id)
          .eq("id", existing.data.id)
      : await db().from("student_results").insert(payload);
    setBusy(false);
    if (result.error) {
      setNotice(result.error.message);
      return;
    }
    setNotice("Result saved.");
    const refreshed = await db()
      .from("student_results")
      .select("id,subject,score,grade,term")
      .eq("school_id", state.school.id)
      .eq("student_id", studentId)
      .eq("term", term.trim())
      .order("subject");
    setResults((refreshed.data ?? []) as ResultRow[]);
    setSubject("");
    setScore("");
    setGrade("");
  };

  const updateImportRow = (id: string, patch: Partial<ImportedResult>) => {
    setImportRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const importFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    setNotice("");
    setImportWarning("");
    try {
      if (!state.school) throw new Error("Choose a school workspace before importing results.");
      const {
        readImageAndPdfResults,
        readSpreadsheetResults,
        splitResultFiles,
        validateResultFiles,
      } = await import("@/lib/result-import-browser");
      validateResultFiles(files);
      setImporting(true);
      setImportProgress("Preparing local result import");
      const { spreadsheetFiles, imageAndPdfFiles } = splitResultFiles(files);
      const imported: ImportedResult[] = [];

      for (const [fileIndex, file] of spreadsheetFiles.entries()) {
        setImportProgress(`Reading ${file.name}`);
        const rows = await readSpreadsheetResults(
          file,
          state.students.map(({ dbId, name, id }) => ({ dbId, name, code: id })),
          term.trim(),
          studentId
            ? (state.students.find((student) => student.dbId === studentId)?.name ?? "")
            : "",
        );
        imported.push(
          ...rows.map((row) => ({
            ...row,
            id: `sheet-${fileIndex}-${row.id}`,
          })),
        );
      }

      if (imageAndPdfFiles.length) {
        const result = await readImageAndPdfResults(
          imageAndPdfFiles,
          state.students.map(({ dbId, name, id }) => ({ dbId, name, code: id })),
          term.trim(),
          studentId
            ? (state.students.find((student) => student.dbId === studentId)?.name ?? "")
            : "",
          setImportProgress,
        );
        imported.push(
          ...result.rows.map((row, index) => ({
            ...row,
            id: `scan-${index}-${row.id}`,
          })),
        );
        if (result.unreadablePages) {
          setImportWarning(
            `${result.unreadablePages} page${result.unreadablePages === 1 ? "" : "s"} could not be read and were left out. Review the recognized rows before saving.`,
          );
        }
      }

      if (!imported.length) throw new Error("No result rows were found in the selected files.");
      setImportRows(imported);
      setNotice(
        `${imported.length} result row${imported.length === 1 ? "" : "s"} extracted. Confirm each student and score before saving.`,
      );
    } catch (error) {
      setImportRows([]);
      setNotice(
        error instanceof Error ? error.message : "Could not read the selected result files.",
      );
    } finally {
      setImporting(false);
      setImportProgress("");
    }
  };

  const saveImportedResults = async () => {
    if (!state.school || !importRows.length) return;
    const invalidRow = importRows.find(
      (row) =>
        !row.studentId ||
        !row.subject.trim() ||
        !row.term.trim() ||
        row.score === null ||
        !Number.isFinite(row.score) ||
        row.score < 0 ||
        row.score > 100,
    );
    if (invalidRow) {
      setNotice(
        "Every row needs a confirmed student, subject, term, and score from 0 to 100. Edit or remove incomplete rows first.",
      );
      return;
    }

    const keys = importRows.map(
      (row) =>
        `${row.studentId}\u0000${row.term.trim().toLowerCase()}\u0000${row.subject.trim().toLowerCase()}`,
    );
    if (new Set(keys).size !== keys.length) {
      setNotice(
        "This import contains duplicate student, term, and subject rows. Remove duplicates first.",
      );
      return;
    }

    setBusy(true);
    setNotice("Saving reviewed results…");
    const failures: string[] = [];
    let saved = 0;
    for (const row of importRows) {
      const existing = await db()
        .from("student_results")
        .select("id")
        .eq("school_id", state.school.id)
        .eq("student_id", row.studentId)
        .eq("term", row.term.trim())
        .eq("subject", row.subject.trim())
        .maybeSingle();
      if (existing.error) {
        failures.push(`${row.studentLabel || row.subject}: ${existing.error.message}`);
        continue;
      }
      const payload = {
        school_id: state.school.id,
        student_id: row.studentId,
        term: row.term.trim(),
        subject: row.subject.trim(),
        score: row.score,
        grade: row.grade.trim() || null,
        published_at: new Date().toISOString(),
      };
      const result = existing.data?.id
        ? await db()
            .from("student_results")
            .update(payload)
            .eq("school_id", state.school.id)
            .eq("id", existing.data.id)
        : await db().from("student_results").insert(payload);
      if (result.error) {
        failures.push(`${row.studentLabel || row.subject}: ${result.error.message}`);
      } else {
        saved += 1;
      }
    }

    setBusy(false);
    if (failures.length) {
      setNotice(
        `${saved} row${saved === 1 ? "" : "s"} saved; ${failures.length} failed. ${failures.slice(0, 3).join(" · ")}`,
      );
      return;
    }
    setNotice(`${saved} reviewed result${saved === 1 ? "" : "s"} saved to student records.`);
    setImportRows([]);
    if (studentId) {
      const refreshed = await db()
        .from("student_results")
        .select("id,subject,score,grade,term")
        .eq("school_id", state.school.id)
        .eq("student_id", studentId)
        .eq("term", term.trim())
        .order("subject");
      if (refreshed.error) {
        setNotice(
          `Results were saved, but the list could not be refreshed: ${refreshed.error.message}`,
        );
      } else {
        setResults((refreshed.data ?? []) as ResultRow[]);
      }
    }
  };

  return (
    <AppShell title="Results" subtitle="Enter, import, and review term results for your students.">
      <div className="space-y-5">
        <section className="hairline-card space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">Import results from files</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Read photos and scanned PDFs on this device, or import a CSV/XLSX sheet. Files are
                not uploaded; review every extracted row before saving.
              </p>
              <label className="mt-3 grid max-w-sm gap-1.5 text-sm font-medium">
                Default student for single-student files (optional)
                <select
                  value={studentId}
                  onChange={(event) => setStudentId(event.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  disabled={importing || busy}
                >
                  <option value="">Match from file or choose in review</option>
                  {state.students.map((student) => (
                    <option key={student.dbId} value={student.dbId}>
                      {student.name} · {student.cls}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <input
              ref={uploadInput}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.pdf,.csv,.xlsx,image/png,image/jpeg,image/webp,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple
              className="sr-only"
              onChange={(event) => void importFiles(event)}
              disabled={importing || busy}
            />
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={importing || busy || !state.school}
              onClick={() => uploadInput.current?.click()}
            >
              {importing ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <FileUp className="size-4" />
              )}
              {importing ? "Reading files…" : "Choose result files"}
            </Button>
          </div>
          {importing ? (
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {importProgress || "Reading files on this device…"}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Up to 8 files at once; 20 MB each, 50 MB total. Photos: PNG, JPG, WEBP. Scanned PDFs: up
            to 10 pages. Spreadsheets need Student, Subject, and Score/Marks columns.
          </p>
          {importWarning ? (
            <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
              {importWarning}
            </p>
          ) : null}
          {importRows.length ? (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[840px] text-sm">
                  <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">Student</th>
                      <th className="p-3 font-medium">Subject</th>
                      <th className="p-3 font-medium">Score / 100</th>
                      <th className="p-3 font-medium">Grade</th>
                      <th className="p-3 font-medium">Term</th>
                      <th className="p-3 font-medium">
                        <span className="sr-only">Remove row</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {importRows.map((row) => (
                      <tr key={row.id}>
                        <td className="p-2">
                          <select
                            aria-label={`Student for ${row.subject}`}
                            value={row.studentId}
                            onChange={(event) => {
                              const student = state.students.find(
                                (candidate) => candidate.dbId === event.target.value,
                              );
                              updateImportRow(row.id, {
                                studentId: student?.dbId ?? "",
                                studentLabel: student?.name ?? "",
                              });
                            }}
                            className={`h-10 w-full rounded-md border bg-background px-2 ${
                              row.studentId ? "border-input" : "border-amber-500"
                            }`}
                          >
                            <option value="">
                              {row.studentLabel
                                ? `Choose match for ${row.studentLabel}`
                                : "Choose a student"}
                            </option>
                            {state.students.map((student) => (
                              <option key={student.dbId} value={student.dbId}>
                                {student.name} · {student.cls}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <Input
                            aria-label={`Subject for ${row.studentLabel || "student"}`}
                            value={row.subject}
                            onChange={(event) =>
                              updateImportRow(row.id, { subject: event.target.value })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            aria-label={`Score for ${row.studentLabel || "student"} in ${row.subject}`}
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={row.score ?? ""}
                            onChange={(event) =>
                              updateImportRow(row.id, {
                                score:
                                  event.target.value === "" ? null : Number(event.target.value),
                              })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            aria-label={`Grade for ${row.studentLabel || "student"} in ${row.subject}`}
                            value={row.grade}
                            onChange={(event) =>
                              updateImportRow(row.id, { grade: event.target.value })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            aria-label={`Term for ${row.studentLabel || "student"} in ${row.subject}`}
                            value={row.term}
                            onChange={(event) =>
                              updateImportRow(row.id, { term: event.target.value })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${row.subject} result`}
                            onClick={() =>
                              setImportRows((rows) => rows.filter((item) => item.id !== row.id))
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  disabled={busy || importing}
                  onClick={() => void saveImportedResults()}
                >
                  {busy ? "Saving results…" : `Review and save ${importRows.length} rows`}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setImportRows([]);
                    setImportWarning("");
                  }}
                >
                  Discard import
                </Button>
              </div>
            </div>
          ) : null}
          {notice ? (
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {notice}
            </p>
          ) : null}
        </section>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,.9fr)]">
          <form onSubmit={saveResult} className="hairline-card space-y-4 p-5 sm:p-6">
            <h2 className="font-semibold">Record a result manually</h2>
            <label className="grid gap-2 text-sm font-medium">
              Student
              <select
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Choose a student</option>
                {state.students.map((student) => (
                  <option key={student.dbId} value={student.dbId}>
                    {student.name} · {student.cls}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="result-term">Term</Label>
                <Input
                  id="result-term"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="result-subject">Subject</Label>
                <Input
                  id="result-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="result-score">Score (0-100)</Label>
                <Input
                  id="result-score"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={score}
                  onChange={(event) => setScore(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="result-grade">Grade</Label>
                <Input
                  id="result-grade"
                  value={grade}
                  onChange={(event) => setGrade(event.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <Button type="submit" disabled={busy || !state.school}>
              {busy ? "Saving…" : "Save result"}
            </Button>
          </form>
          <section className="hairline-card p-5 sm:p-6">
            <h2 className="font-semibold">Results for selected student</h2>
            {!studentId ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Choose a student to review existing entries.
              </p>
            ) : results.length ? (
              <div className="mt-4 divide-y divide-border">
                {results.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.subject}</p>
                      <p className="text-xs text-muted-foreground">{item.term}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold">
                      {item.grade ?? (item.score == null ? "Pending" : `${item.score}%`)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                No results have been entered for this term.
              </p>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
