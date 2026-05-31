import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <p className="text-7xl font-bold font-mono text-primary/30 mb-6">404</p>
        <h1 className="text-2xl font-bold text-foreground mb-2">{t.notFoundTitle}</h1>
        <p className="text-muted-foreground mb-8">{t.notFoundDesc}</p>
        <Link href="/">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t.btnBack}
          </Button>
        </Link>
      </div>
    </Layout>
  );
}
