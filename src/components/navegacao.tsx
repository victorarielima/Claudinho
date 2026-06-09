"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SignInButton,
  SignUpButton,
  Show,
  UserButton,
} from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

const LINKS = [
  { href: "/", rotulo: "Criação" },
  { href: "/performance", rotulo: "Performance" },
  { href: "/historico", rotulo: "Histórico" },
];

export function Navegacao() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 mr-6">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            M
          </div>
          <span className="text-sm font-semibold tracking-tight">
            Meta Ads
          </span>
        </Link>

        <Separator orientation="vertical" className="h-6 mr-6" />

        <nav className="flex gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pathname === link.href
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              )}
            >
              {link.rotulo}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Show when="signed-out">
            <SignInButton>
              <button className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground transition-colors">
                Entrar
              </button>
            </SignInButton>
            <SignUpButton>
              <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                Cadastrar
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </div>
    </header>
  );
}
