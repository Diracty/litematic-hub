import { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetFile, useGetFilePart, getGetFileQueryKey, getGetFilePartQueryKey, type LitematicFile } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Box, Copy, Check, Blocks, Database, LayoutGrid, Info, Ruler, List } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";

export default function FileDetail() {
  const { key } = useParams<{ key: string }>();
  const [selectedPart, setSelectedPart] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [activeTab, setActiveTab] = useState<"contents" | "parts">("contents");
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
            <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> {t.btnBack}</Button>
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
      navigator.clipboard.writeText(JSON.stringify(partData.data));
      toast({ title: t.toastCopiedTitle, description: t.toastCopiedDesc });
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
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

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={<Blocks className="w-4 h-4" />} label={t.labelBlocksDetail} value={file.blockCount} />
          <StatCard icon={<Database className="w-4 h-4" />} label={t.labelEntities} value={file.entityCount} />
          <StatCard icon={<LayoutGrid className="w-4 h-4" />} label={t.labelBlockEntities} value={file.blockEntityCount} />
          <StatCard icon={<Box className="w-4 h-4" />} label={t.labelRegions} value={file.regionCount} />
          <DimensionsCard file={file} label={t.labelDimensions} />
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-border/60 gap-1">
          <TabBtn active={activeTab === "contents"} onClick={() => setActiveTab("contents")} icon={<List className="w-4 h-4" />} label={t.tabContents} />
          <TabBtn active={activeTab === "parts"} onClick={() => setActiveTab("parts")} icon={<Ruler className="w-4 h-4" />} label={`${t.tabParts} (${file.partCount})`} />
        </div>

        {/* Contents tab */}
        {activeTab === "contents" && (
          <ContentsPanel file={file} />
        )}

        {/* Parts tab */}
        {activeTab === "parts" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6" style={{ minHeight: "60vh" }}>
            <Card className="col-span-1 flex flex-col bg-card/50 overflow-hidden" style={{ maxHeight: "70vh" }}>
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

            <Card className="col-span-1 md:col-span-2 flex flex-col bg-card/50 overflow-hidden border-border/60" style={{ maxHeight: "70vh" }}>
              <CardHeader className="py-3 px-4 bg-secondary/20 border-b flex flex-row items-center justify-between shrink-0 h-[49px]">
                {selectedPart ? (
                  <>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      {t.partDataTitle} #{selectedPart}
                      <span className="text-xs text-muted-foreground font-mono font-normal ml-2">
                        {partData ? `${JSON.stringify(partData.data).length.toLocaleString()} ${t.partChars}` : ""}
                      </span>
                    </CardTitle>
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={handleCopyPart} disabled={!partData} data-testid="btn-copy-part-data">
                      <Copy className="w-3 h-3 mr-1.5" /> {t.btnCopyJson}
                    </Button>
                  </>
                ) : (
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t.viewerTitle}</CardTitle>
                )}
              </CardHeader>

              <div className="flex-1 relative min-h-0 bg-[#0d0d0d] overflow-hidden">
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
                  </div>
                ) : partData ? (
                  <ScrollArea className="h-full w-full">
                    <pre className="p-4 text-xs font-mono text-[#a6accd] break-all whitespace-pre-wrap selection:bg-primary/40 leading-relaxed" data-testid="part-data-viewer">
                    {JSON.stringify(partData.data, null, 2)}
                  </pre>
                  </ScrollArea>
                ) : null}
              </div>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value?: number }) {
  return (
    <Card className="bg-card/40 border-border/40">
      <CardContent className="p-3 flex items-center gap-3">
        <div className="p-1.5 bg-secondary/50 rounded-md text-primary shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{label}</p>
          <p className="text-lg font-bold text-foreground font-mono">
            {value !== undefined ? value.toLocaleString() : "N/A"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DimensionsCard({ file, label }: { file: LitematicFile; label: string }) {
  const dims = file.dimensions;
  if (!dims) return <StatCard icon={<Ruler className="w-4 h-4" />} label={label} value={undefined} />;
  return (
    <Card className="bg-card/40 border-border/40">
      <CardContent className="p-3 flex items-center gap-3">
        <div className="p-1.5 bg-secondary/50 rounded-md text-primary shrink-0">
          <Ruler className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{label}</p>
          <p className="text-base font-bold text-foreground font-mono leading-tight">
            {dims.x} × {dims.y} × {dims.z}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ContentsPanel({ file }: { file: LitematicFile }) {
  const { t } = useTranslation();
  const [section, setSection] = useState<"blocks" | "entities" | "blockEntities">("blocks");

  const tabs: { key: typeof section; label: string; data: Record<string, number> | undefined; total: number | undefined }[] = [
    { key: "blocks",       label: t.contentsBlocks,       data: file.blockTypes as Record<string,number>|undefined,       total: file.blockCount },
    { key: "entities",     label: t.contentsEntities,     data: file.entityTypes as Record<string,number>|undefined,     total: file.entityCount },
    { key: "blockEntities",label: t.contentsBlockEntities,data: file.blockEntityTypes as Record<string,number>|undefined, total: file.blockEntityCount },
  ];

  const current = tabs.find(t => t.key === section)!;
  const entries = current.data
    ? Object.entries(current.data).sort((a, b) => b[1] - a[1])
    : [];
  const total = current.total ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setSection(tab.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              section === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {tab.label}
            <span className={`ml-2 text-xs font-mono ${section === tab.key ? "opacity-80" : "opacity-60"}`}>
              {tab.total?.toLocaleString() ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Entries list */}
      <Card className="bg-card/50 border-border/40 overflow-hidden">
        {entries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{t.contentsEmpty}</div>
        ) : (
          <ScrollArea className="max-h-[55vh]">
            <div className="divide-y divide-border/40">
              {entries.map(([id, count]) => {
                const pct = total > 0 ? (count / total) * 100 : 0;
                const shortId = id.includes(":") ? id.split(":")[1] : id;
                return (
                  <div key={id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/20 transition-colors group">
                    {/* bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-mono text-sm text-foreground truncate" title={id}>{shortId}</span>
                        <span className="text-xs text-muted-foreground truncate hidden group-hover:inline">{id}</span>
                      </div>
                      <div className="h-1.5 bg-secondary/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/60 rounded-full"
                          style={{ width: `${Math.max(pct, 0.5)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-sm font-semibold text-foreground">{count.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{pct.toFixed(1)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </Card>

      {/* Total row */}
      {entries.length > 0 && (
        <p className="text-xs text-muted-foreground text-right pr-1">
          {entries.length} {current.label.toLowerCase()} · {total.toLocaleString()} {t.contentsTotal}
        </p>
      )}
    </div>
  );
}
