import { auth } from "@clerk/nextjs/server";
import { gerarLegenda, type TipoCriativo } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  tipo?: TipoCriativo;
  imagemUrl?: string | null;
  nomeArquivo?: string | null;
  marca?: string | null;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ erro: "Não autorizado" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ erro: "JSON inválido" }, { status: 400 });
  }

  const tipo = body.tipo;
  if (tipo !== "video" && tipo !== "imagem") {
    return Response.json(
      { erro: "Campo 'tipo' deve ser 'video' ou 'imagem'" },
      { status: 400 }
    );
  }

  try {
    const legenda = await gerarLegenda({
      tipo,
      imagemUrl: body.imagemUrl ?? null,
      nomeArquivo: body.nomeArquivo ?? null,
      marca: body.marca ?? null,
    });
    return Response.json({ legenda });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Erro ao gerar legenda";
    return Response.json({ erro: mensagem }, { status: 500 });
  }
}
