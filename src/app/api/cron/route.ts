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

      // Extract plain text from HTML for PDF and summarization
      const textContent = cleanText(stripHtml(email.htmlBody) || email.textBody);

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
  $("script, style, head, nav, footer, img, svg, picture, video, audio, iframe, figure, figcaption").remove();
  $(".unsubscribe, .footer, .email-footer, .mso, .preheader").remove();
  $("[style*='display:none'], [style*='display: none']").remove();

  // Remove elements with heavy letter-spacing (spaced-out headers)
  $("[style*='letter-spacing']").each((_, el) => {
    const style = $(el).attr("style") || "";
    const match = style.match(/letter-spacing:\s*([\d.]+)/);
    if (match && parseFloat(match[1]) > 1) {
      // Keep the text but collapse the spacing
      const text = $(el).text().replace(/\s+/g, "");
      $(el).replaceWith(text);
    }
  });

  // Replace links: only keep short, meaningful URLs
  $("a").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href") || "";
    const text = $a.text().trim();

    // Skip: tracking links, image links, unsubscribe, social footer, very long URLs
    const isJunk = /click\.|track\.|unsubscribe|manage.*preferences|list-manage|mailchimp|sendgrid|beehiiv\.com\/p\/|SENDX|jwt_token|redirect_to=|utm_|cdn-cgi|\/asset\/file\//i.test(href);
    const isSocialFooter = /^(follow us|share|tweet|forward|instagram|advertise|sign up)$/i.test(text);
    const isImageLink = !text || text.length < 2;
    const isTooLong = href.length > 150;

    if (isJunk || isSocialFooter || isImageLink || isTooLong) {
      $a.replaceWith(text);
    } else if (href && !href.startsWith("mailto:") && text !== href && href.length <= 80) {
      $a.replaceWith(`${text} (${href})`);
    } else {
      $a.replaceWith(text);
    }
  });

  // Get text
  let text = $("body").text();
  return text;
}

function cleanText(text: string): string {
  if (!text) return "";

  return text
    // Remove zero-width and special unicode chars
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\u00a0/g, " ")
    // Remove SendX tracking tokens
    .replace(/__SENDX_TRACK_START__[^_]*__SENDX_TRACK_END__/g, "")
    .replace(/__SENDX_\w+__/g, "")
    // Remove image-related lines
    .replace(/^.*View image:?\s*\(https?:\/\/[^\)]+\).*$/gm, "")
    .replace(/^.*Follow image link:?\s*\(https?:\/\/[^\)]+\).*$/gm, "")
    .replace(/^.*Image showing[^.]*\(https?:\/\/[^\)]+\).*$/gm, "")
    .replace(/^\s*Caption:\s*$/gm, "")
    // Remove [image] placeholders
    .replace(/\[image[^\]]*\]/gi, "")
    // Remove bare long URLs (over 80 chars) that aren't part of readable text
    .replace(/\(https?:\/\/[^\)]{80,}\)/g, "")
    // Remove markdown formatting artifacts
    .replace(/\*{2,}/g, "") // ** bold markers or decorative *****
    .replace(/(?<!\w)_{1,2}([^_]+)_{1,2}(?!\w)/g, "$1") // _italic_ markers
    .replace(/\^+/g, "") // ^ markers
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\)]+\)/g, "$1") // [text](url) markdown links
    // Remove decorative lines
    .replace(/^[\-=*_]{5,}$/gm, "")
    // Remove broken emoji/unicode that jsPDF can't render
    .replace(/[\u00d8]=[^\s]*/g, "") // Ø=Ý4, Ø=Ü> patterns
    .replace(/[^\x20-\x7E\n\r\t.,;:!?'"()\-–—\u2018\u2019\u201c\u201d\u2026\u00e9\u00e8\u00f1\u00fc\u00e4\u00f6]/g, " ")
    // Remove social footer sections
    .replace(/Follow us on (?:X|Twitter)\s*\([^\)]+\)\s*\|?/gi, "")
    .replace(/\|\s*Instagram\s*\([^\)]+\)\s*\|?/gi, "")
    .replace(/\|\s*Advertise\s*\([^\)]+\)/gi, "")
    // Clean up whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+$/gm, "")
    .trim();
}
