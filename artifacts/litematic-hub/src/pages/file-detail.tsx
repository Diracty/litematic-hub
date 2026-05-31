import { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetFile, useGetFilePart, getGetFileQueryKey, getGetFilePartQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Box, Copy, Check, Blocks, Database, LayoutGrid, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";

export default function FileDetail() {
  const { key } = useParams<{ key: string }>();
  const [selectedPart, setSelectedPart] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const { data: file, isLoading: fileLoading, isError: fileError } = useGetFile(key, {
    query: { queryKey: getGetFileQueryKey(key), enabled: !!key },
  });

  const { data: partData, isLoading: partLoading } = useGetFilePart(
    key,
    selectedPart ?? 1,
    { query: { queryKey: getGetFilePartQueryKey(key, selectedPart ?? 1), enabled: !!key && !!selectedPart } }
  );

  if (fileLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  if (fileError || !file) {
    return (
      <Layout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold text-destructive mb-2">{t.fileNotFoundTitle}</h2>
          <p className="text-muted-foreground mb-6">{t.fileNotFoundDesc}</p>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" /> {t.btnBack}
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const handleCopyKey = () => {
    navigator.clipboard.writeText(file.key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 1500);
  };

  const handleCopyPart = () => {
    if (partData) {
      navigator.clipboard.writeText(partData.data);
      toast({ title: t.toastCopiedTitle, description: t.toastCopiedDesc });
    }
  };

  return (
    <Layout>
      <div className="space-y-6 flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" className="hover:bg-secondary" data-testid="btn-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{file.name}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono mt-1">
                {file.key}
                <button onClick={handleCopyKey} className="hover:text-foreground transition-colors" data-testid="btn-copy-detail-key">
                  {copiedKey ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={() => window.open(`/api/files/${file.key}/download`, "_blank")} data-testid="btn-download-parsed">
            {t.btnDownloadParsed}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
          <StatCard icon={<Blocks className="w-5 h-5" />} label={t.labelBlocksDetail} value={file.blockCount} />
          <StatCard icon={<Database className="w-5 h-5" />} label={t.labelEntities} value={file.entityCount} />
          <StatCard icon={<LayoutGrid className="w-5 h-5" />} label={t.labelBlockEntities} value={file.blockEntityCount} />
          <StatCard icon={<Box className="w-5 h-5" />} label={t.labelRegions} value={file.regionCount} />
        </div>

        {/* Parts + Viewer */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
          {/* Parts list */}
          <Card className="col-span-1 flex flex-col bg-card/50 overflow-hidden">
            <CardHeader className="py-3 px-4 bg-secondary/20 border-b shrink-0">
              <CardTitle className="text-sm font-medium">{t.partsListTitle} ({file.partCount})</CardTitle>
            </CardHeader>
            <ScrollArea className="flex-1 p-2">
              <div className="flex flex-col gap-1 pr-3">
                {Array.from({ length: file.partCount }).map((_, i) => {
                  const partNum = i + 1;
                  return (
                    <Button
                      key={partNum}
                      variant={selectedPart === partNum ? "default" : "ghost"}
                      className={`justify-start font-mono text-sm h-9 ${selectedPart === partNum ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
                      onClick={() => setSelectedPart(partNum)}
                      data-testid={`btn-select-part-${partNum}`}
                    >
                      Part {partNum.toString().padStart(3, "0")}
                    </Button>
                  );
                })}
              </div>
            </ScrollArea>
          </Card>

          {/* Viewer */}
          <Card className="col-span-1 md:col-span-2 flex flex-col bg-card/50 overflow-hidden border-border/60">
            <CardHeader className="py-3 px-4 bg-secondary/20 border-b flex flex-row items-center justify-between shrink-0 h-[49px]">
              {selectedPart ? (
                <>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    {t.partDataTitle} #{selectedPart}
                    <span className="text-xs text-muted-foreground font-mono font-normal ml-2">
                      {partData ? `${partData.data.length.toLocaleString()} ${t.partChars}` : ""}
                    </span>
                  </CardTitle>
                  <Button
                    variant="ghost" size="sm"
                    className="h-7 text-xs px-2"
                    onClick={handleCopyPart}
                    disabled={!partData}
                    data-testid="btn-copy-part-data"
                  >
                    <Copy className="w-3 h-3 mr-1.5" /> {t.btnCopyJson}
                  </Button>
                </>
              ) : (
                <CardTitle className="text-sm font-medium text-muted-foreground">{t.viewerTitle}</CardTitle>
              )}
            </CardHeader>

            <div className="flex-1 relative min-h-0 bg-[#0d0d0d]">
              {!selectedPart ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/50">
                  <Info className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-sm">{t.viewerEmpty}</p>
                </div>
              ) : partLoading ? (
                <div className="absolute inset-0 p-4 space-y-2">
                  <Skeleton className="h-4 w-1/3 bg-muted/20" />
                  <Skeleton className="h-4 w-1/2 bg-muted/20" />
                  <Skeleton className="h-4 w-2/3 bg-muted/20" />
                  <Skeleton className="h-4 w-1/4 bg-muted/20" />
                </div>
              ) : partData ? (
                <ScrollArea className="h-full w-full">
                  <pre
                    className="p-4 text-xs font-mono text-[#a6accd] break-all whitespace-pre-wrap selection:bg-primary/40 leading-relaxed"
                    data-testid="part-data-viewer"
                  >
                    {partData.data}
                  </pre>
                </ScrollArea>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value?: number }) {
  return (
    <Card className="bg-card/40 border-border/40">
      <CardContent className="p-4 flex items-center gap-4">
        <div className="p-2 bg-secondary/50 rounded-md text-primary shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-xl font-bold text-foreground font-mono truncate">
            {value !== undefined ? value.toLocaleString() : "N/A"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
