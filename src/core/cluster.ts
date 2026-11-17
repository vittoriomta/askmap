// Step 2b: k-means++ on normalized vectors (cosine). Small, dependency-free and deterministic
// for a given seed, so two runs over the same logs draw the same map.

export function dot(a: number[], b: number[]) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

function normalize(v: number[]) {
  const n = Math.sqrt(dot(v, v)) || 1
  return v.map((x) => x / n)
}

/** Mulberry32: a tiny seeded random, for reproducible clusters. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function kmeans(vectors: number[][], k: number, seed = 7, iterations = 40) {
  const n = vectors.length
  k = Math.max(1, Math.min(k, n))
  const rand = rng(seed)
  // k-means++ seeding: spread the first centroids out.
  const centroids: number[][] = [vectors[Math.floor(rand() * n)]]
  const dist = new Array<number>(n).fill(Infinity)
  while (centroids.length < k) {
    const last = centroids[centroids.length - 1]
    let total = 0
    for (let i = 0; i < n; i++) {
      dist[i] = Math.min(dist[i], 1 - dot(vectors[i], last))
      total += dist[i]
    }
    let r = rand() * total
    let pick = 0
    for (; pick < n - 1; pick++) if ((r -= dist[pick]) <= 0) break
    centroids.push(vectors[pick])
  }
  const assign = new Array<number>(n).fill(0)
  for (let it = 0; it < iterations; it++) {
    let moved = 0
    for (let i = 0; i < n; i++) {
      let best = 0
      let bestSim = -Infinity
      for (let c = 0; c < k; c++) {
        const sim = dot(vectors[i], centroids[c])
        if (sim > bestSim) (bestSim = sim), (best = c)
      }
      if (assign[i] !== best) (assign[i] = best), moved++
    }
    for (let c = 0; c < k; c++) {
      const members = vectors.filter((_, i) => assign[i] === c)
      if (!members.length) continue
      const sum = new Array<number>(members[0].length).fill(0)
      for (const m of members) for (let d = 0; d < m.length; d++) sum[d] += m[d]
      centroids[c] = normalize(sum)
    }
    if (it > 0 && moved === 0) break
  }
  return { assign, centroids }
}

/** Indices sorted by similarity to a vector, most similar first. */
export function nearest(vectors: number[][], to: number[], count: number, exclude = new Set<number>()) {
  return vectors
    .map((v, i) => [i, dot(v, to)] as const)
    .filter(([i]) => !exclude.has(i))
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([i]) => i)
}

/** About 40 conversations per base cluster, like the Clio paper, within sane bounds. */
export const baseK = (n: number) => Math.max(3, Math.min(120, Math.round(n / 40)))
export const topK = (k: number) => Math.max(2, Math.min(12, Math.round(Math.sqrt(k) * 1.4)))
