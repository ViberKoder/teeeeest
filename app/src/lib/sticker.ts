import tgsUrl from '../assets/egghatch.tgs?url';

/** A .tgs sticker is a gzip-compressed Lottie file. Decode it with the browser's own decompressor. */
let cache: Promise<unknown | null> | undefined;

export function loadEggHatch(): Promise<unknown | null> {
  cache ??= (async () => {
    try {
      const res = await fetch(tgsUrl);
      if (!res.ok || typeof DecompressionStream === 'undefined') return null;
      const stream = res.body!.pipeThrough(new DecompressionStream('gzip'));
      return JSON.parse(await new Response(stream).text());
    } catch {
      return null; // the app works without the animation
    }
  })();
  return cache;
}

/** Frames of the egghatch sticker (60 fps): 0 chick, 30 whole egg, 60-100 cracking, ~120 hatched. */
export const FRAMES = { egg: 28, cracked: 64, hatched: 140, end: 179 } as const;
