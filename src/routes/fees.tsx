import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Banknote, FilePlus2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolStore } from "@/lib/school-store";
import { formatNaira } from "@/lib/format";
import { requireRoles } from "@/lib/route-guards";
import { feeInvoiceErrorMessage } from "@/lib/fee-invoice-errors";

type FeeDatabase = {
  from: (table: "fee_invoices" | "fee_invoice_items") => {
    insert: (row: Record<string, unknown> | Record<string, unknown>[]) => Promise<{
      data?: { id: string } | null;
      error: { code?: string; message: string } | null;
    }>;
    delete: () => {
      eq: (
        column: string,
        value: unknown,
      ) => Promise<{
        error: { code?: string; message: string } | null;
      }>;
    };
  };
};
const db = () => supabase as unknown as FeeDatabase;

export const Route = createFileRoute("/fees")({
  ssr: false,
  beforeLoad: () => requireRoles(["admin", "bursar"]),
  component: FeesPage,
});

function FeesPage() {
  const { state } = useSchoolStore();
  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("");
  const [term, setTerm] = useState("");
  const [feeItems, setFeeItems] = useState([{ description: "Tuition", amount: "" }]);
  const [dueAt, setDueAt] = useState("");
  const [twoPartFirstDueAt, setTwoPartFirstDueAt] = useState("");
  const [threePartFirstDueAt, setThreePartFirstDueAt] = useState("");
  const [threePartSecondDueAt, setThreePartSecondDueAt] = useState("");
  const [allowTwo, setAllowTwo] = useState(true);
  const [allowThree, setAllowThree] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const issueInvoice = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedStudent = state.students.find((student) => student.dbId === studentId);
    const normalizedItems = feeItems.map((item) => ({
      description: item.description.trim(),
      amount: Number(item.amount),
    }));
    const value = normalizedItems.reduce((sum, item) => sum + item.amount, 0);
    if (
      !state.school?.id ||
      !studentId ||
      !selectedStudent ||
      !normalizedItems.length ||
      normalizedItems.some(
        (item) => !item.description || !Number.isFinite(item.amount) || item.amount <= 0,
      ) ||
      !Number.isFinite(value) ||
      !dueAt ||
      (allowTwo && (!twoPartFirstDueAt || twoPartFirstDueAt >= dueAt)) ||
      (allowThree &&
        (!threePartFirstDueAt ||
          !threePartSecondDueAt ||
          threePartFirstDueAt >= threePartSecondDueAt ||
          threePartSecondDueAt >= dueAt))
    ) {
      setNotice("Choose a student and enter a positive amount and due date.");
      return;
    }
    setBusy(true);
    setNotice("");
    const user = await supabase.auth.getUser();
    const { data: invoice, error } = (await db()
      .from("fee_invoices")
      .insert({
        school_id: state.school.id,
        student_id: studentId,
        student_name_snapshot: selectedStudent?.name ?? null,
        title: title.trim() || "School fees",
        term: term.trim() || "Current term",
        amount: value,
        currency: "NGN",
        due_at: dueAt,
        allowed_installment_counts: [...(allowTwo ? [2] : []), ...(allowThree ? [3] : [])],
        installment_due_dates_2: allowTwo ? [twoPartFirstDueAt, dueAt] : [],
        installment_due_dates_3: allowThree
          ? [threePartFirstDueAt, threePartSecondDueAt, dueAt]
          : [],
        created_by: user.data.user?.id ?? null,
      })) as {
      data: { id: string } | null;
      error: { code?: string; message: string } | null;
    };
    setBusy(false);
    if (error) {
      setNotice(
        feeInvoiceErrorMessage(error, "Unable to issue this invoice. Please try again later."),
      );
      return;
    }
    if (!invoice?.id) {
      setNotice(
        "Invoice was created but its item rows could not be confirmed. Contact support before reissuing.",
      );
      return;
    }
    const { error: itemError } = await db()
      .from("fee_invoice_items")
      .insert(normalizedItems.map((item) => ({ invoice_id: invoice.id, ...item })));
    if (itemError) {
      await db().from("fee_invoices").delete().eq("id", invoice.id);
      setNotice(
        feeInvoiceErrorMessage(
          itemError,
          "Unable to save the invoice details. Please try again later.",
        ),
      );
      return;
    }
    setTitle("");
    setFeeItems([{ description: "Tuition", amount: "" }]);
    setTwoPartFirstDueAt("");
    setThreePartFirstDueAt("");
    setThreePartSecondDueAt("");
    setNotice("Invoice issued. The parent can now view and pay it from Fees.");
  };

  return (
    <AppShell
      title="Fee invoices"
      subtitle="Issue parent-payable fees and choose eligible installment plans."
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,.7fr)]">
        <form
          onSubmit={(event) => void issueInvoice(event)}
          className="hairline-card space-y-4 p-5"
        >
          <div className="flex items-center gap-2">
            <FilePlus2 className="size-4 text-primary" />
            <h2 className="font-semibold">New invoice</h2>
          </div>
          <label className="grid gap-2 text-sm">
            Student
            <select
              aria-label="Student for invoice"
              required
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3"
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
              <Label htmlFor="fee-title">Fee name</Label>
              <Input
                id="fee-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Tuition"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fee-term">Term</Label>
              <Input
                id="fee-term"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="2026 Term 1"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <span className="text-sm font-medium">Itemized charges</span>
              {feeItems.map((item, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
                  <Input
                    aria-label={`Fee line ${index + 1} description`}
                    required
                    placeholder="PTA levy, bus fee, tuition…"
                    value={item.description}
                    onChange={(event) =>
                      setFeeItems((items) =>
                        items.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, description: event.target.value } : row,
                        ),
                      )
                    }
                  />
                  <Input
                    aria-label={`Fee line ${index + 1} amount`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="Amount (NGN)"
                    value={item.amount}
                    onChange={(event) =>
                      setFeeItems((items) =>
                        items.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, amount: event.target.value } : row,
                        ),
                      )
                    }
                  />
                  {feeItems.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setFeeItems((items) => items.filter((_, rowIndex) => rowIndex !== index))
                      }
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFeeItems((items) => [...items, { description: "", amount: "" }])
                  }
                >
                  Add fee line
                </Button>
                <span className="text-sm font-semibold">
                  Total{" "}
                  {formatNaira(feeItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0))}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fee-due-date">Due date</Label>
              <Input
                id="fee-due-date"
                type="date"
                required
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Parent installment options</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowTwo}
                onChange={(event) => setAllowTwo(event.target.checked)}
              />
              2 installments
            </label>
            {allowTwo ? (
              <div className="space-y-2 pl-6">
                <Label htmlFor="fee-two-first-due">First installment due date</Label>
                <Input
                  id="fee-two-first-due"
                  type="date"
                  required
                  value={twoPartFirstDueAt}
                  onChange={(event) => setTwoPartFirstDueAt(event.target.value)}
                />
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowThree}
                onChange={(event) => setAllowThree(event.target.checked)}
              />
              3 installments
            </label>
            {allowThree ? (
              <div className="grid gap-3 pl-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fee-three-first-due">First installment due date</Label>
                  <Input
                    id="fee-three-first-due"
                    type="date"
                    required
                    value={threePartFirstDueAt}
                    onChange={(event) => setThreePartFirstDueAt(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fee-three-second-due">Second installment due date</Label>
                  <Input
                    id="fee-three-second-due"
                    type="date"
                    required
                    value={threePartSecondDueAt}
                    onChange={(event) => setThreePartSecondDueAt(event.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </fieldset>
          <Button type="submit" disabled={busy || !state.school?.id}>
            <Banknote className="size-4" />
            {busy ? "Issuing…" : "Issue invoice"}
          </Button>
          {notice ? (
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
          ) : null}
        </form>

        <aside className="border-l border-border pl-5">
          <Badge variant="outline">Payment policy</Badge>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Parents choose full payment or one of the enabled installment counts. The school sets
            installment due dates on this invoice; missed installments show as overdue without an
            automatic late fee.
          </p>
          <p className="mt-3 text-sm font-medium">
            {formatNaira(feeItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0))}
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
