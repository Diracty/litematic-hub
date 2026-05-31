import { ReactNode } from "react";
import { Link } from "wouter";
import { Box } from "lucide-react";
import { useTranslation, type Lang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: ReactNode }) {
  const { lang, setLang, t } = useTranslation();

  const toggle = () => setLang(lang === "ru" ? "en" : "ru");
  const nextLabel: Lang = lang === "ru" ? "en" : "ru";

  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground selection:bg-primary/30">
      <header className="border-b border-border/40 bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/30 sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center gap-4 max-w-6xl">
          <Link href="/" className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors">
            <Box className="w-6 h-6" />
            <span className="font-bold tracking-tight text-foreground">Litematic Parser</span>
          </Link>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggle}
              className="font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground border border-border/40 hover:border-border/80 px-3 h-7"
              data-testid="btn-lang-toggle"
            >
              {nextLabel}
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        {children}
      </main>
      <footer className="py-4 border-t border-border/40 bg-card/20 text-center text-xs text-muted-foreground/50">
        <div className="container mx-auto px-4 max-w-6xl">
          Litematic Parser &copy; {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}
