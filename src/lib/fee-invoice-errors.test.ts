import assert from "node:assert/strict";
import test from "node:test";
import { feeInvoiceErrorMessage } from "./fee-invoice-errors.ts";

test("provides a clear message when the fee invoice schema is unavailable", () => {
  assert.equal(
    feeInvoiceErrorMessage(
      {
        code: "PGRST205",
        message: "Could not find the table 'public.fee_invoices' in the schema cache",
      },
      "Fallback",
    ),
    "Fee invoicing is not available yet. Please contact your school administrator.",
  );
});

test("uses the supplied fallback for unrelated database errors", () => {
  assert.equal(
    feeInvoiceErrorMessage({ code: "42501", message: "permission denied" }, "Fallback"),
    "Fallback",
  );
});
