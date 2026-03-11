import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-embedding-2-preview";

export type FileEntry = {
  id: string;
  name: string;
  path: string;
  type: "text" | "image" | "audio" | "video" | "pdf" | "unknown";
  size: number;
  embedding?: number[];
  umapX?: number;
  umapY?: number;
  umapZ?: number;
};

export type IndexState = {
  files: FileEntry[];
  totalEmbedded: number;
  isIndexing: boolean;
  progress: number;
};

const MIME_MAP: Record<string, FileEntry["type"]> = {
  ".txt": "text",
  ".md": "text",
  ".json": "text",
  ".csv": "text",
  ".tsx": "text",
  ".ts": "text",
  ".js": "text",
  ".py": "text",
  ".html": "text",
  ".css": "text",
  ".yml": "text",
  ".yaml": "text",
  ".toml": "text",
  ".xml": "text",
  ".svg": "text",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".webp": "image",
  ".bmp": "image",
  ".mp3": "audio",
  ".wav": "audio",
  ".ogg": "audio",
  ".flac": "audio",
  ".m4a": "audio",
  ".mp4": "video",
  ".mov": "video",
  ".webm": "video",
  ".avi": "video",
  ".pdf": "pdf",
};

export function getFileType(filename: string): FileEntry["type"] {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return MIME_MAP[ext] || "unknown";
}

export function getMimeType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const mimes: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".csv": "text/csv",
    ".tsx": "text/plain",
    ".ts": "text/plain",
    ".js": "text/javascript",
    ".py": "text/x-python",
    ".html": "text/html",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".pdf": "application/pdf",
  };
  return mimes[ext] || "application/octet-stream";
}

export async function embedText(
  client: GoogleGenAI,
  text: string
): Promise<number[]> {
  const result = await client.models.embedContent({
    model: MODEL,
    contents: [text],
  });
  return result.embeddings?.[0]?.values ?? [];
}

export async function embedFile(
  client: GoogleGenAI,
  fileBytes: Uint8Array,
  mimeType: string
): Promise<number[]> {
  const result = await client.models.embedContent({
    model: MODEL,
    contents: [
      {
        inlineData: {
          data: uint8ToBase64(fileBytes),
          mimeType,
        },
      },
    ],
  });
  return result.embeddings?.[0]?.values ?? [];
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function searchByEmbedding(
  query: number[],
  files: FileEntry[],
  topK = 10
): Array<FileEntry & { score: number }> {
  return files
    .filter((f) => f.embedding)
    .map((f) => ({
      ...f,
      score: cosineSimilarity(query, f.embedding!),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
