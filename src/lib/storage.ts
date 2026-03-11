import type { FileEntry } from "./embeddings";

const STORAGE_KEY = "deepfind_index";

export function saveIndex(files: FileEntry[]): void {
  try {
    const data = JSON.stringify(files);
    localStorage.setItem(STORAGE_KEY, data);
  } catch {
    console.warn("Failed to save index to localStorage");
  }
}

export function loadIndex(): FileEntry[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data) as FileEntry[];
  } catch {
    return [];
  }
}

export function clearIndex(): void {
  localStorage.removeItem(STORAGE_KEY);
}
