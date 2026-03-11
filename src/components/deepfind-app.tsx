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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type FileEntry,
  getFileType,
  getMimeType,
  searchByEmbedding,
} from "@/lib/embeddings";
import { saveIndex, loadIndex, clearIndex } from "@/lib/storage";

const TYPE_ICON: Record<FileEntry["type"], React.ReactNode> = {
  text: <FileText className="size-3.5" />,
  image: <Image className="size-3.5" />,
  audio: <Music className="size-3.5" />,
  video: <Video className="size-3.5" />,
  pdf: <FileText className="size-3.5" />,
  unknown: <File className="size-3.5" />,
};

const TYPE_COLOR: Record<FileEntry["type"], string> = {
  text: "text-blue-400",
  image: "text-pink-400",
  audio: "text-violet-400",
  video: "text-orange-400",
  pdf: "text-red-400",
  unknown: "text-zinc-500",
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

  const embeddedCount = useMemo(() => files.filter((f) => f.embedding).length, [files]);

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
            entry.embedding = await embedText(ai, text.slice(0, 8000));
          } else {
            const bytes = new Uint8Array(await file.arrayBuffer());
            entry.embedding = await embedFile(ai, bytes, mimeType);
          }
        } catch (err) {
          console.warn(`Failed: ${file.name}`, err);
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
    <main className="flex h-dvh w-full flex-col items-center bg-background">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is non-standard
        webkitdirectory=""
        className="hidden"
        onChange={addFiles}
      />

      {/* Center content */}
      <div className={cn(
        "flex w-full max-w-2xl flex-col px-5 transition-all duration-500",
        results || isIndexing ? "pt-8" : "flex-1 justify-center"
      )}>
        {/* Logo */}
        <h1 className={cn(
          "font-semibold tracking-tight transition-all duration-500",
          results || isIndexing ? "mb-4 text-lg" : "mb-6 text-center text-3xl"
        )}>
          <span className="text-cyan-400">Deep</span>Find
        </h1>

        {/* Search bar */}
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") search(); }}
            placeholder={embeddedCount > 0 ? `Search across ${embeddedCount} files by meaning...` : "Add a folder to start..."}
            disabled={embeddedCount === 0 || isSearching}
            className={cn(
              "h-12 w-full rounded-xl border border-border bg-secondary/30 pl-11 pr-24 text-sm backdrop-blur-sm",
              "placeholder:text-muted-foreground/50",
              "focus:border-cyan-500/40 focus:outline-none focus:ring-1 focus:ring-cyan-500/20",
              embeddedCount === 0 && "cursor-not-allowed opacity-50"
            )}
          />
          <Search className="absolute left-4 top-4 size-4 text-muted-foreground/50" />

          {/* Right side buttons */}
          <div className="absolute right-2 top-1.5 flex items-center gap-1">
            {isSearching && <Loader2 className="size-4 animate-spin text-cyan-500 mr-1" />}

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isIndexing}
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title="Add folder"
            >
              {isIndexing ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
            </button>

            {files.length > 0 && (
              <button
                onClick={clearAll}
                className="rounded-lg p-2 text-muted-foreground hover:text-destructive transition-colors"
                title="Clear index"
              >
                <Trash2 className="size-4" />
              </button>
            )}

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title="Settings"
            >
              <Settings className="size-4" />
            </button>
          </div>
        </div>

        {/* Settings dropdown */}
        {showSettings && (
          <div className="mt-2 rounded-xl border border-border bg-secondary/30 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveKey(); }}
                placeholder="Gemini API key (AIza...)"
                className="h-8 flex-1 rounded-lg border border-input bg-background px-3 text-xs focus:border-cyan-500/40 focus:outline-none"
              />
              <button
                onClick={saveKey}
                className="h-8 rounded-lg bg-cyan-700 px-3 text-xs font-medium text-white hover:bg-cyan-800"
              >
                Save
              </button>
              <button onClick={() => setShowSettings(false)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Free key at{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                aistudio.google.com/apikey
              </a>
              {" "}— stored locally, only sent to Google.
            </p>
          </div>
        )}

        {/* Progress */}
        {isIndexing && (
          <div className="mt-3">
            <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-cyan-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground truncate">
              Embedding {Math.round(progress)}% — {progressFile}
            </p>
          </div>
        )}

        {/* Subtitle when empty */}
        {!results && !isIndexing && embeddedCount === 0 && (
          <p className="mt-3 text-center text-xs text-muted-foreground/50">
            Search your files by meaning, not filename. Powered by Gemini Embedding 2.
          </p>
        )}
        {!results && !isIndexing && embeddedCount > 0 && (
          <p className="mt-2 text-center text-[11px] text-muted-foreground/40">
            {embeddedCount} files indexed
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="flex-1 text-xs text-destructive">{error}</p>
            <button onClick={() => setError(null)} className="text-destructive/50 hover:text-destructive">
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Search results */}
      {results && (
        <div className="w-full max-w-2xl flex-1 overflow-y-auto px-5 pb-8">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {results.length} results
            </span>
            <button
              onClick={() => { setResults(null); setQuery(""); }}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>

          <div className="space-y-1">
            {results.map((file) => (
              <div
                key={file.id}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary/30"
              >
                {/* Icon */}
                <span className={cn("shrink-0", TYPE_COLOR[file.type])}>
                  {TYPE_ICON[file.type]}
                </span>

                {/* File info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{file.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground/50">{file.path}</p>
                </div>

                {/* Score */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="h-1 w-12 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-cyan-500/70"
                      style={{ width: `${Math.max(file.score * 100, 5)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-[11px] font-medium text-cyan-400/80">
                    {(file.score * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
