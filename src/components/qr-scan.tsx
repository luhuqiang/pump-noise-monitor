import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlClass } from "@/components/panel";

type ScanKind = "auth" | "machine";

const COPY: Record<ScanKind, { title: string; hint: string }> = {
  auth: {
    title: "扫描授权码",
    hint: "支持相机实时扫描，也支持从相册选择图片识别。",
  },
  machine: {
    title: "扫描机器码",
    hint: "对准青色实心边框的机器码二维码。",
  },
};

export function QrScan({
  kind,
  onText,
  className,
}: {
  kind: ScanKind;
  onText: (text: string) => void;
  className?: string;
}) {
  const [phase, setPhase] = useState<"idle" | "camera">("idle");
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPhase("idle");
  };

  const finish = (text: string) => {
    const next = text.trim();
    if (!next) return;
    stopCamera();
    setError("");
    onTextRef.current(next);
  };

  useEffect(() => {
    if (phase !== "camera") return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const stream = streamRef.current;
    if (!video || !canvas || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => setError("相机启动失败，请改用相册图片。"));

    const tick = () => {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx && video.readyState >= 2 && video.videoWidth > 0) {
        const scale = Math.min(1, 900 / Math.max(video.videoWidth, video.videoHeight));
        const width = Math.max(1, Math.round(video.videoWidth * scale));
        const height = Math.max(1, Math.round(video.videoHeight * scale));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        ctx.drawImage(video, 0, 0, width, height);
        const pixels = ctx.getImageData(0, 0, width, height);
        const found = jsQR(pixels.data, width, height, { inversionAttempts: "attemptBoth" });
        if (found?.data) {
          finish(found.data);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      video.srcObject = null;
    };
    // finish/stopCamera 只在相机运行时使用，故意不加入依赖避免反复重启。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const openCamera = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("当前环境不支持相机，请改用相册图片或手动输入。");
      return;
    }
    try {
      // 用最简 constraints，WebView 和浏览器都能工作，让系统自动选后摄
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
      });
      streamRef.current = stream;
      setPhase("camera");
    } catch {
      setError("无法打开相机（可能被系统拒绝），请改用相册图片或手动输入。");
    }
  };

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    setError("");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d", { willReadFrequently: true });
        if (!canvas || !ctx) throw new Error("无法读取图片");
        const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        const pixels = ctx.getImageData(0, 0, width, height);
        const found = jsQR(pixels.data, width, height, { inversionAttempts: "attemptBoth" });
        if (found?.data) finish(found.data);
        else setError("这张图片里没有识别到完整的二维码，请换一张更清晰、正对的图片。");
      } catch {
        setError("图片解析失败，请换一张 JPG / PNG 图片。");
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("图片读取失败，请换一张 JPG / PNG 图片。");
    };
    img.src = url;
  };

  const copy = COPY[kind];

  return (
    <div className={cn("rounded-xl border border-line bg-bg p-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-fg">{copy.title}</p>
          <p className="text-[11px] text-muted">{copy.hint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={controlClass}
            onClick={() => (phase === "camera" ? stopCamera() : void openCamera())}
          >
            {phase === "camera" ? (
              <CameraOff className="size-4" aria-hidden="true" />
            ) : (
              <Camera className="size-4" aria-hidden="true" />
            )}
            {phase === "camera" ? "关闭相机" : "相机扫码"}
          </button>
          <button type="button" className={controlClass} onClick={() => fileRef.current?.click()}>
            <ImagePlus className="size-4" aria-hidden="true" />
            相册图片
          </button>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          pickFile(file);
        }}
      />
      {phase === "camera" ? (
        <div className="relative mt-3 overflow-hidden rounded-lg border border-cyan-700/40 bg-ink">
          <video ref={videoRef} playsInline muted className="h-56 w-full object-cover" />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-3 py-1.5 text-center text-[11px] text-white">
            将二维码放入取景框，识别后自动填入
          </span>
        </div>
      ) : null}
      <canvas ref={canvasRef} className="hidden" />
      {error ? (
        <p className="mt-2 text-xs text-alarm" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
