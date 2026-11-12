import { createHmac, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type PaystackEvent = {
  event?: string;
  data?: {
    reference?: string;
    status?: string;
    amount?: number;
    currency?: string;
    paid_at?: string | null;
  };
};

type SettlementResult = {
  ok?: boolean;
  already_settled?: boolean;
  payment_id?: string;
  message?: string;
};

type OutboxRow = { id: string; recipient: string; subject: string; body: string };
type DbQuery = {
  select: (columns: string) => DbQuery;
  update: (values: Record<string, unknown>) => DbQuery;
  eq: (column: string, value: unknown) => DbQuery;
  maybeSingle: () => Promise<{ data: OutboxRow | null; error: { message: string } | null }>;
};
type AdminDatabase = {
  from: (table: string) => DbQuery;
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const db = () => supabaseAdmin as unknown as AdminDatabase;

export const Route = createFileRoute("/api/paystack-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PAYSTACK_SECRET_KEY"];
        if (!secret) return new Response("Webhook not configured", { status: 503 });

        const rawBody = await request.text();
        const signature = request.headers.get("x-paystack-signature") ?? "";
        if (!/^[a-f\d]{128}$/i.test(signature)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const expected = createHmac("sha512", secret).update(rawBody).digest();
        const received = Buffer.from(signature, "hex");
        if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: PaystackEvent;
        try {
          event = JSON.parse(rawBody) as PaystackEvent;
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const transaction = event.data;
        if (event.event === "charge.failed") {
          if (!transaction?.reference) return new Response("Missing reference", { status: 400 });
          const { error } = await db().rpc("mark_paystack_payment_failed", {
            _reference: transaction.reference,
          });
          return error
            ? new Response("Failure event could not be recorded", { status: 500 })
            : new Response(null, { status: 200 });
        }
        if (event.event !== "charge.success") return new Response(null, { status: 200 });
        if (
          !transaction?.reference ||
          !Number.isSafeInteger(transaction.amount) ||
          !transaction.currency
        ) {
          return new Response("Incomplete transaction event", { status: 400 });
        }

        let verifiedResponse: Response;
        try {
          verifiedResponse = await fetch(
            `https://api.paystack.co/transaction/verify/${encodeURIComponent(transaction.reference)}`,
            { headers: { Authorization: `Bearer ${secret}` } },
          );
        } catch (error) {
          console.error("Paystack transaction verification request failed", error);
          return new Response("Verification temporarily unavailable", { status: 503 });
        }
        if (!verifiedResponse.ok) {
          console.error("Paystack transaction verification returned", verifiedResponse.status);
          return new Response("Verification temporarily unavailable", { status: 503 });
        }
        const verification = (await verifiedResponse.json()) as {
          status?: boolean;
          message?: string;
          data?: {
            reference?: string;
            status?: string;
            amount?: number;
            currency?: string;
            paid_at?: string | null;
          };
        };
        if (!verification.status || !verification.data) {
          console.error("Paystack verification did not confirm transaction", verification.message);
          return new Response("Verification temporarily unavailable", { status: 503 });
        }
        if (verification.data.status !== "success") {
          return new Response("Transaction not yet confirmed", { status: 503 });
        }
        if (
          verification.data.reference !== transaction.reference ||
          verification.data.amount !== transaction.amount ||
          verification.data.currency !== transaction.currency
        ) {
          console.error("Paystack webhook and verification data did not match", {
            reference: transaction.reference,
          });
          const { error: flagError } = await db().rpc("flag_paystack_reconciliation", {
            _reference: transaction.reference,
            _reason: "Webhook event did not match Paystack transaction verification",
            _received_amount_minor: verification.data.amount ?? transaction.amount,
            _received_currency: verification.data.currency ?? transaction.currency,
          });
          if (flagError) {
            console.error("Paystack mismatch could not be recorded", flagError.message);
            return new Response("Reconciliation flag could not be stored", { status: 503 });
          }
          return new Response(null, { status: 200 });
        }

        const { data, error } = await db().rpc("apply_verified_paystack_payment", {
          _reference: transaction.reference,
          _paid_at: verification.data.paid_at ?? transaction.paid_at ?? new Date().toISOString(),
          _amount_minor: verification.data.amount,
          _currency: verification.data.currency,
        });
        if (error) {
          console.error("Paystack webhook settlement failed", error.message);
          return new Response("Settlement failed", { status: 500 });
        }

        const settlement = data as SettlementResult | null;
        if (!settlement?.ok) {
          console.error("Paystack webhook rejected", settlement?.message ?? "Unknown reference");
          return new Response("Transaction could not be settled", { status: 400 });
        }
        if (settlement.payment_id && !settlement.already_settled) {
          await deliverPaymentConfirmation(settlement.payment_id);
        }
        return new Response(null, { status: 200 });
      },
    },
  },
});

async function deliverPaymentConfirmation(paymentId: string) {
  const admin = db();
  const { data: queued, error: queueError } = await admin
    .from("notification_outbox")
    .select("id,recipient,subject,body")
    .eq("payment_id", paymentId)
    .eq("event_type", "payment-confirmed")
    .eq("status", "queued")
    .maybeSingle();
  if (queueError || !queued) return;

  const { data: claimed, error: claimError } = await admin
    .from("notification_outbox")
    .update({ status: "sending", attempts: 1 })
    .eq("id", queued.id)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) return;

  const key = process.env["SENDGRID_API_KEY"];
  const from = process.env["SENDGRID_FROM_EMAIL"];
  if (!key || !from) {
    await admin
      .from("notification_outbox")
      .update({ status: "failed", error_message: "SendGrid is not configured" })
      .eq("id", queued.id);
    return;
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: queued.recipient }] }],
        from: { email: from },
        subject: queued.subject,
        content: [{ type: "text/plain", value: queued.body }],
      }),
    });
    await admin
      .from("notification_outbox")
      .update({
        status: response.ok ? "sent" : "failed",
        error_message: response.ok ? null : `SendGrid returned HTTP ${response.status}`,
        sent_at: response.ok ? new Date().toISOString() : null,
      })
      .eq("id", queued.id);
  } catch (error) {
    await admin
      .from("notification_outbox")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Email delivery failed",
      })
      .eq("id", queued.id);
  }
}
