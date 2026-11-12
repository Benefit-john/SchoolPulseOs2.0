type FeeInvoiceDatabaseError = {
  code?: string;
  message?: string;
};

export function feeInvoiceErrorMessage(error: FeeInvoiceDatabaseError, fallback: string) {
  const message = error.message ?? "";
  const schemaUnavailable =
    error.code === "PGRST205" ||
    error.code === "PGRST200" ||
    (/schema cache|does not exist/i.test(message) &&
      /fee_invoices|fee_invoice_items|fee_installments/i.test(message));

  return schemaUnavailable
    ? "Fee invoicing is not available yet. Please contact your school administrator."
    : fallback;
}
