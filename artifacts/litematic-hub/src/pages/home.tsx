import { Layout } from "@/components/layout";
import { FileUpload } from "@/components/file-upload";
import { FileList } from "@/components/file-list";
import { useSession } from "@/hooks/use-session";

export default function Home() {
  const sessionId = useSession();

  if (!sessionId) return null;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Workshop Dashboard</h1>
          <p className="text-muted-foreground mt-1">Upload .litematic files to parse them into precise, manageable JSON chunks.</p>
        </div>
        
        <FileUpload sessionId={sessionId} />
        
        <FileList sessionId={sessionId} />
      </div>
    </Layout>
  );
}
