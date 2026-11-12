import { formatNaira } from "@/lib/format";

export type PaymentReceiptDetails = {
  student: string;
  amount: number;
  method: string;
  status: string;
  date: string;
  reference: string;
};

function makeReceiptPdf(lines: string[]) {
  const clean = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const commands = [
    "BT",
    "/F1 18 Tf",
    "50 760 Td",
    `(${clean(lines[0] ?? "SchoolPulseOS payment receipt")}) Tj`,
    "/F1 11 Tf",
    ...lines.slice(1).map((line) => `0 -24 Td (${clean(line)}) Tj`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

export function downloadPaymentReceipt(payment: PaymentReceiptDetails) {
  const receipt = makeReceiptPdf([
    "SchoolPulseOS payment receipt",
    `Student: ${payment.student}`,
    `Amount: ${formatNaira(payment.amount)}`,
    `Method: ${payment.method}`,
    `Status: ${payment.status}`,
    `Date: ${payment.date}`,
    `Reference: ${payment.reference}`,
  ]);
  const url = URL.createObjectURL(receipt);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `receipt-${payment.reference}.pdf`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
