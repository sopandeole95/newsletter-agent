import { createClient } from "redis";

function getClient() {
  const client = createClient({ url: process.env.REDIS_URL });
  client.on("error", (err) => console.error("Redis error:", err));
  return client;
}

async function withRedis<T>(fn: (client: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
  const client = getClient();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}

const PROCESSED_PREFIX = "processed:";
const NEWSLETTER_PREFIX = "newsletter:";

export async function isProcessed(emailId: string): Promise<boolean> {
  return withRedis(async (client) => {
    const result = await client.get(`${PROCESSED_PREFIX}${emailId}`);
    return result !== null;
  });
}

export async function markProcessed(emailId: string): Promise<void> {
  await withRedis(async (client) => {
    // Expire after 7 days to keep store clean
    await client.set(`${PROCESSED_PREFIX}${emailId}`, "true", { EX: 7 * 24 * 60 * 60 });
  });
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
  await withRedis(async (client) => {
    const today = new Date().toISOString().split("T")[0];
    const key = `${NEWSLETTER_PREFIX}${today}`;

    // Get existing records for today
    const raw = await client.get(key);
    const existing: NewsletterRecord[] = raw ? JSON.parse(raw) : [];
    existing.push(record);

    // Store with 7-day expiry
    await client.set(key, JSON.stringify(existing), { EX: 7 * 24 * 60 * 60 });
  });
}

export async function getNewslettersForDate(date: string): Promise<NewsletterRecord[]> {
  return withRedis(async (client) => {
    const key = `${NEWSLETTER_PREFIX}${date}`;
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : [];
  });
}

export async function getRecentNewsletters(days = 7): Promise<Record<string, NewsletterRecord[]>> {
  return withRedis(async (client) => {
    const result: Record<string, NewsletterRecord[]> = {};

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const key = `${NEWSLETTER_PREFIX}${dateStr}`;
      const raw = await client.get(key);
      const records: NewsletterRecord[] = raw ? JSON.parse(raw) : [];
      if (records.length > 0) {
        result[dateStr] = records;
      }
    }

    return result;
  });
}
