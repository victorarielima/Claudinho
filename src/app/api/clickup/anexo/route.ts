import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { baixarAnexoClickUp } from "@/lib/clickup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxy de anexos do ClickUp. Os links do ClickUp valem um único acesso, então
 * cada request pede um link novo à API e devolve os bytes da imagem.
 */
export async function GET(request: NextRequest) {
  await auth();
  const taskId = request.nextUrl.searchParams.get("task");
  const attachmentId = request.nextUrl.searchParams.get("id");
  if (!taskId || !attachmentId) {
    return Response.json({ erro: "Parâmetros task e id são obrigatórios." }, { status: 400 });
  }
  try {
    const { buffer, contentType } = await baixarAnexoClickUp(taskId, attachmentId);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        // O navegador guarda a imagem: rever o preview não gasta outra chamada à API.
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro ao baixar anexo";
    return Response.json({ erro: mensagem }, { status: 502 });
  }
}
