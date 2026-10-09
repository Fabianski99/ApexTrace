import { useCallback, useEffect, useRef, useState } from 'react';
import { percentAtSeconds, secondsAtPercent } from '../utils/lapPlayback';

/**
 * Only commits progress to React ~30 times/sec. There is no RAF loop when
 * playback is paused or no lap is selected. Closes cleanly on navigation.
 */
export default function useLapPlayback(lap) {
  const [percent, setPercent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const current = useRef(0);
  const seek = useCallback(value => {
    const next = Math.max(0, Math.min(100, Number(value) || 0));
    current.current = next;
    setPercent(next);
  }, []);

  useEffect(() => {
    setPlaying(false);
    seek(0);
  }, [lap?.id, seek]);

  useEffect(() => {
    if (!playing || !lap || !(lap.time > 0)) return undefined;
    let raf = 0;
    let previous = null;
    let accumulated = 0;
    let lastCommit = 0;
    const tick = now => {
      if (previous === null) previous = now;
      // Discard long frame stalls instead of racing ahead after Alt+Tab.
      accumulated += Math.min(100, Math.max(0, now - previous));
      previous = now;
      if (now - lastCommit >= 33) {
        const elapsed = secondsAtPercent(lap, current.current) + accumulated / 1000 * rate;
        accumulated = 0;
        lastCommit = now;
        const next = elapsed >= lap.time ? 100 : percentAtSeconds(lap, elapsed);
        seek(next);
        if (next >= 100) { setPlaying(false); return; }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing, lap, rate, seek]);

  useEffect(() => {
    const pauseWhenHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);

  const playPause = useCallback(() => {
    if (!lap) return;
    if (current.current >= 100) seek(0);
    setPlaying(value => !value);
  }, [lap, seek]);

  const reset = useCallback(() => { setPlaying(false); seek(0); }, [seek]);
  const stop = useCallback(() => setPlaying(false), []);
  return { percent, playing, rate, setRate, seek, playPause, reset, stop };
}
