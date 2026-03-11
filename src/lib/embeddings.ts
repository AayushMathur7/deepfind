import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-embedding-2-preview";

export type FileEntry = {
  id: string;
  name: string;
  path: string;
  type: "text" | "image" | "audio" | "video" | "pdf" | "unknown";
  size: number;
  embedding?: number[];
  error?: string;
};

/**
 * Supported file types per Gemini Embedding 2 docs:
 * - Images: PNG, JPEG only (max 6 per request)
 * - Audio: MP3, WAV only (max 80 seconds, 1 per request)
 * - Video: MPEG, MP4 only (max 80s with audio, 120s without, 1 per request)
 * - PDF: 1 per request, max 6 pages
 * - Text: up to 8192 tokens
 */

const TYPE_MAP: Record<string, FileEntry["type"]> = {
  // Text
  ".txt": "text", ".md": "text", ".json": "text", ".csv": "text",
  ".tsx": "text", ".ts": "text", ".js": "text", ".py": "text",
  ".html": "text", ".css": "text", ".yml": "text", ".yaml": "text",
  ".toml": "text", ".xml": "text", ".svg": "text", ".rs": "text",
  ".go": "text", ".java": "text", ".rb": "text", ".sh": "text",
  // Images (PNG, JPEG only per docs)
  ".png": "image", ".jpg": "image", ".jpeg": "image",
  // Audio (MP3, WAV only per docs)
  ".mp3": "audio", ".wav": "audio",
  // Video (MPEG, MP4 only per docs)
  ".mp4": "video", ".mpeg": "video",
  // Documents
  ".pdf": "pdf",
};

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp3": "audio/mp3",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".mpeg": "video/mpeg",
  ".pdf": "application/pdf",
};

export function getFileType(filename: string): FileEntry["type"] {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return TYPE_MAP[ext] || "unknown";
}

export function getMimeType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

export function isSupported(filename: string): boolean {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return ext in TYPE_MAP;
}

/**
 * Embed text content.
 * Optionally provide a task instruction for better retrieval quality.
 * e.g. "retrieval_document", "retrieval_query", "semantic_similarity"
 */
export async function embedText(
  ai: GoogleGenAI,
  text: string,
  taskType?: string
): Promise<number[]> {
  const config: Record<string, unknown> = {};
  if (taskType) {
    config.taskType = taskType;
  }

  const response = await ai.models.embedContent({
    model: MODEL,
    contents: text,
    config: Object.keys(config).length > 0 ? config : undefined,
  });
  return response.embeddings?.[0]?.values ?? [];
}

/**
 * Embed a multimodal file (image, audio, video, PDF).
 *
 * Constraints:
 * - Images: PNG/JPEG, max 6 per request
 * - Audio: MP3/WAV, max 80 seconds, 1 per request
 * - Video: MP4/MPEG, max 80s (with audio) / 120s (without), 1 per request
 * - PDF: max 1 per request, max 6 pages
 * - Total max 8192 input tokens per request
 */
export async function embedFile(
  ai: GoogleGenAI,
  fileBytes: Uint8Array,
  mimeType: string
): Promise<number[]> {
  const base64Data = uint8ToBase64(fileBytes);

  const response = await ai.models.embedContent({
    model: MODEL,
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
        ],
      },
    ],
  });
  return response.embeddings?.[0]?.values ?? [];
}

/**
 * Embed text + file together (interleaved multimodal).
 * Useful for providing search context alongside a file.
 */
export async function embedTextAndFile(
  ai: GoogleGenAI,
  text: string,
  fileBytes: Uint8Array,
  mimeType: string
): Promise<number[]> {
  const base64Data = uint8ToBase64(fileBytes);

  const response = await ai.models.embedContent({
    model: MODEL,
    contents: [
      {
        parts: [
          { text },
          {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
        ],
      },
    ],
  });
  return response.embeddings?.[0]?.values ?? [];
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
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

/**
 * Max file sizes for embedding.
 * Text: 50KB (will be truncated to 8000 chars)
 * Binary: 20MB (API limit for inline data)
 */
export const MAX_SIZES: Record<FileEntry["type"], number> = {
  text: 50 * 1024,
  image: 20 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  video: 20 * 1024 * 1024,
  pdf: 20 * 1024 * 1024,
  unknown: 0,
};
