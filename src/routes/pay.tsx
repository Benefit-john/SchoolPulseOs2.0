import { createFileRoute } from "@tanstack/react-router";
import { requireRoles } from "@/lib/route-guards";
import { Banknote, CheckCircle2, Download, Receipt, Wallet } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { KpiCard } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNaira } from "@/lib/format";
import { downloadPaymentReceipt } from "@/lib/payment-receipt";
import { useSchoolStore } from "@/lib/school-store";
import { useState } from "react";
export const Route = createFileRoute("/pay")({
  ssr: false,
  beforeLoad: () => requireRoles(["admin"]),
  component: PayPage,
});
function PayPage() {
  const { state } = useSchoolStore();
  const [filter, setFilter] = useState<"All" | "Paid" | "Pending" | "Failed" | "Refunded">("All");
  const paidPayments = state.payments.filter((payment) => payment.status === "Paid");
  const visiblePayments = state.payments.filter(
    (payment) => filter === "All" || payment.status === filter,
  );
  const totalCollected = paidPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const downloadReceipt = (payment: (typeof state.payments)[number]) => {
    downloadPaymentReceipt({
      student: payment.student,
      amount: payment.amount,
      method: payment.method,
      status: payment.status,
      date: payment.date,
      reference: payment.paystackReference ?? payment.id,
    });
  };
  return (
    <AppShell title="Payments" subtitle="School payment records and receipts">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Collected today"
          value={formatNaira(state.revenueToday)}
          icon={Wallet}
          hero
        />
        <KpiCard label="Total collected" value={formatNaira(totalCollected)} icon={Banknote} />
        <KpiCard label="Paid records" value={String(paidPayments.length)} icon={CheckCircle2} />
        <KpiCard
          label="Needs review"
          value={String(
            state.payments.filter(
              (payment) => payment.status === "Pending" || payment.status === "Failed",
            ).length,
          )}
          icon={Receipt}
        />
      </div>
      <section className="hairline-card mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="display-title text-base">Payment history and receipts</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Transactions are scoped to this school workspace.
            </p>
          </div>
          <Badge variant="outline">Paystack</Badge>
        </div>
        <div className="border-b border-border p-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter payments by status">
            {(["All", "Paid", "Pending", "Failed", "Refunded"] as const).map((status) => (
              <Button
                key={status}
                type="button"
                size="sm"
                className="min-h-11"
                variant={filter === status ? "secondary" : "outline"}
                aria-pressed={filter === status}
                onClick={() => setFilter(status)}
              >
                {status}
              </Button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-border">
          {visiblePayments.map((payment) => (
            <div key={payment.id} className="flex flex-wrap items-center gap-3 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Receipt className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{payment.student}</p>
                <p className="break-all text-xs text-muted-foreground">
                  {payment.id} · {payment.method} · {payment.date}
                </p>
                {payment.paystackReference ? (
                  <p className="mt-1 break-all text-[11px] text-muted-foreground">
                    Reference: {payment.paystackReference}
                  </p>
                ) : null}
              </div>
              <div className="ml-auto flex items-center gap-3 text-right">
                <div>
                  <p className="numeric font-semibold">{formatNaira(payment.amount)}</p>
                  <Badge
                    variant="outline"
                    className={
                      payment.status === "Paid"
                        ? "border-success/40 text-success"
                        : payment.status === "Failed" || payment.status === "Refunded"
                          ? "border-danger/40 text-danger"
                          : "border-warning/40 text-warning"
                    }
                  >
                    {payment.status}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Download receipt for ${payment.student}`}
                  disabled={payment.status !== "Paid" || !payment.paystackReference}
                  onClick={() => downloadReceipt(payment)}
                >
                  <Download className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          {visiblePayments.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {state.payments.length === 0
                ? "No payments have been recorded yet."
                : `No ${filter.toLowerCase()} payments.`}
            </p>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
