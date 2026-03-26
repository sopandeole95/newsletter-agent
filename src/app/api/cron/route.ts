import { NextRequest, NextResponse } from "next/server";
import { fetchNewsletterEmails } from "@/lib/gmail";
import { summarize } from "@/lib/summarize";
import { generatePdf } from "@/lib/pdf";
import { uploadToDrive } from "@/lib/drive";
import { isProcessed, markProcessed, saveNewsletterRecord } from "@/lib/kv";
import * as cheerio from "cheerio";

export const maxDuration = 60; // Allow up to 60s for serverless function

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch today's newsletters
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const emails = await fetchNewsletterEmails(today);

    const results = [];
    let skipped = 0;

    for (const email of emails) {
      // Skip already processed emails (dedup between 8 AM and 8 PM runs)
      if (await isProcessed(email.id)) {
        skipped++;
        continue;
      }

      // Extract plain text from HTML for summarization
      const textContent = email.textBody || stripHtml(email.htmlBody);

      // Generate summary
      const summary = summarize(email.htmlBody || email.textBody);

      // Generate PDF
      const pdfBuffer = generatePdf({
        title: email.subject,
        from: email.from,
        date: email.date,
        summary,
        bodyText: textContent,
      });

      // Upload to Google Drive
      const dateStr = new Date().toISOString().split("T")[0];
      const folderName = `${process.env.DRIVE_FOLDER_PREFIX || "newsletters"}_${dateStr}`;
      const safeSubject = email.subject.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 50);
      const fileName = `${safeSubject}.pdf`;

      const driveLink = await uploadToDrive(fileName, pdfBuffer, folderName);

      // Mark as processed and save record
      await markProcessed(email.id);
      await saveNewsletterRecord({
        id: email.id,
        from: email.from,
        subject: email.subject,
        date: email.date,
        summary,
        driveLink,
        processedAt: new Date().toISOString(),
      });

      results.push({ subject: email.subject, driveLink });
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      skipped,
      total: emails.length,
      results,
    });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json(
      { error: "Cron job failed", details: String(error) },
      { status: 500 }
    );
  }
}

function stripHtml(html: string): string {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("script, style, head").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}
