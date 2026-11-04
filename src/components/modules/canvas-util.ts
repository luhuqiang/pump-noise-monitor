/**
 * Canvas 通用工具：DPR 适配 + 墨纸配色绘制 + 静态层缓存。
 *
 * PRD §5.2 硬约束：
 *  - DPR 上限 2
 *  - canvas 用 {alpha:false}（不透明，节省合成成本）
 *  - L3 层（坐标轴/网格/刻度）只 resize 时重绘到 OffscreenCanvas
 *
 * R2 设计约束：无渐变、无发光、无投影，仅 1px 硬线。
 */

/**
 * 获取当前主题的颜色值（从 CSS 变量读取，适配深浅色）。
 * 每个 readout 帧调用一次可接受——getComputedStyle 对同一文档缓存命中好。
 */
export function getColors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    ink: cs.getPropertyValue("--ink").trim() || "#1b211e",
    paper: cs.getPropertyValue("--paper").trim() || "#efece3",
    line: cs.getPropertyValue("--line").trim() || "#d5d0c1",
    mist: cs.getPropertyValue("--mist").trim() || "#5c635c",
    brass: cs.getPropertyValue("--brass").trim() || "#9c7b3f",
    ok: cs.getPropertyValue("--ok").trim() || "#33584a",
    low: cs.getPropertyValue("--low").trim() || "#7a5c24",
    bad: cs.getPropertyValue("--bad").trim() || "#8a3f32",
  } as const;
}

/** 旧兼容（固定浅色值）——新组件用 getColors() */
export const COLORS = {
  ink: "#1b211e",
  paper: "#efece3",
  line: "#d5d0c1",
  mist: "#5c635c",
  brass: "#9c7b3f",
  ok: "#33584a",
  low: "#7a5c24",
  bad: "#8a3f32",
} as const;

/**
 * 设置 canvas 的 DPR 缩放，返回适配好的 2d context。
 * PRD 5.2：{alpha:false}，{willReadFrequently:false}，DPR ≤ 2。
 */
export function setupCanvas(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: false })!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * L3 静态层管理器：在 OffscreenCanvas 上绘制网格/坐标轴/刻度，
 * 只在 resize 时重建。采集期每帧直接 drawImage 复制到主 canvas。
 *
 * 用法：
 *   const staticLayer = useRef<StaticLayerManager | null>(null);
 *   // resize 时：
 *   staticLayer.current = new StaticLayerManager(w, h, () => drawStaticLayer(ctx, w, h));
 *   // 每帧绘制：
 *   staticLayer.current?.blit(ctx);  // 先贴静态层，再动态层
 */
export class StaticLayerManager {
  private offscreen: HTMLCanvasElement;
  private dirty = true;

  constructor(
    private w: number,
    private h: number,
    private painter: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  ) {
    this.offscreen = document.createElement("canvas");
    this.rebuild();
  }

  private rebuild() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.offscreen.width = Math.round(this.w * dpr);
    this.offscreen.height = Math.round(this.h * dpr);
    const ctx = this.offscreen.getContext("2d", { alpha: false, willReadFrequently: false })!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = getColors().paper;
    ctx.fillRect(0, 0, this.w, this.h);
    this.painter(ctx, this.w, this.h);
    this.dirty = false;
  }

  resize(w: number, h: number) {
    if (w === this.w && h === this.h && !this.dirty) return;
    this.w = w;
    this.h = h;
    this.rebuild();
  }

  /** 主题变化时标记 dirty——延迟到下一帧 blit 时重建，等父组件先把 data-theme 写到 <html> */
  markDirty() {
    this.dirty = true;
  }

  blit(ctx: CanvasRenderingContext2D) {
    if (this.dirty) this.rebuild();
    // 源区域必须取 offscreen 的实际像素尺寸（dpr 缩放后），否则会裁剪放大
    ctx.drawImage(
      this.offscreen,
      0,
      0,
      this.offscreen.width,
      this.offscreen.height,
      0,
      0,
      this.w,
      this.h,
    );
  }
}
