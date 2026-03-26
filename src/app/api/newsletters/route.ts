import { NextRequest, NextResponse } from "next/server";
import { getRecentNewsletters, getNewslettersForDate } from "@/lib/kv";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");

  try {
    if (date) {
      const newsletters = await getNewslettersForDate(date);
      return NextResponse.json({ date, newsletters });
    }

    const recent = await getRecentNewsletters(7);
    return NextResponse.json({ newsletters: recent });
  } catch (error) {
    console.error("Error fetching newsletters:", error);
    return NextResponse.json({ error: "Failed to fetch newsletters" }, { status: 500 });
  }
}
