import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getListFilesQueryKey } from "@workspace/api-client-react";
import { Upload, FileUp, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";
import { MAX_LITEMATIC_UPLOAD_BYTES } from "@/lib/upload-limits";

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

type UploadJobResponse = {
  jobId: string;
  status: string;
  progress?: number;
  stage?: string;
  error?: string;
  result?: Record<string, unknown>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function gatewayErrorMessage(status: number): string {
  return (
    `Сервер недоступен (HTTP ${status}, Bad Gateway). ` +
    "Часто это таймаут прокси RelaxDev или нехватка памяти при парсинге большого файла. " +
    "Подождите 1–2 минуты и загрузите снова; если повторяется — напишите в поддержку RelaxDev про лимит RAM/таймаут."
  );
}

async function readJsonBody<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(gatewayErrorMessage(res.status));
    }
    throw new Error(`Пустой ответ сервера (HTTP ${res.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(gatewayErrorMessage(res.status));
    }
    const preview = text.length > 120 ? `${text.slice(0, 120)}…` : text;
    throw new Error(`${preview} (HTTP ${res.status})`);
  }
}

function isGatewayStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

async function pollUploadJob(
  jobId: string,
  onParseProgress: (pct: number) => void,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 15 * 60 * 1000;
  let gatewayRetries = 0;
  while (Date.now() < deadline) {
    const res = await fetch(`/api/upload-jobs/${jobId}`);
    if (isGatewayStatus(res.status) && gatewayRetries < 30) {
      gatewayRetries++;
      await sleep(3000);
      continue;
    }
    const body = await readJsonBody<UploadJobResponse>(res);
    gatewayRetries = 0;
    if (!res.ok) {
      throw new Error(body.error ?? `Job poll failed (${res.status})`);
    }
    if (typeof body.progress === "number") {
      onParseProgress(body.progress);
    }
    if (body.status === "done" && body.result) {
      onParseProgress(100);
      return body.result;
    }
    if (body.status === "failed") {
      throw new Error(body.error ?? "Parse failed");
    }
    await sleep(1500);
  }
  throw new Error("Parse timed out (15 min)");
}

function uploadWithProgress(
  formData: FormData,
  onProgress: (pct: number) => void,
  onQueued: () => void,
  onParseProgress: (pct: number) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      void (async () => {
        let body: UploadJobResponse & { error?: string } = {};
        try {
          body = JSON.parse(xhr.responseText) as UploadJobResponse & { error?: string };
        } catch {
          if (isGatewayStatus(xhr.status)) {
            reject(new Error(gatewayErrorMessage(xhr.status)));
            return;
          }
        }
        if (xhr.status === 202 && body.jobId) {
          onQueued();
          resolve(await pollUploadJob(body.jobId, onParseProgress));
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body);
          return;
        }
        reject(
          new Error(
            body.error ??
              (isGatewayStatus(xhr.status)
                ? gatewayErrorMessage(xhr.status)
                : `Upload failed (${xhr.status})`),
          ),
        );
      })().catch(reject);
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.timeout = 15 * 60 * 1000;
    xhr.send(formData);
  });
}

interface FileUploadProps {
  sessionId: string;
}

export function FileUpload({ sessionId }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [parsePct, setParsePct] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "upload" | "parse">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [settings, setSettings] = useState({
    maxCoordsPerPart: 1024,
    maxCharsPerPart: 20000,
    chunkMode: "off",
    entityMode: "eggs",
    blockEntityMode: true,
    biomeMode: false,
  });

  const uploadMutation = useMutation({
    mutationFn: async (uploadFile: File) => {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("sessionId", sessionId);
      formData.append("maxCoordsPerPart", settings.maxCoordsPerPart.toString());
      formData.append("maxCharsPerPart", settings.maxCharsPerPart.toString());
      formData.append("chunkMode", settings.chunkMode);
      formData.append("entityMode", settings.entityMode);
      formData.append("blockEntityMode", settings.blockEntityMode.toString());
      formData.append("biomeMode", settings.biomeMode.toString());

      setUploadPhase("upload");
      setUploadPct(0);
      try {
        return await uploadWithProgress(
          formData,
          (pct) => {
            setUploadPct(pct);
            if (pct >= 100) setUploadPhase("parse");
          },
          () => {
            setUploadPhase("parse");
            setParsePct(0);
          },
          setParsePct,
        );
      } finally {
        setUploadPhase("idle");
        setUploadPct(0);
        setParsePct(0);
      }
    },
    onSuccess: () => {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: getListFilesQueryKey({ sessionId }) });
      toast({ title: t.uploadToastSuccessTitle, description: t.uploadToastSuccessDesc });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: t.uploadToastFailTitle, description: error.message });
    },
  });

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.name.endsWith(".litematic")) {
      toast({ variant: "destructive", title: t.uploadInvalidTypeTitle, description: t.uploadToastInvalidType });
      return;
    }
    if (selectedFile.size > MAX_LITEMATIC_UPLOAD_BYTES) {
      toast({ variant: "destructive", title: t.uploadTooLargeTitle, description: t.uploadToastTooLarge });
      return;
    }
    setFile(selectedFile);
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="border-dashed border-2 bg-card/50">
      <CardContent className="p-6 flex flex-col gap-6">
        <div
          className={`relative flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
            isDragging ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/50"
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !file && fileInputRef.current?.click()}
        >
          <input
            type="file"
            accept=".litematic"
            className="hidden"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
              }
            }}
            data-testid="input-file-upload"
          />

          {!file ? (
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-2">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">{t.uploadDropTitle}</h3>
              <p className="text-sm text-muted-foreground">{t.uploadDropSub}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center gap-4 w-full" onClick={(e) => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <FileUp className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-medium text-foreground truncate max-w-[300px]">{file.name}</h3>
                <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
              </div>
              {uploadMutation.isPending && (
                <div className="w-full max-w-xs space-y-1">
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{
                        width: `${
                          uploadPhase === "parse"
                            ? Math.max(parsePct, uploadPct >= 100 ? 1 : 0)
                            : uploadPct
                        }%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    {uploadPhase === "parse"
                      ? parsePct > 0
                        ? parsePct < 15
                          ? `${t.uploadParseProgress.replace("{pct}", String(parsePct))} — этап распаковки, может занять несколько минут`
                          : t.uploadParseProgress.replace("{pct}", String(parsePct))
                        : t.uploadQueued
                      : t.uploadProgress.replace("{pct}", String(uploadPct))}
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setFile(null)} disabled={uploadMutation.isPending} data-testid="button-cancel-upload">
                  {t.uploadCancel}
                </Button>
                <Button size="sm" onClick={() => uploadMutation.mutate(file)} disabled={uploadMutation.isPending} data-testid="button-confirm-upload">
                  {uploadMutation.isPending
                    ? uploadPhase === "parse"
                      ? parsePct > 0
                        ? t.uploadParseProgress.replace("{pct}", String(parsePct))
                        : t.uploadQueued
                      : t.uploadPending
                    : t.uploadConfirm}
                </Button>
              </div>
            </div>
          )}
        </div>

        <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen} className="border rounded-md overflow-hidden bg-card">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between p-3 bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors" data-testid="button-toggle-settings">
              <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                <Settings2 className="w-4 h-4 text-primary" />
                {t.uploadSettingsLabel}
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="p-4 border-t border-border bg-card/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxCoords">{t.uploadLabelMaxCoords}</Label>
                <Input
                  id="maxCoords"
                  type="number"
                  min={1}
                  value={settings.maxCoordsPerPart}
                  onChange={(e) => setSettings({ ...settings, maxCoordsPerPart: Math.max(1, Number(e.target.value)) })}
                  data-testid="input-max-coords"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxChars">{t.uploadLabelMaxChars}</Label>
                <Input
                  id="maxChars"
                  type="number"
                  min={100}
                  value={settings.maxCharsPerPart}
                  onChange={(e) => setSettings({ ...settings, maxCharsPerPart: Math.max(100, Number(e.target.value)) })}
                  data-testid="input-max-chars"
                />
              </div>
              <div className="space-y-2">
                <Label>{t.uploadLabelChunkMode}</Label>
                <Select value={settings.chunkMode} onValueChange={(v) => setSettings({ ...settings, chunkMode: v })}>
                  <SelectTrigger data-testid="select-chunk-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">{t.uploadChunkOff}</SelectItem>
                    <SelectItem value="1x1">1x1</SelectItem>
                    <SelectItem value="2x2">2x2</SelectItem>
                    <SelectItem value="3x3">3x3</SelectItem>
                    <SelectItem value="4x4">4x4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t.uploadLabelEntityMode}</Label>
                <Select value={settings.entityMode} onValueChange={(v) => setSettings({ ...settings, entityMode: v })}>
                  <SelectTrigger data-testid="select-entity-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">{t.uploadEntityOff}</SelectItem>
                    <SelectItem value="nbt">{t.uploadEntityNbt}</SelectItem>
                    <SelectItem value="eggs">{t.uploadEntityEggs}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between pt-2">
                <Label htmlFor="blockEntities" className="cursor-pointer">{t.uploadLabelBlockEntities}</Label>
                <Switch
                  id="blockEntities"
                  checked={settings.blockEntityMode}
                  onCheckedChange={(c) => setSettings({ ...settings, blockEntityMode: c })}
                  data-testid="switch-block-entities"
                />
              </div>
              <div className="flex items-center justify-between pt-2">
                <Label htmlFor="biomes" className="cursor-pointer">{t.uploadLabelBiomes}</Label>
                <Switch
                  id="biomes"
                  checked={settings.biomeMode}
                  onCheckedChange={(c) => setSettings({ ...settings, biomeMode: c })}
                  data-testid="switch-biome-mode"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
