import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { blobToken } from "@/app/lib/blob";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 5_000_000; // 5 MB

export async function POST(req: NextRequest) {
  const token = blobToken();
  if (!token) {
    return NextResponse.json(
      { error: "uploads not configured" },
      { status: 503 }
    );
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "images only" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "max 5 MB" }, { status: 413 });
  }
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const blob = await put(`chat/${crypto.randomUUID()}-${safe}`, file, {
    access: "public",
    contentType: file.type,
    token,
  });
  return NextResponse.json({ url: blob.url });
}
