import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getGoogleAuth } from "@/lib/google-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const drive = google.drive({ version: "v3", auth: getGoogleAuth() });

    // Get file metadata for content type
    const meta = await drive.files.get({
      fileId,
      fields: "mimeType,size",
      supportsAllDrives: true,
    });

    const mimeType = meta.data.mimeType ?? "video/mp4";

    // Stream the file
    const res = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "stream" }
    );

    const stream = res.data as unknown as ReadableStream;

    return new NextResponse(stream as unknown as BodyInit, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=3600",
        ...(meta.data.size ? { "Content-Length": meta.data.size } : {}),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro";
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
