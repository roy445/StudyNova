import { NextResponse } from "next/server";
import { cjkFontPath, getCjkFont } from "@/server/cjk-font";

export const runtime = "nodejs";

export async function GET() {
  try {
    const font = getCjkFont();
    return new NextResponse(new Uint8Array(font), {
      headers: {
        "content-type": "font/ttf",
        "cache-control": "public, max-age=31536000, immutable",
        "x-studynova-font": cjkFontPath(),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
