import { useEffect, useRef, useState } from "react";

/**
 * 按给定帧间隔节流的 requestAnimationFrame，避免 60fps 下过度重绘。
 * 默认每 100ms 一帧（UI 图表足够流畅）。
 */
export function useFrame(intervalMs = 100) {
  const [tick, setTick] = useState(0);
  const lastRef = useRef(0);
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      if (now - lastRef.current >= intervalMs) {
        lastRef.current = now;
        setTick((t) => t + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [intervalMs]);
  return tick;
}
