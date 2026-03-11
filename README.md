# DeepFind

> Search your files by meaning, not filename.

A desktop app that indexes your local files using [Gemini Embedding 2](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-embedding-2/) — Google's first natively multimodal embedding model — and lets you search across documents, images, audio, video, and PDFs using semantic similarity.

![DeepFind](https://img.shields.io/badge/Powered_by-Gemini_Embedding_2-blue)

## What it does

1. **Point it at a folder** — DeepFind scans for supported files (text, images, audio, video, PDFs)
2. **Embeds everything** — Each file is embedded into a 3072-dimensional vector using Gemini Embedding 2
3. **Search by meaning** — Type a natural language query → finds the most semantically relevant files, regardless of filename or file type
4. **Visualize** — See all your files as dots in 2D embedding space (UMAP projection). Closer dots = more semantically similar.

## Why?

Your file system organizes by folders. Your brain organizes by meaning. DeepFind bridges the gap.

- Search for "quarterly revenue analysis" and find that PDF, the spreadsheet, AND the screenshot of the chart — even if none of them have "revenue" in the filename
- Upload a photo and find related documents
- See which of your files are semantically clustered

## Stack

- **Frontend:** Next.js + TypeScript + Tailwind CSS + shadcn/ui
- **Desktop:** Tauri v2 (Rust backend, ~10MB binary)
- **Embeddings:** Gemini Embedding 2 (`gemini-embedding-2-preview`)
- **Visualization:** Plotly.js + UMAP-JS
- **Storage:** Local (your data never leaves your machine except for the Gemini API call)

## Supported file types

| Type | Extensions |
|------|-----------|
| Text | `.txt` `.md` `.json` `.csv` `.tsx` `.ts` `.js` `.py` `.html` `.css` `.yml` `.yaml` `.toml` `.xml` |
| Images | `.png` `.jpg` `.jpeg` `.gif` `.webp` `.bmp` |
| Audio | `.mp3` `.wav` `.ogg` `.flac` `.m4a` |
| Video | `.mp4` `.mov` `.webm` `.avi` |
| Documents | `.pdf` |

## Getting started

### Prerequisites

- Node.js 18+
- Rust toolchain (for Tauri) — [install](https://www.rust-lang.org/tools/install)
- A Gemini API key — [get one free](https://aistudio.google.com/apikey)

### Development

```bash
# Install dependencies
npm install

# Run as web app (no Tauri needed)
npm run dev

# Run as desktop app
npm run tauri:dev

# Build desktop app
npm run tauri:build
```

### Web-only mode

You can use DeepFind as a pure web app without Tauri. Just `npm run dev` — file selection uses the browser's native file picker with `webkitdirectory` for folder selection.

## Privacy

Your files are read locally and sent to Google's Gemini API for embedding. The embeddings are stored in your browser's localStorage. No data is sent to any other server. Your API key is stored locally in your browser.

## Cost

Gemini Embedding 2 costs $0.15 per 1M input tokens. Indexing 1,000 documents costs roughly $0.10. Images cost ~$0.00004 each.

## License

MIT

## Built by

[Aayush Mathur](https://github.com/AayushMathur7)
