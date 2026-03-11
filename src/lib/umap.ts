import { UMAP } from "umap-js";

export type Point2D = { x: number; y: number };
export type Point3D = { x: number; y: number; z: number };

export function projectUMAP2D(embeddings: number[][]): Point2D[] {
  if (embeddings.length < 2) {
    return embeddings.map(() => ({ x: 0, y: 0 }));
  }

  const nNeighbors = Math.min(15, embeddings.length - 1);
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors,
    minDist: 0.1,
    spread: 1.0,
  });

  const result = umap.fit(embeddings);
  return result.map(([x, y]) => ({ x, y }));
}

export function projectUMAP3D(embeddings: number[][]): Point3D[] {
  if (embeddings.length < 2) {
    return embeddings.map(() => ({ x: 0, y: 0, z: 0 }));
  }

  const nNeighbors = Math.min(15, embeddings.length - 1);
  const umap = new UMAP({
    nComponents: 3,
    nNeighbors,
    minDist: 0.1,
    spread: 1.0,
  });

  const result = umap.fit(embeddings);
  return result.map(([x, y, z]) => ({ x, y, z }));
}
