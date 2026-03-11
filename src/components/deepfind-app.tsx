"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FolderOpen,
  Search,
  Loader2,
  FileText,
  Image,
  Music,
  Video,
  File,
  Settings,
  X,
  Trash2,
  Sparkles,
  ArrowRight,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  type FileEntry,
  getFileType,
  getMimeType,
  searchByEmbedding,
} from "@/lib/embeddings";
import { saveIndex, loadIndex, clearIndex } from "@/lib/storage";

const TYPE_ICON: Record<FileEntry["type"], React.ReactNode> = {
  text: <FileText className="size-4" />,
  image: <Image className="size-4" />,
  audio: <Music className="size-4" />,
  video: <Video className="size-4" />,
  pdf: <FileText className="size-4" />,
  unknown: <File className="size-4" />,
};

const TYPE_COLOR: Record<FileEntry["type"], string> = {
  text: "text-blue-400",
  image: "text-pink-400",
  audio: "text-violet-400",
  video: "text-orange-400",
  pdf: "text-red-400",
  unknown: "text-zinc-500",
};

const TYPE_BG: Record<FileEntry["type"], string> = {
  text: "bg-blue-500/10",
  image: "bg-pink-500/10",
  audio: "bg-violet-500/10",
  video: "bg-orange-500/10",
  pdf: "bg-red-500/10",
  unknown: "bg-zinc-500/10",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function DeepFindApp() {
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressFile, setProgressFile] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<FileEntry & { score: number }> | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const embeddedCount = useMemo(() => files.filter((f) => f.embedding).length, [files]);
  const hasResults = results && results.length > 0;

  useEffect(() => {
    const saved = loadIndex();
    if (saved.length > 0) setFiles(saved);
    const key = localStorage.getItem("deepfind_api_key") ?? "";
    if (key) setApiKey(key);
    else setShowSettings(true);
  }, []);

  const saveKey = useCallback(() => {
    localStorage.setItem("deepfind_api_key", apiKey);
    setShowSettings(false);
    setError(null);
  }, [apiKey]);

  const addFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      if (!selected?.length) return;

      const key = localStorage.getItem("deepfind_api_key");
      if (!key) { setError("Set your API key first."); setShowSettings(true); return; }

      setIsIndexing(true);
      setError(null);
      setProgress(0);

      const { GoogleGenAI } = await import("@google/genai");
      const { embedText, embedFile } = await import("@/lib/embeddings");
      const ai = new GoogleGenAI({ apiKey: key });

      const newFiles: FileEntry[] = [];

      for (let i = 0; i < selected.length; i++) {
        const file = selected[i];
        const fileType = getFileType(file.name);
        const mimeType = getMimeType(file.name);
        setProgressFile(file.name);

        const entry: FileEntry = {
          id: crypto.randomUUID(),
          name: file.name,
          path: file.webkitRelativePath || file.name,
          type: fileType,
          size: file.size,
        };

        if (fileType === "unknown" || file.size > 20 * 1024 * 1024) {
          newFiles.push(entry);
          setProgress(((i + 1) / selected.length) * 100);
          continue;
        }

        try {
          if (fileType === "text") {
            const text = await file.text();
            entry.embedding = await embedText(ai, text.slice(0, 8000), "retrieval_document");
          } else {
            const bytes = new Uint8Array(await file.arrayBuffer());
            entry.embedding = await embedFile(ai, bytes, mimeType);
          }
        } catch (err) {
          console.warn(`Failed: ${file.name}`, err);
          entry.error = err instanceof Error ? err.message : "Unknown error";
        }

        newFiles.push(entry);
        setProgress(((i + 1) / selected.length) * 100);
        if (i < selected.length - 1) await new Promise((r) => setTimeout(r, 100));
      }

      const combined = [...files, ...newFiles];
      setFiles(combined);
      saveIndex(combined);
      setIsIndexing(false);
      setProgressFile("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [files]
  );

  const search = useCallback(async () => {
    if (!query.trim()) return;
    const key = localStorage.getItem("deepfind_api_key");
    if (!key) { setError("Set your API key first."); return; }
    const embedded = files.filter((f) => f.embedding);
    if (!embedded.length) { setError("No files indexed yet."); return; }

    setIsSearching(true);
    setError(null);
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const { embedText } = await import("@/lib/embeddings");
      const ai = new GoogleGenAI({ apiKey: key });
      const qEmb = await embedText(ai, query, "retrieval_query");
      setResults(searchByEmbedding(qEmb, embedded, 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setIsSearching(false);
    }
  }, [query, files]);

  const clearAll = useCallback(() => {
    setFiles([]); setResults(null); clearIndex();
  }, []);

  return (
    <main className="flex h-dvh w-full flex-col bg-background">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is non-standard
        webkitdirectory=""
        className="hidden"
        onChange={addFiles}
      />

      {/* Main layout */}
      <div className={cn(
        "mx-auto flex w-full max-w-2xl flex-col transition-all duration-500 ease-out",
        hasResults || isIndexing ? "pt-6" : "flex-1 justify-center pt-0"
      )}>
        {/* Header */}
        <div className={cn(
          "px-6 transition-all duration-500",
          hasResults || isIndexing ? "mb-4" : "mb-8"
        )}>
          {/* Logo + tagline */}
          <div className={cn(
            "flex items-center gap-3 transition-all duration-500",
            hasResults || isIndexing ? "mb-3" : "mb-5 justify-center"
          )}>
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-cyan-500/10">
                <Sparkles className="size-4 text-cyan-400" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight">
                <span className="text-cyan-400">Deep</span><span className="text-foreground">Find</span>
              </h1>
            </div>

            {!(hasResults || isIndexing) && (
              <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                Gemini Embedding 2
              </Badge>
            )}
          </div>

          {/* Subtitle — only when centered */}
          {!(hasResults || isIndexing) && (
            <p className="mb-6 text-center text-sm text-muted-foreground/70">
              Search your files by meaning, not filename
            </p>
          )}

          {/* Search bar */}
          <Card className="border-border/50 bg-secondary/20 shadow-lg backdrop-blur-sm">
            <CardContent className="p-1.5">
              <div className="flex items-center gap-1">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/40" />
                  <Input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") search(); }}
                    placeholder={embeddedCount > 0 ? `Search ${embeddedCount} files by meaning...` : "Index a folder to start searching"}
                    disabled={embeddedCount === 0 || isSearching}
                    className="h-10 border-0 bg-transparent pl-10 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>

                <Separator orientation="vertical" className="h-6" />

                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isIndexing}
                  title="Add folder"
                >
                  {isIndexing ? <Loader2 className="size-4 animate-spin text-cyan-500" /> : <FolderOpen className="size-4" />}
                </Button>

                {files.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={clearAll}
                    title="Clear index"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowSettings(!showSettings)}
                  title="API key settings"
                  className={cn(showSettings && "bg-secondary")}
                >
                  <KeyRound className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Settings dropdown */}
          {showSettings && (
            <Card className="mt-2 border-border/50 bg-secondary/20 backdrop-blur-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveKey(); }}
                    placeholder="Gemini API key (AIza...)"
                    className="h-8 flex-1 text-xs"
                  />
                  <Button size="sm" onClick={saveKey} className="bg-cyan-700 hover:bg-cyan-800">
                    Save
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setShowSettings(false)}>
                    <X className="size-3.5" />
                  </Button>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  Get a free key at{" "}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline-offset-2 hover:underline">
                    aistudio.google.com
                  </a>
                  . Stored locally — only sent to Google&apos;s API.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Progress bar */}
          {isIndexing && (
            <div className="mt-3 px-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-muted-foreground">Indexing files...</span>
                <span className="text-[11px] font-medium text-cyan-400">{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground/50 truncate">{progressFile}</p>
            </div>
          )}

          {/* Empty state stats */}
          {!(hasResults || isIndexing) && embeddedCount > 0 && (
            <div className="mt-3 flex justify-center">
              <Badge variant="secondary" className="text-[10px] font-normal">
                {embeddedCount} files ready to search
              </Badge>
            </div>
          )}

          {/* Empty state CTA */}
          {!(hasResults || isIndexing) && embeddedCount === 0 && !showSettings && (
            <div className="mt-8 flex flex-col items-center">
              <Button
                variant="outline"
                size="lg"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2 border-dashed"
              >
                <FolderOpen className="size-4" />
                Choose a folder to index
                <ArrowRight className="size-4 text-muted-foreground" />
              </Button>
              <div className="mt-6 flex items-center gap-6 text-[10px] text-muted-foreground/40">
                <span className="flex items-center gap-1"><FileText className="size-3" /> Docs</span>
                <span className="flex items-center gap-1"><Image className="size-3" /> Images</span>
                <span className="flex items-center gap-1"><Music className="size-3" /> Audio</span>
                <span className="flex items-center gap-1"><Video className="size-3" /> Video</span>
                <span className="flex items-center gap-1"><FileText className="size-3" /> PDFs</span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <Card className="mt-3 border-destructive/30 bg-destructive/5">
              <CardContent className="flex items-center gap-2 px-3 py-2">
                <p className="flex-1 text-xs text-destructive">{error}</p>
                <Button variant="ghost" size="icon-sm" onClick={() => setError(null)} className="text-destructive/50 hover:text-destructive">
                  <X className="size-3.5" />
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Results — scrollable area below */}
      {hasResults && (
        <div className="mx-auto w-full max-w-2xl flex-1 overflow-hidden px-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">
              {results.length} results for &ldquo;<span className="text-foreground">{query}</span>&rdquo;
            </span>
            <Button variant="ghost" size="xs" onClick={() => { setResults(null); setQuery(""); }}>
              Clear
            </Button>
          </div>

          <ScrollArea className="h-full pb-6">
            <div className="space-y-1.5 pb-8">
              {results.map((file, i) => (
                <Card
                  key={file.id}
                  className={cn(
                    "border-border/30 bg-card/50 transition-all hover:bg-secondary/30",
                    i === 0 && "border-cyan-500/20 bg-cyan-500/[0.03]"
                  )}
                >
                  <CardContent className="flex items-center gap-3 px-4 py-3">
                    {/* Rank */}
                    <span className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold",
                      i === 0 ? "bg-cyan-500/15 text-cyan-400" : "bg-secondary text-muted-foreground"
                    )}>
                      {i + 1}
                    </span>

                    {/* File type icon */}
                    <div className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      TYPE_BG[file.type],
                      TYPE_COLOR[file.type]
                    )}>
                      {TYPE_ICON[file.type]}
                    </div>

                    {/* File info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground/50">
                        {file.path}
                        <span className="mx-1 opacity-30">·</span>
                        {formatSize(file.size)}
                      </p>
                    </div>

                    {/* Similarity score */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={cn(
                        "text-sm font-semibold tabular-nums",
                        file.score > 0.8 ? "text-cyan-400" :
                        file.score > 0.5 ? "text-foreground/80" :
                        "text-muted-foreground"
                      )}>
                        {(file.score * 100).toFixed(0)}%
                      </span>
                      <div className="h-1 w-16 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            file.score > 0.8 ? "bg-cyan-500" :
                            file.score > 0.5 ? "bg-foreground/30" :
                            "bg-muted-foreground/20"
                          )}
                          style={{ width: `${Math.max(file.score * 100, 3)}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-border/50 px-6 py-2.5">
        <p className="text-center text-[10px] text-muted-foreground/30">
          Your files stay local — only embeddings are generated via Google&apos;s Gemini API
        </p>
      </footer>
    </main>
  );
}
