import { NextRequest, NextResponse } from "next/server";
import { getTokensFromCode } from "@/lib/google";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
  }

  try {
    const tokens = await getTokensFromCode(code);

    // In production, you'd store these securely.
    // For now, display them so you can add to Vercel env vars.
    return new NextResponse(
      `
      <html>
        <head><title>Auth Success</title></head>
        <body style="font-family: system-ui; max-width: 600px; margin: 40px auto; padding: 20px;">
          <h1 style="color: green;">Google Auth Successful!</h1>
          <p>Copy these tokens and add them to your Vercel environment variables:</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; word-break: break-all;">
            <p><strong>GOOGLE_ACCESS_TOKEN:</strong><br/><code>${tokens.access_token}</code></p>
            <p><strong>GOOGLE_REFRESH_TOKEN:</strong><br/><code>${tokens.refresh_token}</code></p>
          </div>
          <p style="color: #666; margin-top: 20px;">
            After adding these to Vercel, redeploy your app. You can then close this page.
          </p>
          <a href="/" style="color: blue;">Go to Dashboard</a>
        </body>
      </html>
      `,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
