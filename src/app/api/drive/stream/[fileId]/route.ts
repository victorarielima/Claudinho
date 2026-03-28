import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getGoogleAuth } from "@/lib/google-auth";
import { Readable } from "node:stream";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const drive = google.drive({ version: "v3", auth: getGoogleAuth() });

    const meta = await drive.files.get({
      fileId,
      fields: "mimeType,size",
      supportsAllDrives: true,
    });

    const mimeType = meta.data.mimeType ?? "video/mp4";

    const res = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "stream" }
    );

    // googleapis returns a Node.js Readable stream
    const nodeStream = res.data as unknown as Readable;

    // Convert Node.js Readable to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        nodeStream.on("end", () => {
          controller.close();
        });
        nodeStream.on("error", (err: Error) => {
          controller.error(err);
        });
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=3600",
        ...(meta.data.size ? { "Content-Length": String(meta.data.size) } : {}),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro";
    const status = (error as { code?: number }).code === 404 ? 404 : 500;
    return NextResponse.json({ erro: msg }, { status });
  }
}
