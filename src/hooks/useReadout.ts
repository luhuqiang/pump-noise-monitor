/**
 * engine.readout 订阅 hook。
 *
 * 设计原则（M05 性能约束）：
 *  - Canvas 模块走自己的 rAF 循环，直接读 engine.readout，不触发 React 渲染。
 *  - DOM 模块用 useReadoutSelector，仅在所选字段变化时重渲染，
 *    保证采集期单帧 DOM 节点变化 ≤ 5。
 */
import { useSyncExternalStore, useRef } from "react";
import { engine, type Readout } from "../audio/engine.ts";

let listeners = new Set<() => void>();
let rafId = 0;

function startLoop() {
  if (rafId) return;
  const tick = () => {
    listeners.forEach((l) => l());
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1) startLoop();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) stopLoop();
  };
}

/**
 * 选择 readout 的部分字段，仅在选择结果变化时触发重渲染。
 * selector 必须是稳定引用（useCallback 包一层或定义在组件外）。
 */
export function useReadoutSelector<T>(
  selector: (r: Readout) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const cache = useRef<{ src: Readout; value: T } | null>(null);

  const getSnapshot = () => {
    const current = engine.readout;
    const c = cache.current;
    if (c && c.src === current) return c.value;
    const next = selector(current);
    if (c && isEqual(c.value, next)) {
      cache.current = { src: current, value: c.value };
      return c.value;
    }
    cache.current = { src: current, value: next };
    return next;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 取完整 readout（每帧变化，谨慎用于 DOM）。 */
export function useReadout(): Readout {
  return useSyncExternalStore(subscribe, () => engine.readout, () => engine.readout);
}
