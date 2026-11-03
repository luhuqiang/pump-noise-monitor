/**
 * 谱线显示插值：精细谱每 0.68 s 才更新一次，直接重绘会"一秒一跳"。
 * 这里按屏幕刷新率把显示值朝目标值收敛，数据刷新率不变，判决不受影响。
 * 相邻两帧差超过 snapDelta 时直接吸附到目标值：启动、冲击、换挡这类
 * 真实突变不能被时间常数抹平；告警与报告截图始终取原始帧。
 */
export function createSpectrumTween(tauMs = 140, snapDelta = 12) {
  let shown: Float32Array | null = null;
  let lastMs = 0;

  return {
    step(target: Float32Array, nowMs: number): Float32Array {
      if (!target.length) return target;
      if (!shown || shown.length !== target.length) {
        shown = new Float32Array(target);
        lastMs = nowMs;
        return shown;
      }
      const dt = Math.min(200, Math.max(0, nowMs - lastMs));
      lastMs = nowMs;
      const a = 1 - Math.exp(-dt / tauMs);
      for (let i = 0; i < shown.length; i++) {
        const next = target[i];
        if (next === undefined || !Number.isFinite(next)) continue;
        const prev = shown[i] ?? next;
        shown[i] = Math.abs(next - prev) >= snapDelta ? next : prev + (next - prev) * a;
      }
      return shown;
    },
    reset() {
      shown = null;
      lastMs = 0;
    },
  };
}
