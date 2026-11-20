import { NextRequest, NextResponse } from "next/server";
import { getTempMemory, setTempMemory, clearTempMemory } from "@/lib/temp-memory";
import { cancelShutdown } from "@/lib/server-lifecycle";

export async function GET(req: NextRequest) {
  cancelShutdown();
  const key = req.nextUrl.searchParams.get("key") || "default";
  const result = getTempMemory(key);
  return NextResponse.json({ success: true, ...result });
}

export async function POST(req: NextRequest) {
  cancelShutdown();
  try {
    const body = await req.json();
    const { key, data } = body as { key: string; data: unknown };
    if (!key) {
      return NextResponse.json({ success: false, error: "Missing key" }, { status: 400 });
    }
    const result = setTempMemory(key, data);
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  cancelShutdown();
  const key = req.nextUrl.searchParams.get("key") || undefined;
  const result = clearTempMemory(key);
  return NextResponse.json(result);
}
