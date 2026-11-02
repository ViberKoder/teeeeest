import type { AnimationItem } from 'lottie-web/build/player/lottie_light';
import { useEffect, useRef, useState } from 'react';
import { FRAMES, loadEggHatch } from '../lib/sticker';
import { Egg } from './Egg';

export type StickerMode =
  | { kind: 'still'; frame: number }
  /** play [from, to] once */
  | { kind: 'play'; from: number; to: number; speed?: number }
  /** loop [from, to] */
  | { kind: 'loop'; from: number; to: number; speed?: number };

/** The egghatch.tgs sticker. Falls back to the drawn egg if the animation can't load. */
export function Sticker({ mode, size = 160, onDone, className }: { mode: StickerMode; size?: number; onDone?: () => void; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const anim = useRef<AnimationItem | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    // the animation player is loaded on demand, so the wallet itself starts without it
    void Promise.all([loadEggHatch(), import('lottie-web/build/player/lottie_light')]).then(([data, mod]) => {
      if (dead || !box.current) return;
      if (!data) return setFailed(true);
      const lottie = mod.default;
      anim.current = lottie.loadAnimation({
        container: box.current,
        renderer: 'svg',
        loop: false,
        autoplay: false,
        animationData: JSON.parse(JSON.stringify(data)),
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true },
      });
      anim.current.addEventListener('complete', () => done.current?.());
      anim.current.addEventListener('loopComplete', () => undefined);
      setReady(true);
    }).catch(() => setFailed(true));
    return () => {
      dead = true;
      anim.current?.destroy();
      anim.current = null;
    };
  }, []);

  const key = JSON.stringify(mode);
  useEffect(() => {
    const a = anim.current;
    if (!ready || !a) return;
    if (mode.kind === 'still') {
      a.stop();
      a.goToAndStop(mode.frame, true);
    } else {
      a.setSpeed(mode.speed ?? 1);
      a.loop = mode.kind === 'loop';
      a.playSegments([mode.from, mode.to], true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  if (failed) return <div className={className} style={{ width: size, height: size, display: 'grid', placeItems: 'center' }}><Egg size={size * 0.7} float /></div>;
  return <div ref={box} className={className} style={{ width: size, height: size }} aria-hidden />;
}

export { FRAMES };
