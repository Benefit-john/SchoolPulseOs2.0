import { createFileRoute } from "@tanstack/react-router";
import {
  Download,
  FileBarChart,
  type LucideIcon,
  Printer,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolStore } from "@/lib/school-store";
import { requireRoles } from "@/lib/route-guards";

export const Route = createFileRoute("/reports")({
  ssr: false,
  beforeLoad: () => requireRoles(["admin", "principal", "teacher"]),
  head: () => ({
    meta: [
      { title: "Reports | SchoolPulseOS" },
      { name: "description", content: "Attendance, academic, finance, and safeguarding reports." },
    ],
  }),
  component: ReportsPage,
});
const db = () =>
  supabase as unknown as {
    from: (table: string) => ReturnType<typeof supabase.from>;
  };
const reports: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Daily attendance register",
    description: "Present, absent, late and checked-out by class for any date.",
    icon: Users,
  },
  {
    title: "Termly attendance summary",
    description: "Per-student attendance rate and late-arrival pattern.",
    icon: FileBarChart,
  },
  {
    title: "Fee collection statement",
    description: "Invoiced, collected and outstanding by class and term.",
    icon: Wallet,
  },
  {
    title: "Gate and pickup audit trail",
    description: "Every scan, pickup release and override, with the staff member responsible.",
    icon: ShieldCheck,
  },
];

type ReportResult = { subject: string; score: number | null; grade: string | null; term: string };

function ReportsPage() {
  const { state } = useSchoolStore();
  const [studentId, setStudentId] = useState("");
  const [term, setTerm] = useState("Term 1");
  const [results, setResults] = useState<ReportResult[]>([]);
  const [notice, setNotice] = useState("");
  const selected = state.students.find((student) => student.dbId === studentId);
  const escapeHtml = (value: unknown) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
    );
  const exportReport = (title: string, format: "csv" | "pdf") => {
    const headers = ["Student", "Admission number", "Class", "Status", "Balance"];
    const rows =
      title === "Fee collection statement"
        ? state.payments.map((payment) => [payment.student, "", "", payment.status, payment.amount])
        : title === "Gate and pickup audit trail"
          ? state.activity.map((event) => [event.text, "", "", event.tone, event.time])
          : state.students.map((student) => [
              student.name,
              student.id,
              student.cls,
              student.status,
              student.balance,
            ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const filename = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (format === "csv") {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${filename}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(`${title} CSV downloaded.`);
      return;
    }

    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) {
      setNotice("Allow pop-ups to print or save this report as a PDF.");
      return;
    }
    popup.document.write(
      `<html><head><title>${escapeHtml(title)}</title><style>body{font:14px sans-serif;padding:32px;color:#17212b}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #dce3e5}th{background:#f2f6f6}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(state.school?.name ?? "School workspace")}</p><table><thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="5">No records available.</td></tr>`}</tbody></table></body></html>`,
    );
    popup.document.close();
    popup.focus();
    popup.print();
    setNotice(`${title} is ready to print or save as PDF.`);
  };
  useEffect(() => {
    let active = true;
    const schoolId = state.school?.id;
    if (!schoolId || !studentId) {
      setResults([]);
      return () => {
        active = false;
      };
    }
    void (async () => {
      const { data, error } = await db()
        .from("student_results")
        .select("subject,score,grade,term")
        .eq("school_id", schoolId)
        .eq("student_id", studentId)
        .eq("term", term)
        .order("subject");
      if (!active) return;
      if (error) {
        setNotice("Could not load student results. Check your connection and try again.");
        setResults([]);
        return;
      }
      setResults(data ?? []);
    })();
    return () => {
      active = false;
    };
  }, [studentId, state.school?.id, term]);
  const printReport = async () => {
    if (!state.school || !selected) {
      setNotice("Select a student first.");
      return;
    }
    const { data: user } = await supabase.auth.getUser();
    const { error } = await db()
      .from("term_report_cards")
      .upsert(
        {
          school_id: state.school.id,
          student_id: selected.dbId,
          term,
          generated_by: user.user?.id,
          snapshot: { student: selected.name, className: selected.cls, results },
        },
        { onConflict: "school_id,student_id,term" },
      );
    if (error) {
      setNotice("Could not save this report card. Check your connection and try again.");
      return;
    }
    const popup = window.open("", "_blank", "width=760,height=900");
    if (!popup) {
      setNotice("Allow pop-ups to print the report card.");
      return;
    }
    popup.document.write(
      `<html><head><title>${escapeHtml(selected.name)} | ${escapeHtml(term)} report card</title><style>body{font-family:Arial,sans-serif;padding:42px;color:#17212b}h1{margin:0 0 8px}p{color:#5b6870}table{width:100%;border-collapse:collapse;margin-top:28px}th,td{border-bottom:1px solid #dce3e5;padding:12px;text-align:left}th{background:#f2f6f6}</style></head><body><h1>${escapeHtml(selected.name)}</h1><p>${escapeHtml(selected.cls)} · ${escapeHtml(term)} · ${escapeHtml(state.school.name)}</p><table><thead><tr><th>Subject</th><th>Score</th><th>Grade</th></tr></thead><tbody>${results.map((result) => `<tr><td>${escapeHtml(result.subject)}</td><td>${escapeHtml(result.score ?? "Not recorded")}</td><td>${escapeHtml(result.grade ?? "Pending")}</td></tr>`).join("") || `<tr><td colspan="3">No published results for this term.</td></tr>`}</tbody></table><p>Generated from SchoolPulseOS academic records.</p></body></html>`,
    );
    popup.document.close();
    popup.focus();
    popup.print();
    setNotice("Report card prepared for printing or PDF export.");
  };
  return (
    <AppShell
      title="Reports"
      subtitle="Export-ready records for leadership, families, and auditors"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {reports.map(({ title, description, icon: Icon }) => (
          <div key={title} className="hairline-card rise-in flex flex-col gap-3 p-5">
            <span className="grid size-10 place-items-center rounded-lg bg-primary/8 text-primary">
              <Icon className="size-5" strokeWidth={1.75} />
            </span>
            <div className="flex-1">
              <h2 className="display-title text-base">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => exportReport(title, "csv")}
              >
                <Download className="size-4" /> CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => exportReport(title, "pdf")}
              >
                <Download className="size-4" /> PDF
              </Button>
            </div>
          </div>
        ))}
      </div>
      {notice && !selected ? (
        <p className="text-sm text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}
      <section className="hairline-card mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="display-title text-base">Generate term report card</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a student and term to create a formatted document from published results.
            </p>
          </div>
          <Button onClick={() => void printReport()}>
            <Printer className="mr-2 size-4" /> Print / Save PDF
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Student
            <select
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select a student</option>
              {state.students.map((student) => (
                <option key={student.dbId} value={student.dbId}>
                  {student.name} · {student.cls}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Term
            <Input value={term} onChange={(event) => setTerm(event.target.value)} />
          </label>
        </div>
        {selected ? (
          <div className="mt-5 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((result) => (
                  <tr key={result.subject}>
                    <td className="px-4 py-3">{result.subject}</td>
                    <td className="px-4 py-3">{result.score ?? "Not recorded"}</td>
                    <td className="px-4 py-3">{result.grade ?? "Pending"}</td>
                  </tr>
                ))}
                {!results.length ? (
                  <tr>
                    <td className="px-4 py-4 text-muted-foreground" colSpan={3}>
                      No published results for this term.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
        {notice ? (
          <p className="mt-3 text-sm text-muted-foreground" role="status">
            {notice}
          </p>
        ) : null}
      </section>
    </AppShell>
  );
}
