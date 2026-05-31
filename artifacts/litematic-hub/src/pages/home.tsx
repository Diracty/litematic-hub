import { Layout } from "@/components/layout";
import { FileUpload } from "@/components/file-upload";
import { FileList } from "@/components/file-list";
import { ApiDocs } from "@/components/api-docs";
import { useSession } from "@/hooks/use-session";
import { useTranslation } from "@/lib/i18n";

export default function Home() {
  const sessionId = useSession();
  const { t } = useTranslation();

  if (!sessionId) return null;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t.homeTitle}</h1>
          <p className="text-muted-foreground mt-1">{t.homeSubtitle}</p>
        </div>
        <FileUpload sessionId={sessionId} />
        <ApiDocs />
        <FileList sessionId={sessionId} />
      </div>
    </Layout>
  );
}
