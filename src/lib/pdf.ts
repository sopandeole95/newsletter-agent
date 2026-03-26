import { jsPDF } from "jspdf";

interface PdfOptions {
  title: string;
  from: string;
  date: string;
  summary: string;
  bodyText: string;
}

export function generatePdf(options: PdfOptions): Buffer {
  const { title, from, date, summary, bodyText } = options;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const maxWidth = pageWidth - margin * 2;
  let y = 20;

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(title, maxWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 8 + 5;

  // Metadata
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`From: ${from}`, margin, y);
  y += 6;
  doc.text(`Date: ${date}`, margin, y);
  y += 10;

  // Summary section
  doc.setTextColor(0);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Summary", margin, y);
  y += 8;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(50);
  const summaryLines = doc.splitTextToSize(summary, maxWidth);
  for (const line of summaryLines) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, margin, y);
    y += 6;
  }
  y += 8;

  // Divider
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // Full content
  doc.setTextColor(0);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Full Content", margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30);

  // Clean up body text and wrap
  const cleanBody = bodyText
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .substring(0, 15000); // Limit to avoid huge PDFs

  const bodyLines = doc.splitTextToSize(cleanBody, maxWidth);
  for (const line of bodyLines) {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, margin, y);
    y += 5;
  }

  return Buffer.from(doc.output("arraybuffer"));
}
