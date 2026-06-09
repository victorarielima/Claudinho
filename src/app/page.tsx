import { PainelCriacao } from "@/components/painel-criacao";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <PainelCriacao />
      </main>
    </div>
  );
}
