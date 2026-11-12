import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { importRow } from "@/lib/import";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const secret = process.env.FORM_SYNC_SECRET;
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || secret.length < 32)
    return NextResponse.json(
      { error: "Sync is not configured" },
      { status: 503 },
    );
  if (
    Buffer.byteLength(supplied) !== Buffer.byteLength(secret) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  )
    return NextResponse.json(
      { error: "Sync is not configured" },
      { status: 503 },
    );
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Body required");
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1024 * 1024) {
        await reader.cancel();
        return NextResponse.json({ error: "Maximum 1 MB" }, { status: 413 });
      }
      chunks.push(value);
    }
    const json = JSON.parse(Buffer.concat(chunks).toString());
    if (
      !Array.isArray(json.rows) ||
      json.rows.length > 1000 ||
      json.rows.length < 1
    )
      throw new Error("Provide 1–1000 rows");
    const rows = json.rows.map((r: unknown) => ({
      ...importRow.parse(r),
      visible: false,
      source: "form",
    }));
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await db
      .from("registrations")
      .upsert(rows, { onConflict: "exam_id,email", ignoreDuplicates: true });
    if (error)
      return NextResponse.json(
        { error: "Import failed. Verify exam and centre IDs." },
        { status: 400 },
      );
    return NextResponse.json({
      accepted: rows.length,
      duplicates: "skipped",
      visibility: "private",
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid request. Provide valid email, name, hostel, exam_id and centre_id for every row.",
      },
      { status: 400 },
    );
  }
}
