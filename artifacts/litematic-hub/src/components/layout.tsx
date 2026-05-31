import { ReactNode } from "react";
import { Link } from "wouter";
import { Box } from "lucide-react";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground selection:bg-primary/30">
      <header className="border-b border-border/40 bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/30 sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center gap-4 max-w-6xl">
          <Link href="/" className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors">
            <Box className="w-6 h-6" />
            <span className="font-bold tracking-tight text-foreground">Litematic Hub</span>
          </Link>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        {children}
      </main>
      <footer className="py-6 border-t border-border/40 bg-card/20 text-center text-sm text-muted-foreground">
        <div className="container mx-auto px-4 max-w-6xl">
          Litematic Hub &copy; {new Date().getFullYear()} — Precision devtool for Minecraft builders.
        </div>
      </footer>
    </div>
  );
}
