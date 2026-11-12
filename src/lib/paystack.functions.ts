import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type DbError = { message: string };
type DbRow = Record<string, unknown>;
type DbQuery = {
  select: (columns: string) => DbQuery;
  insert: (values: DbRow) => DbQuery;
  update: (values: DbRow) => DbQuery;
  eq: (column: string, value: unknown) => DbQuery;
  maybeSingle: () => Promise<{ data: DbRow | null; error: DbError | null }>;
};
type AdminDatabase = {
  from: (table: string) => DbQuery;
  rpc: (name: string, args: DbRow) => Promise<{ data: unknown; error: DbError | null }>;
};

const db = () => supabaseAdmin as unknown as AdminDatabase;
const channelByMethod = {
  Card: "card",
  "Bank transfer": "bank_transfer",
  "Connect to bank": "bank",
  USSD: "ussd",
  "Mobile money": "mobile_money",
  "QR code": "qr",
} as const;
type PaymentMethod = keyof typeof channelByMethod;

function enabledPaymentMethods(): PaymentMethod[] {
  const configured = process.env["PAYSTACK_ENABLED_CHANNELS"];
  const channels = new Set(
    (configured ?? "card,bank_transfer,bank,ussd,mobile_money,qr")
      .split(",")
      .map((channel) => channel.trim().toLowerCase())
      .filter(Boolean),
  );
  return (Object.keys(channelByMethod) as PaymentMethod[]).filter((method) =>
    channels.has(channelByMethod[method]),
  );
}

const input = z.object({
  invoiceId: z.string().uuid(),
  studentId: z.string().uuid(),
  installmentCount: z.number().int().min(1).max(3),
  installmentSequence: z.number().int().min(1).max(3),
  method: z.enum(["Card", "Bank transfer", "Connect to bank", "USSD", "Mobile money", "QR code"]),
});

export const initializePaystackTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => input.parse(value))
  .handler(async ({ data, context }) => {
    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret)
      return { ok: false as const, message: "Paystack is not configured for this deployment yet." };
    if (!enabledPaymentMethods().includes(data.method))
      return {
        ok: false as const,
        message: "This payment method is not enabled for this Paystack account.",
      };
    const payerEmail = z.string().email().safeParse(context.claims["email"]);
    if (!payerEmail.success)
      return {
        ok: false as const,
        message: "Add a valid email address to your account before making a payment.",
      };
    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const assignedRoles = (roles ?? []).map((row) => row.role as string);
    const isParent = assignedRoles.includes("parent");
    if (rolesError || !isParent)
      return {
        ok: false as const,
        message: "This account cannot initiate school payments.",
      };
    const admin = db();
    const { data: guardianLink } = await admin
      .from("guardian_links")
      .select("student_id")
      .eq("parent_id", context.userId)
      .eq("student_id", data.studentId)
      .maybeSingle();
    if (!guardianLink)
      return {
        ok: false as const,
        message: "You can only pay fees for a child linked to your account.",
      };
    const { data: invoice } = await admin
      .from("fee_invoices")
      .select("id,school_id,student_id,amount,currency,status,allowed_installment_counts")
      .eq("id", data.invoiceId)
      .eq("student_id", data.studentId)
      .maybeSingle();
    if (!invoice || invoice["status"] === "paid" || invoice["status"] === "cancelled")
      return { ok: false as const, message: "This fee invoice is not payable." };
    if (data.installmentSequence > data.installmentCount)
      return {
        ok: false as const,
        message: "Choose an installment number within the selected payment plan.",
      };
    const plan = await admin.rpc("create_fee_installment_plan", {
      _invoice_id: data.invoiceId,
      _parent_id: context.userId,
      _installment_count: data.installmentCount,
    });
    if (plan.error || plan.data !== true)
      return {
        ok: false as const,
        message: "The payment plan is unavailable or has already been started.",
      };
    const { data: installment } = await admin
      .from("fee_installments")
      .select("id,amount,paid_amount,status")
      .eq("invoice_id", data.invoiceId)
      .eq("sequence", data.installmentSequence)
      .maybeSingle();
    if (!installment || installment["status"] === "paid")
      return { ok: false as const, message: "This installment is not payable." };
    const reference = `SP-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const payment = await admin.rpc("create_paystack_payment", {
      _school_id: invoice["school_id"],
      _student_id: data.studentId,
      _invoice_id: data.invoiceId,
      _installment_id: installment["id"],
      _method: data.method,
      _payer_user_id: context.userId,
      _reference: reference,
    });
    const reservedPayment = payment.data as { payment_id?: string; amount?: number } | null;
    if (payment.error || !reservedPayment?.payment_id || typeof reservedPayment.amount !== "number")
      return {
        ok: false as const,
        message: "This installment cannot be charged. Refresh and try again.",
      };
    const amountMinor = Math.round(reservedPayment.amount * 100);
    if (amountMinor < 10000) {
      await admin
        .from("payments")
        .update({ status: "failed" })
        .eq("paystack_reference", reference)
        .eq("status", "pending");
      return {
        ok: false as const,
        message: "The remaining amount is below Paystack’s ₦100 minimum.",
      };
    }

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountMinor,
        currency: "NGN",
        email: payerEmail.data,
        reference,
        callback_url: `${new URL(getRequest().url).origin}/parent/fees`,
        channels: [channelByMethod[data.method]],
        metadata: {
          invoice_id: data.invoiceId,
          installment_id: installment["id"],
          student_id: data.studentId,
        },
      }),
    });
    const payload = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string };
    };
    if (!response.ok || !payload.status || !payload.data?.authorization_url) {
      await admin
        .from("payments")
        .update({ status: "failed" })
        .eq("paystack_reference", reference)
        .eq("status", "pending");
      return {
        ok: false as const,
        message: payload.message ?? "Paystack could not initialize this payment.",
      };
    }
    return {
      ok: true as const,
      authorizationUrl: payload.data.authorization_url,
      reference,
      amount: reservedPayment.amount,
    };
  });

export const getParentPaystackPaymentMethods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!(roles ?? []).some((row) => row.role === "parent"))
      return { ok: false as const, methods: [] as PaymentMethod[] };
    return {
      ok: true as const,
      methods: enabledPaymentMethods(),
      paymentLinksEnabled: Boolean(process.env["PAYSTACK_SECRET_KEY"]),
    };
  });

const statusInput = z.object({ reference: z.string().trim().min(6).max(100) });

export const getParentPaystackPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => statusInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!(roles ?? []).some((row) => row.role === "parent"))
      return { ok: false as const, message: "This account cannot view parent payments." };

    const admin = db();
    const { data: payment } = await admin
      .from("payments")
      .select("id,student_id,status,payer_user_id")
      .eq("paystack_reference", data.reference)
      .maybeSingle();
    if (!payment || payment["payer_user_id"] !== context.userId)
      return { ok: false as const, message: "Payment reference was not found." };

    return {
      ok: true as const,
      status: String(payment["status"]),
      message:
        payment["status"] === "paid"
          ? "Payment confirmed. Thank you."
          : payment["status"] === "failed"
            ? "Paystack did not complete this payment. You can retry the invoice."
            : "Payment is processing. We’ll update this page when Paystack confirms it.",
    };
  });
