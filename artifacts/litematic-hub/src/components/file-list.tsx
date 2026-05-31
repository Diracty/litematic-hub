import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useListFiles, useDeleteFile, getListFilesQueryKey, LitematicFile } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, Trash2, Eye, Box, FileJson, Layers, Shapes } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface FileListProps {
  sessionId: string;
}

export function FileList({ sessionId }: FileListProps) {
  const { data: files, isLoading, isError } = useListFiles({ sessionId }, { query: { queryKey: getListFilesQueryKey({ sessionId }), enabled: !!sessionId } });
  
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-card/50 border-border/40">
            <CardHeader className="pb-2">
              <Skeleton className="h-6 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
            <CardFooter>
              <Skeleton className="h-9 w-full" />
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-8 p-6 text-center border rounded-lg bg-destructive/10 border-destructive/20 text-destructive">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
        <p>Failed to load your files. Please try refreshing.</p>
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <div className="mt-8 p-12 text-center border border-dashed rounded-lg bg-card/30 text-muted-foreground flex flex-col items-center justify-center">
        <Box className="w-12 h-12 mb-4 opacity-20" />
        <h3 className="text-lg font-medium text-foreground mb-1">No files yet</h3>
        <p>Upload a .litematic file above to get started.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      <h2 className="text-xl font-bold text-foreground">Your Files ({files.length})</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {files.map((file) => (
          <FileCard key={file.key} file={file} sessionId={sessionId} />
        ))}
      </div>
    </div>
  );
}

function FileCard({ file, sessionId }: { file: LitematicFile; sessionId: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteMutation = useDeleteFile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFilesQueryKey({ sessionId }) });
        toast({
          title: "File deleted",
          description: "The file has been permanently removed.",
        });
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Delete failed",
          description: "Could not delete the file. Please try again.",
        });
      }
    }
  });

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(file.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(`/api/files/${file.key}/download`, '_blank');
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this file?")) {
      deleteMutation.mutate({ key: file.key });
    }
  };

  return (
    <Card className="flex flex-col bg-card border-border/40 hover:border-primary/40 transition-colors group overflow-hidden">
      <CardHeader className="pb-3 border-b border-border/40 bg-secondary/20">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-base font-semibold truncate flex-1" title={file.name}>
            {file.name}
          </CardTitle>
          <div className="flex -mr-2">
             <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={handleDownload} title="Download original" data-testid={`btn-download-${file.key}`}>
               <Download className="w-4 h-4" />
             </Button>
             <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDelete} disabled={deleteMutation.isPending} title="Delete" data-testid={`btn-delete-${file.key}`}>
               <Trash2 className="w-4 h-4" />
             </Button>
          </div>
        </div>
        <div className="flex items-center text-xs text-muted-foreground gap-2 font-mono">
          <span className="truncate">{file.key}</span>
          <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto hover:bg-transparent" onClick={handleCopy} data-testid={`btn-copy-${file.key}`}>
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4 pb-2 flex-1 text-sm space-y-2 text-muted-foreground">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5"><FileJson className="w-3.5 h-3.5 text-primary" /> Parts</span>
          <span className="font-mono font-medium text-foreground">{file.partCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-primary" /> Size</span>
          <span className="font-mono">{Math.round(file.sizeBytes / 1024)} KB</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5"><Shapes className="w-3.5 h-3.5 text-primary" /> Blocks</span>
          <span className="font-mono">{file.blockCount ?? '?'}</span>
        </div>
      </CardContent>
      <CardFooter className="pt-2 pb-4">
        <Link href={`/file/${file.key}`} className="w-full">
          <Button className="w-full" variant="secondary" data-testid={`btn-view-${file.key}`}>
            <Eye className="w-4 h-4 mr-2" />
            Inspect Parts
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}

function AlertCircle(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}