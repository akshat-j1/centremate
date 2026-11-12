import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/server";
import { configured } from "@/lib/supabase";
import { safeReturnPath } from "@/lib/workflows";
export async function GET(request: NextRequest) {
  const next = safeReturnPath(request.cookies.get("centremate_next")?.value);
  const destination = new URL(next, request.url);
  try {
    const code = request.nextUrl.searchParams.get("code");
    if (!code || !configured) throw new Error("Sign-in unavailable");
    const db = await serverClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (error) throw error;
  } catch {
    destination.searchParams.set("error", "signin");
  }
  const response = NextResponse.redirect(destination);
  response.cookies.set("centremate_next", "", { maxAge: 0, path: "/" });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
