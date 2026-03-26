import { kv } from "@vercel/kv";

const PROCESSED_PREFIX = "processed:";
const NEWSLETTER_PREFIX = "newsletter:";

export async function isProcessed(emailId: string): Promise<boolean> {
  const result = await kv.get(`${PROCESSED_PREFIX}${emailId}`);
  return result !== null;
}

export async function markProcessed(emailId: string): Promise<void> {
  // Expire after 7 days to keep KV store clean
  await kv.set(`${PROCESSED_PREFIX}${emailId}`, true, { ex: 7 * 24 * 60 * 60 });
}

export interface NewsletterRecord {
  id: string;
  from: string;
  subject: string;
  date: string;
  summary: string;
  driveLink: string;
  processedAt: string;
}

export async function saveNewsletterRecord(record: NewsletterRecord): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const key = `${NEWSLETTER_PREFIX}${today}`;

  // Get existing records for today
  const existing = (await kv.get<NewsletterRecord[]>(key)) || [];
  existing.push(record);

  // Store with 7-day expiry
  await kv.set(key, existing, { ex: 7 * 24 * 60 * 60 });
}

export async function getNewslettersForDate(date: string): Promise<NewsletterRecord[]> {
  const key = `${NEWSLETTER_PREFIX}${date}`;
  return (await kv.get<NewsletterRecord[]>(key)) || [];
}

export async function getRecentNewsletters(days = 7): Promise<Record<string, NewsletterRecord[]>> {
  const result: Record<string, NewsletterRecord[]> = {};

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    const records = await getNewslettersForDate(dateStr);
    if (records.length > 0) {
      result[dateStr] = records;
    }
  }

  return result;
}
