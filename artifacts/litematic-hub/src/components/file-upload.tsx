import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getListFilesQueryKey } from "@workspace/api-client-react";
import { Upload, FileUp, Settings2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface FileUploadProps {
  sessionId: string;
}

export function FileUpload({ sessionId }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

      const res = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Upload failed");
      }

      return res.json();
    },
    onSuccess: () => {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: getListFilesQueryKey({ sessionId }) });
      toast({
        title: "Upload successful",
        description: "Your litematic file has been processed.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message,
      });
    },
  });

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.name.endsWith(".litematic")) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Only .litematic files are supported.",
      });
      return;
    }
    if (selectedFile.size > 50 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Maximum file size is 50MB.",
      });
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
  }, []);

  return (
    <Card className="border-dashed border-2 bg-card/50">
      <CardContent className="p-6 flex flex-col gap-6">
        <div
          className={`relative flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/50"
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
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
            <div className="flex flex-col items-center text-center gap-2 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-2">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Click or drag .litematic file here</h3>
              <p className="text-sm text-muted-foreground">Up to 50MB</p>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center gap-4 w-full">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <FileUp className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-medium text-foreground truncate max-w-[300px]">{file.name}</h3>
                <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setFile(null)} disabled={uploadMutation.isPending} data-testid="button-cancel-upload">
                  Cancel
                </Button>
                <Button size="sm" onClick={() => uploadMutation.mutate(file)} disabled={uploadMutation.isPending} data-testid="button-confirm-upload">
                  {uploadMutation.isPending ? "Uploading..." : "Upload & Parse"}
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
                Parse Settings
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="p-4 border-t border-border bg-card/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxCoords">Max Coords per Part</Label>
                <Input 
                  id="maxCoords" 
                  type="number" 
                  value={settings.maxCoordsPerPart} 
                  onChange={(e) => setSettings({ ...settings, maxCoordsPerPart: Number(e.target.value) })}
                  data-testid="input-max-coords"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxChars">Max Chars per Part</Label>
                <Input 
                  id="maxChars" 
                  type="number" 
                  value={settings.maxCharsPerPart} 
                  onChange={(e) => setSettings({ ...settings, maxCharsPerPart: Number(e.target.value) })}
                  data-testid="input-max-chars"
                />
              </div>
              <div className="space-y-2">
                <Label>Chunk Mode</Label>
                <Select value={settings.chunkMode} onValueChange={(v) => setSettings({ ...settings, chunkMode: v })} data-testid="select-chunk-mode">
                  <SelectTrigger>
                    <SelectValue placeholder="Select chunk mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Off</SelectItem>
                    <SelectItem value="1x1">1x1</SelectItem>
                    <SelectItem value="2x2">2x2</SelectItem>
                    <SelectItem value="3x3">3x3</SelectItem>
                    <SelectItem value="4x4">4x4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Entity Mode</Label>
                <Select value={settings.entityMode} onValueChange={(v) => setSettings({ ...settings, entityMode: v })} data-testid="select-entity-mode">
                  <SelectTrigger>
                    <SelectValue placeholder="Select entity mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Off</SelectItem>
                    <SelectItem value="nbt">NBT</SelectItem>
                    <SelectItem value="eggs">Eggs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between pt-2">
                <Label htmlFor="blockEntities" className="cursor-pointer">Process Block Entities</Label>
                <Switch 
                  id="blockEntities" 
                  checked={settings.blockEntityMode} 
                  onCheckedChange={(c) => setSettings({ ...settings, blockEntityMode: c })} 
                  data-testid="switch-block-entities"
                />
              </div>
              <div className="flex items-center justify-between pt-2">
                <Label htmlFor="biomes" className="cursor-pointer">Process Biomes</Label>
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
