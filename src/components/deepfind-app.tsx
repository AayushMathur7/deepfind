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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type FileEntry,
  getFileType,
  getMimeType,
  cosineSimilarity,
  searchByEmbedding,
} from "@/lib/embeddings";
import { projectUMAP2D } from "@/lib/umap";
import { saveIndex, loadIndex, clearIndex } from "@/lib/storage";
import { EmbeddingMap } from "./embedding-map";

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

export function DeepFindApp() {
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<FileEntry & { score: number }> | null
  >(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [umapPoints, setUmapPoints] = useState<
    Array<{ x: number; y: number }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved index on mount
  useEffect(() => {
    const saved = loadIndex();
    if (saved.length > 0) {
      setFiles(saved);
      recomputeUMAP(saved);
    }
    const savedKey = localStorage.getItem("deepfind_api_key") ?? "";
    if (savedKey) setApiKey(savedKey);
    else setShowSettings(true);
  }, []);

  function recomputeUMAP(entries: FileEntry[]) {
    const withEmbeddings = entries.filter((f) => f.embedding);
    if (withEmbeddings.length < 2) {
      setUmapPoints([]);
      return;
    }
    const embeddings = withEmbeddings.map((f) => f.embedding!);
    const points = projectUMAP2D(embeddings);
    setUmapPoints(points);

    // Update file entries with UMAP coords
    const updated = entries.map((f) => {
      if (!f.embedding) return f;
      const idx = withEmbeddings.indexOf(f);
      if (idx === -1) return f;
      return { ...f, umapX: points[idx].x, umapY: points[idx].y };
    });
    setFiles(updated);
  }

  const handleSaveApiKey = useCallback(() => {
    localStorage.setItem("deepfind_api_key", apiKey);
    setShowSettings(false);
    setError(null);
  }, [apiKey]);

  const handleFileSelect = useCallback(async () => {
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
      const client = new GoogleGenAI({ apiKey: key });

      const newFiles: FileEntry[] = [];
      const total = selectedFiles.length;

      for (let i = 0; i < total; i++) {
        const file = selectedFiles[i];
        const fileType = getFileType(file.name);
        const mimeType = getMimeType(file.name);

        const entry: FileEntry = {
          id: crypto.randomUUID(),
          name: file.name,
          path: file.webkitRelativePath || file.name,
          type: fileType,
          size: file.size,
        };

        try {
          if (fileType === "text") {
            const text = await file.text();
            const truncated = text.slice(0, 8000);
            const { embedText } = await import("@/lib/embeddings");
            entry.embedding = await embedText(client, truncated);
          } else if (
            fileType === "image" ||
            fileType === "audio" ||
            fileType === "video" ||
            fileType === "pdf"
          ) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const { embedFile } = await import("@/lib/embeddings");
            entry.embedding = await embedFile(client, bytes, mimeType);
          }
        } catch (err) {
          console.warn(`Failed to embed ${file.name}:`, err);
        }

        newFiles.push(entry);
        setProgress(((i + 1) / total) * 100);
      }

      const combined = [...files, ...newFiles];
      setFiles(combined);
      saveIndex(combined);
      recomputeUMAP(combined);
      setIsIndexing(false);

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
      const client = new GoogleGenAI({ apiKey: key });
      const queryEmbedding = await embedText(client, searchQuery);
      const results = searchByEmbedding(queryEmbedding, embeddedFiles, 20);
      setSearchResults(results);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Search failed."
      );
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, files]);

  const handleClear = useCallback(() => {
    setFiles([]);
    setSearchResults(null);
    setUmapPoints([]);
    setSelectedFile(null);
    clearIndex();
  }, []);

  const embeddedCount = useMemo(
    () => files.filter((f) => f.embedding).length,
    [files]
  );

  const filesWithCoords = useMemo(
    () => files.filter((f) => f.umapX !== undefined),
    [files]
  );

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">
            <span className="text-cyan-400">Deep</span>Find
          </h1>
          <span className="rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-[10px] text-muted-foreground">
            Gemini Embedding 2
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {embeddedCount} files indexed
          </span>
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
        <div className="border-b border-border bg-secondary/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">
              Gemini API Key:
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs"
            />
            <button
              onClick={handleSaveApiKey}
              className="h-8 rounded-md bg-cyan-700 px-3 text-xs text-white hover:bg-cyan-800 transition-colors"
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
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Get a free key at{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              aistudio.google.com/apikey
            </a>
            . Your key stays in your browser — never sent to any server except Google&apos;s API.
          </p>
        </div>
      )}

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        {/* Left panel: Controls + File list */}
        <div className="flex w-80 flex-col border-r border-border">
          {/* Add files + Search */}
          <div className="space-y-2 border-b border-border p-3">
            <div className="flex gap-2">
              <button
                onClick={handleFileSelect}
                disabled={isIndexing}
                className={cn(
                  "flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs transition-colors",
                  isIndexing
                    ? "cursor-not-allowed opacity-50"
                    : "hover:border-cyan-500/50 hover:bg-cyan-500/5"
                )}
              >
                {isIndexing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Indexing... {Math.round(progress)}%
                  </>
                ) : (
                  <>
                    <FolderOpen className="size-4" />
                    Add Files
                  </>
                )}
              </button>
              {files.length > 0 && (
                <button
                  onClick={handleClear}
                  className="flex h-9 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted-foreground hover:border-destructive/50 hover:text-destructive transition-colors"
                >
                  <Trash2 className="size-3.5" />
                </button>
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

            {/* Progress bar */}
            {isIndexing && (
              <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-cyan-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="Search by meaning..."
                disabled={embeddedCount === 0}
                className={cn(
                  "h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-xs",
                  "focus:border-cyan-500/50 focus:ring-0 focus-visible:ring-0",
                  embeddedCount === 0 && "cursor-not-allowed opacity-50"
                )}
              />
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              {isSearching && (
                <Loader2 className="absolute right-2.5 top-2.5 size-4 animate-spin text-cyan-500" />
              )}
            </div>
          </div>

          {/* File list / Search results */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {searchResults ? (
              <div className="p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {searchResults.length} results
                  </span>
                  <button
                    onClick={() => setSearchResults(null)}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-1">
                  {searchResults.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => setSelectedFile(file)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                        selectedFile?.id === file.id
                          ? "bg-cyan-500/10 border border-cyan-500/30"
                          : "hover:bg-secondary/50"
                      )}
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
                      <span className="shrink-0 rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400">
                        {(file.score * 100).toFixed(0)}%
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-2">
                <span className="px-1 text-[11px] font-medium text-muted-foreground">
                  All files ({files.length})
                </span>
                <div className="mt-1 space-y-0.5">
                  {files.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => setSelectedFile(file)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                        selectedFile?.id === file.id
                          ? "bg-cyan-500/10 border border-cyan-500/30"
                          : "hover:bg-secondary/50"
                      )}
                    >
                      <span style={{ color: FILE_TYPE_COLORS[file.type] }}>
                        {FILE_TYPE_ICONS[file.type]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs">{file.name}</p>
                      </div>
                      {file.embedding ? (
                        <Eye className="size-3 text-cyan-500/50" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right panel: Visualization */}
        <div className="flex min-h-0 flex-1 flex-col">
          {filesWithCoords.length > 1 ? (
            <EmbeddingMap
              files={filesWithCoords}
              selectedFile={selectedFile}
              searchResults={searchResults}
              onSelectFile={setSelectedFile}
              typeColors={FILE_TYPE_COLORS}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl border border-dashed border-border">
                  <Search className="size-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Add files to see them in embedding space
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground/60">
                  Files are embedded with Gemini Embedding 2 and projected with UMAP
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 backdrop-blur-sm">
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
