import type { RngContext } from "@/lib/runtime/types";

function hashString(input: string) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function keyFor(ctx: RngContext, cellId: string, label: string) {
  return `${ctx.seed}:${ctx.version}:${cellId}:${label}`;
}

export function createRngContext(seed: number, version = 0): RngContext {
  return {
    seed,
    version,
    gaussianCache: new Map(),
    uniformCache: new Map(),
  };
}

export function getUniformMatrix(
  ctx: RngContext,
  cellId: string,
  label: string,
  rows: number,
  columns: number,
) {
  const key = keyFor(ctx, cellId, label);
  const cached = ctx.uniformCache.get(key);

  if (cached && cached.length === rows && cached[0]?.length === columns) {
    return cached;
  }

  const random = mulberry32(hashString(key));
  const matrix = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => random()),
  );

  ctx.uniformCache.set(key, matrix);
  return matrix;
}

export function getGaussianMatrix(
  ctx: RngContext,
  cellId: string,
  label: string,
  rows: number,
  columns: number,
) {
  const key = keyFor(ctx, cellId, label);
  const cached = ctx.gaussianCache.get(key);

  if (cached && cached.length === rows && cached[0]?.length === columns) {
    return cached;
  }

  const random = mulberry32(hashString(key));
  const matrix = Array.from({ length: rows }, () => {
    const values: number[] = [];

    while (values.length < columns) {
      const u1 = Math.max(random(), 1e-12);
      const u2 = random();
      const magnitude = Math.sqrt(-2 * Math.log(u1));
      values.push(magnitude * Math.cos(2 * Math.PI * u2));

      if (values.length < columns) {
        values.push(magnitude * Math.sin(2 * Math.PI * u2));
      }
    }

    return values;
  });

  ctx.gaussianCache.set(key, matrix);
  return matrix;
}
