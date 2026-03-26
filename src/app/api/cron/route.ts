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

  // Remove non-content elements
  $("script, style, head, nav, footer, img, svg, picture, video, audio, iframe").remove();
  $(".unsubscribe, .footer, .email-footer, .mso, .preheader").remove();
  $("[style*='display:none'], [style*='display: none']").remove();

  // Convert meaningful links: keep link text with URL in parentheses if the URL looks useful
  $("a").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href") || "";
    const text = $a.text().trim();

    // Skip tracking links, unsubscribe links, and image-only links
    const isTrackingLink = /click\.|track\.|unsubscribe|manage.*preferences|list-manage|mailchimp|sendgrid|beehiiv.*\/p\//i.test(href);
    const isImageLink = !text || text.length < 2;

    if (isTrackingLink || isImageLink) {
      $a.replaceWith(text);
    } else if (href && !href.startsWith("mailto:") && text !== href) {
      // Keep meaningful links like "Google (www.google.com)"
      $a.replaceWith(`${text} (${href})`);
    } else {
      $a.replaceWith(text);
    }
  });

  // Get text and clean up
  let text = $("body").text();

  // Remove common email artifacts
  text = text
    .replace(/\u200c/g, "") // zero-width non-joiner
    .replace(/\u00a0/g, " ") // non-breaking space
    .replace(/[\u200b\u200d\ufeff]/g, "") // other zero-width chars
    .replace(/\[image[^\]]*\]/gi, "") // [image] placeholders
    .replace(/\s+/g, " ")
    .trim();

  return text;
}
