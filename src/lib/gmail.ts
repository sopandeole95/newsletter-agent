import { getGmailClient } from "./google";

export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  htmlBody: string;
  textBody: string;
}

function getSenders(): string[] {
  return (process.env.NEWSLETTER_SENDERS || "").split(",").map((s) => s.trim()).filter(Boolean);
}

export async function fetchNewsletterEmails(since?: Date): Promise<EmailMessage[]> {
  const gmail = getGmailClient();
  const senders = getSenders();

  if (senders.length === 0) return [];

  // Build query: from any of the senders, received today or yesterday
  // Gmail's after: uses day granularity, so go back 1 extra day to avoid missing emails near midnight
  const fromQuery = senders.map((s) => `from:${s}`).join(" OR ");
  const afterDate = since || new Date(new Date().setHours(0, 0, 0, 0));
  const safeDate = new Date(afterDate.getTime() - 24 * 60 * 60 * 1000); // 1 day earlier
  const yyyy = safeDate.getFullYear();
  const mm = String(safeDate.getMonth() + 1).padStart(2, "0");
  const dd = String(safeDate.getDate()).padStart(2, "0");
  const query = `(${fromQuery}) after:${yyyy}/${mm}/${dd}`;

  const res = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 50,
  });

  const messageIds = res.data.messages || [];
  const emails: EmailMessage[] = [];

  for (const msg of messageIds) {
    if (!msg.id) continue;

    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const headers = full.data.payload?.headers || [];
    const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
    const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
    const date = headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";

    const htmlBody = extractBody(full.data.payload, "text/html");
    const textBody = extractBody(full.data.payload, "text/plain");

    emails.push({
      id: msg.id,
      from,
      subject,
      date,
      htmlBody,
      textBody,
    });
  }

  return emails;
}

function extractBody(
  payload: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  mimeType: string
): string {
  if (!payload) return "";

  // Direct body
  if (payload.mimeType === mimeType && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  // Multipart - recurse through parts
  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractBody(part, mimeType);
      if (result) return result;
    }
  }

  return "";
}
