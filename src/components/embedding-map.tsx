"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { FileEntry } from "@/lib/embeddings";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

type Props = {
  files: FileEntry[];
  selectedFile: FileEntry | null;
  searchResults: Array<FileEntry & { score: number }> | null;
  onSelectFile: (file: FileEntry) => void;
  typeColors: Record<FileEntry["type"], string>;
};

export function EmbeddingMap({
  files,
  selectedFile,
  searchResults,
  onSelectFile,
  typeColors,
}: Props) {
  const searchResultIds = useMemo(
    () => new Set(searchResults?.map((r) => r.id) ?? []),
    [searchResults]
  );

  const traces = useMemo(() => {
    // Group files by type
    const groups: Record<string, FileEntry[]> = {};
    for (const file of files) {
      if (file.umapX === undefined) continue;
      const key = file.type;
      if (!groups[key]) groups[key] = [];
      groups[key].push(file);
    }

    return Object.entries(groups).map(([type, groupFiles]) => ({
      x: groupFiles.map((f) => f.umapX!),
      y: groupFiles.map((f) => f.umapY!),
      text: groupFiles.map((f) => f.name),
      customdata: groupFiles.map((f) => f.id),
      mode: "markers" as const,
      type: "scatter" as const,
      name: type,
      marker: {
        color: groupFiles.map((f) => {
          if (selectedFile?.id === f.id) return "#22d3ee";
          if (searchResults && !searchResultIds.has(f.id)) return "rgba(100,100,100,0.2)";
          return typeColors[f.type as FileEntry["type"]] || "#9ca3af";
        }),
        size: groupFiles.map((f) => {
          if (selectedFile?.id === f.id) return 14;
          if (searchResults && searchResultIds.has(f.id)) return 10;
          return 7;
        }),
        line: {
          color: groupFiles.map((f) =>
            selectedFile?.id === f.id ? "#22d3ee" : "transparent"
          ),
          width: groupFiles.map((f) => (selectedFile?.id === f.id ? 2 : 0)),
        },
      },
      hovertemplate: "%{text}<extra></extra>",
    }));
  }, [files, selectedFile, searchResults, searchResultIds, typeColors]);

  return (
    <div className="relative flex-1">
      <Plot
        data={traces}
        layout={{
          autosize: true,
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          font: { color: "#a1a1aa", size: 11, family: "Inter, sans-serif" },
          margin: { t: 20, r: 20, b: 20, l: 20 },
          xaxis: {
            showgrid: false,
            showticklabels: false,
            zeroline: false,
          },
          yaxis: {
            showgrid: false,
            showticklabels: false,
            zeroline: false,
          },
          showlegend: true,
          legend: {
            x: 1,
            y: 1,
            xanchor: "right",
            bgcolor: "rgba(0,0,0,0.3)",
            font: { size: 10, color: "#a1a1aa" },
          },
          dragmode: "pan",
          hovermode: "closest",
        }}
        config={{
          displayModeBar: false,
          scrollZoom: true,
          responsive: true,
        }}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
        onClick={(event) => {
          const point = event.points[0];
          if (point?.customdata) {
            const file = files.find((f) => f.id === point.customdata);
            if (file) onSelectFile(file);
          }
        }}
      />

      {/* Legend overlay */}
      <div className="absolute bottom-3 left-3 rounded-lg border border-border bg-background/80 px-3 py-2 backdrop-blur-sm">
        <p className="mb-1 text-[10px] font-medium text-muted-foreground">
          UMAP projection of Gemini embeddings
        </p>
        <p className="text-[10px] text-muted-foreground/60">
          Closer dots = more semantically similar
        </p>
      </div>
    </div>
  );
}
