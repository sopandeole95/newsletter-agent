import { NextResponse } from "next/server";

export async function GET() {
  const senders = (process.env.NEWSLETTER_SENDERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return NextResponse.json({
    senders,
    driveFolderPrefix: process.env.DRIVE_FOLDER_PREFIX || "newsletters",
    isAuthenticated: !!(process.env.GOOGLE_ACCESS_TOKEN && process.env.GOOGLE_REFRESH_TOKEN),
  });
}
