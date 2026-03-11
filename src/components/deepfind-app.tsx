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
  Trash2,
  Settings,
  X,
  Eye,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type FileEntry,
  getFileType,
  getMimeType,
  searchByEmbedding,
} from "@/lib/embeddings";
import { saveIndex, loadIndex, clearIndex } from "@/lib/storage";

const FILE_TYPE_ICONS: Record<FileEntry["type"], React.ReactNode> = {
  text: <FileText className="size-4" />,
  image: <Image className="size-4" />,
  audio: <Music className="size-4" />,
  video: <Video className="size-4" />,
  pdf: <FileText className="size-4" />,
  unknown: <File className="size-4" />,
};

const FILE_TYPE_COLORS: Record<FileEntry["type"], string> = {
  text: "#60a5fa",
  image: "#f472b6",
  audio: "#a78bfa",
  video: "#fb923c",
  pdf: "#f87171",
  unknown: "#9ca3af",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DeepFindApp() {
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressFile, setProgressFile] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<FileEntry & { score: number }> | null
  >(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, embedded: 0, failed: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved index on mount
  useEffect(() => {
    const saved = loadIndex();
    if (saved.length > 0) {
      setFiles(saved);
      setStats({
        total: saved.length,
        embedded: saved.filter((f) => f.embedding).length,
        failed: saved.filter((f) => !f.embedding).length,
      });
    }
    const savedKey = localStorage.getItem("deepfind_api_key") ?? "";
    if (savedKey) setApiKey(savedKey);
    else setShowSettings(true);
  }, []);

  const handleSaveApiKey = useCallback(() => {
    localStorage.setItem("deepfind_api_key", apiKey);
    setShowSettings(false);
    setError(null);
  }, [apiKey]);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFilesSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (!selectedFiles || selectedFiles.length === 0) return;

      const key = localStorage.getItem("deepfind_api_key");
      if (!key) {
        setError("Please set your Gemini API key in settings first.");
        setShowSettings(true);
        return;
      }

      setIsIndexing(true);
      setError(null);
      setProgress(0);

      const { GoogleGenAI } = await import("@google/genai");
      const { embedText, embedFile } = await import("@/lib/embeddings");
      const ai = new GoogleGenAI({ apiKey: key });

      const newFiles: FileEntry[] = [];
      const total = selectedFiles.length;
      let embedded = 0;
      let failed = 0;

      for (let i = 0; i < total; i++) {
        const file = selectedFiles[i];
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

        // Skip files that are too large (>20MB for binary, >50KB for text)
        const maxSize = fileType === "text" ? 50 * 1024 : 20 * 1024 * 1024;
        if (file.size > maxSize) {
          failed++;
          newFiles.push(entry);
          setProgress(((i + 1) / total) * 100);
          continue;
        }

        // Skip unsupported types
        if (fileType === "unknown") {
          newFiles.push(entry);
          setProgress(((i + 1) / total) * 100);
          continue;
        }

        try {
          if (fileType === "text") {
            const text = await file.text();
            const truncated = text.slice(0, 8000);
            entry.embedding = await embedText(ai, truncated);
          } else {
            const bytes = new Uint8Array(await file.arrayBuffer());
            entry.embedding = await embedFile(ai, bytes, mimeType);
          }
          embedded++;
        } catch (err) {
          console.warn(`Failed to embed ${file.name}:`, err);
          failed++;
        }

        newFiles.push(entry);
        setProgress(((i + 1) / total) * 100);

        // Small delay to avoid rate limiting
        if (i < total - 1) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      const combined = [...files, ...newFiles];
      setFiles(combined);
      saveIndex(combined);
      setStats({
        total: combined.length,
        embedded: combined.filter((f) => f.embedding).length,
        failed: combined.filter((f) => !f.embedding).length,
      });
      setIsIndexing(false);
      setProgressFile("");

      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [files]
  );

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    const key = localStorage.getItem("deepfind_api_key");
    if (!key) {
      setError("Please set your Gemini API key first.");
      return;
    }

    const embeddedFiles = files.filter((f) => f.embedding);
    if (embeddedFiles.length === 0) {
      setError("No indexed files to search. Add some files first.");
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const { embedText } = await import("@/lib/embeddings");
      const ai = new GoogleGenAI({ apiKey: key });
      const queryEmbedding = await embedText(ai, searchQuery);
      const results = searchByEmbedding(queryEmbedding, embeddedFiles, 20);
      setSearchResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, files]);

  const handleClear = useCallback(() => {
    setFiles([]);
    setSearchResults(null);
    setStats({ total: 0, embedded: 0, failed: 0 });
    clearIndex();
  }, []);

  const embeddedCount = useMemo(
    () => files.filter((f) => f.embedding).length,
    [files]
  );

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            <span className="text-cyan-400">Deep</span>Find
          </h1>
          <span className="rounded-full border border-border bg-secondary/50 px-2.5 py-0.5 text-[10px] text-muted-foreground">
            Powered by Gemini Embedding 2
          </span>
        </div>
        <div className="flex items-center gap-3">
          {stats.total > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-cyan-400 font-medium">{stats.embedded}</span> embedded
              {stats.failed > 0 && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="text-destructive">{stats.failed}</span> failed
                </>
              )}
            </div>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <Settings className="size-4" />
          </button>
        </div>
      </header>

      {/* Settings panel */}
      {showSettings && (
        <div className="border-b border-border bg-secondary/30 px-5 py-3">
          <div className="flex items-center gap-2 max-w-2xl">
            <label className="text-xs text-muted-foreground whitespace-nowrap">
              Gemini API Key:
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              className="h-8 flex-1 rounded-md border border-input bg-background px-3 text-xs focus:border-cyan-500/50 focus:outline-none"
            />
            <button
              onClick={handleSaveApiKey}
              className="h-8 rounded-md bg-cyan-700 px-4 text-xs font-medium text-white hover:bg-cyan-800 transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setShowSettings(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground max-w-2xl">
            Get a free key at{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              aistudio.google.com/apikey
            </a>
            . Your key is stored locally in your browser and only sent to Google&apos;s Gemini API.
          </p>
        </div>
      )}

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Search + Add bar */}
        <div className="border-b border-border px-5 py-3">
          <div className="flex gap-3 max-w-3xl mx-auto">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder={
                  embeddedCount > 0
                    ? "Search by meaning across all your files..."
                    : "Add files to start searching..."
                }
                disabled={embeddedCount === 0 || isSearching}
                className={cn(
                  "h-10 w-full rounded-lg border border-input bg-background pl-9 pr-4 text-sm",
                  "focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/20",
                  embeddedCount === 0 && "cursor-not-allowed opacity-50"
                )}
              />
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              {isSearching && (
                <Loader2 className="absolute right-3 top-3 size-4 animate-spin text-cyan-500" />
              )}
            </div>

            <button
              onClick={handleFileSelect}
              disabled={isIndexing}
              className={cn(
                "flex h-10 items-center gap-2 rounded-lg border border-dashed border-border px-4 text-sm transition-colors",
                isIndexing
                  ? "cursor-not-allowed opacity-50"
                  : "hover:border-cyan-500/50 hover:bg-cyan-500/5"
              )}
            >
              {isIndexing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span className="text-xs">{Math.round(progress)}%</span>
                </>
              ) : (
                <>
                  <FolderOpen className="size-4" />
                  Add Folder
                </>
              )}
            </button>

            {files.length > 0 && (
              <button
                onClick={handleClear}
                className="flex h-10 items-center rounded-lg border border-border px-3 text-muted-foreground hover:border-destructive/50 hover:text-destructive transition-colors"
                title="Clear all indexed files"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>

          {/* Progress bar */}
          {isIndexing && (
            <div className="max-w-3xl mx-auto mt-2">
              <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-cyan-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground truncate">
                Embedding: {progressFile}
              </p>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          // @ts-expect-error webkitdirectory is non-standard
          webkitdirectory=""
          className="hidden"
          onChange={handleFilesSelected}
        />

        {/* Results / File list */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {searchResults ? (
            <div className="max-w-3xl mx-auto p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium">
                  {searchResults.length} results for &ldquo;{searchQuery}&rdquo;
                </h2>
                <button
                  onClick={() => {
                    setSearchResults(null);
                    setSearchQuery("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear results
                </button>
              </div>
              <div className="space-y-2">
                {searchResults.map((file) => (
                  <div
                    key={file.id}
                    className="glass-card flex items-center gap-3 rounded-lg p-3"
                  >
                    <span
                      className="flex size-9 items-center justify-center rounded-md bg-secondary/50"
                      style={{ color: FILE_TYPE_COLORS[file.type] }}
                    >
                      {FILE_TYPE_ICONS[file.type]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {file.path}
                        <span className="mx-1.5 opacity-40">·</span>
                        {formatSize(file.size)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary"
                        title={`${(file.score * 100).toFixed(1)}% similarity`}
                      >
                        <div
                          className="h-full rounded-full bg-cyan-500"
                          style={{ width: `${file.score * 100}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-xs font-medium text-cyan-400">
                        {(file.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : files.length > 0 ? (
            <div className="max-w-3xl mx-auto p-5">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Indexed files ({files.length})
              </h2>
              <div className="space-y-1">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-secondary/30 transition-colors"
                  >
                    <span style={{ color: FILE_TYPE_COLORS[file.type] }}>
                      {FILE_TYPE_ICONS[file.type]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs">{file.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {file.path}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {formatSize(file.size)}
                    </span>
                    {file.embedding ? (
                      <Eye className="size-3 text-cyan-500/50" />
                    ) : (
                      <span className="text-[10px] text-destructive/60">✗</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center h-full">
              <div className="text-center px-4">
                <div className="mx-auto mb-5 flex size-20 items-center justify-center rounded-2xl border border-dashed border-border">
                  <Search className="size-8 text-muted-foreground/50" />
                </div>
                <h2 className="text-lg font-medium mb-2">Search your files by meaning</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                  Point DeepFind at a folder. It embeds every file — documents, images, audio, video, PDFs — into a unified semantic space using Gemini Embedding 2.
                </p>
                <button
                  onClick={handleFileSelect}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-cyan-800 transition-colors"
                >
                  <FolderOpen className="size-4" />
                  Choose a folder
                  <ArrowRight className="size-4" />
                </button>
                <p className="mt-4 text-[10px] text-muted-foreground/50">
                  Your files never leave your machine — only embeddings are generated via Google&apos;s API
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 backdrop-blur-sm">
            <p className="text-xs text-destructive">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-destructive/60 hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
