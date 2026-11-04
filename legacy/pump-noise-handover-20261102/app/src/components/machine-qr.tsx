import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 机器码二维码：青色、实心边框、方正卡片，和琥珀色虚线授权码二维码一眼可分。
 */
export function MachineQr({
  machine,
  size = 260,
  className,
}: {
  machine: string;
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(machine, {
      margin: 2,
      width: size,
      errorCorrectionLevel: "M",
      color: { dark: "#0E7490", light: "#ECFEFF" },
    })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(""));
    return () => {
      alive = false;
    };
  }, [machine, size]);

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-2 rounded-md border-2 border-solid border-cyan-700/70 bg-cyan-50 p-3",
        className,
      )}
      data-qr-kind="machine"
    >
      <span className="inline-flex items-center gap-1 rounded-sm bg-cyan-700 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-white">
        <Cpu className="size-3" aria-hidden="true" />
        机器码 · 设备身份
      </span>
      {src ? (
        <img
          src={src}
          alt="机器码二维码（青色实心边框）"
          width={size}
          height={size}
          className="max-w-full rounded-sm bg-cyan-50"
        />
      ) : (
        <div
          className="flex items-center justify-center text-xs text-cyan-900/60"
          style={{ width: size, height: size }}
        >
          正在生成二维码…
        </div>
      )}
      <span className="font-mono text-[10px] tracking-widest text-cyan-800">MACHINE · 16 HEX</span>
    </div>
  );
}
