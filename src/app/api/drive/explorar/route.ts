import { auth } from "@clerk/nextjs/server";
import { explorar } from "@/lib/drive-explorer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  await auth();

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (ev: unknown) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
        } catch {
          // controller may be closed if client disconnected
        }
      };
      try {
        await explorar(emit);
      } catch (err) {
        const mensagem = err instanceof Error ? err.message : "Erro desconhecido";
        emit({ tipo: "erro", mensagem });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
