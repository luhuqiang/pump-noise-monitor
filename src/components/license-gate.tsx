import { useEffect, useState } from "react";
import { Copy, KeyRound, Lock, Mail, ShieldCheck } from "lucide-react";
import { activateLicense, groupMachine, type LicenseState } from "@/lib/license";
import { cn } from "@/lib/utils";
import { controlClass } from "@/components/panel";
import { MachineQr } from "@/components/machine-qr";
import { QrScan } from "@/components/qr-scan";

const AUTHOR_EMAIL = "luhuqiang@foxmail.com";

export function LicenseGate({
  initial,
  onActivated,
  onPreview,
}: {
  initial: LicenseState;
  onActivated: (state: LicenseState) => void;
  onPreview?: () => void;
}) {
  const [state, setState] = useState(initial);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const [flashOk, setFlashOk] = useState(false);

  useEffect(() => {
    setState(initial);
  }, [initial]);

  const copyMachine = async () => {
    const text = groupMachine(state.machine);
    try {
      await navigator.clipboard.writeText(text);
      setFlash("机器码已复制");
    } catch {
      setFlash("复制失败，请手动抄下机器码");
    }
  };

  const submit = async (input?: string) => {
    const value = (input ?? code).trim();
    if (!value) return;
    setBusy(true);
    setFlash("");
    const next = await activateLicense(value);
    setState(next);
    setBusy(false);
    setFlashOk(next.status === "valid");
    if (next.status === "valid") {
      setCode("");
      setFlash(next.message);
      onActivated(next);
    } else {
      setFlash(next.message);
    }
  };

  const expired = state.status === "expired" || state.status === "invalid";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 px-4 py-8">
      <header className="flex items-center gap-3">
        <span className="rounded-xl bg-amber/15 p-2 text-amber">
          <Lock className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-fg">听诊仪 · 离线授权</h1>
          <p className="text-sm text-muted">
            {expired ? state.message : "本机尚未授权。请把下面的机器码发给作者，获取对应授权码。"}
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex shrink-0 justify-center self-center">
            <MachineQr machine={state.machine} size={200} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">本机机器码（硬件绑定）</p>
            <p className="mt-1 break-all font-mono text-xl text-fg" data-testid="machine-code">
              {groupMachine(state.machine)}
            </p>
            <p className="mt-1 text-xs text-muted">
              {state.source === "native" ? "取自设备唯一标识与硬件信息，只能用于这台手机。" : "当前为网页预览环境，机器码由浏览器指纹生成，仅用于演示。"}
            </p>
            <p className="mt-1 text-xs text-muted">青色实心二维码是机器码，交给作者用签发器扫码即可生成授权码。</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={controlClass} onClick={() => void copyMachine()}>
                <Copy className="size-4" aria-hidden="true" />
                复制机器码
              </button>
              <a
                className={controlClass}
                href={`mailto:${AUTHOR_EMAIL}?subject=${encodeURIComponent("听诊仪授权申请")}&body=${encodeURIComponent(`机器码：${groupMachine(state.machine)}\n需要的授权时长（7天/1个月/1年/10年）：`)}`}
              >
                <Mail className="size-4" aria-hidden="true" />
                联系作者
              </a>
            </div>
            <p className="mt-2 font-mono text-xs text-muted">{AUTHOR_EMAIL}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 text-amber" aria-hidden="true" />
          <h2 className="text-sm font-medium text-fg">输入授权码</h2>
        </div>
        <p className="mt-1 text-xs text-muted">
          授权码由作者按机器码签发，激活窗口 24 小时。续期会累加剩余天数；同一份授权码在本机只能使用一次。不需要联网。
        </p>
        <QrScan
          kind="auth"
          className="mt-3"
          onText={(text) => {
            setCode(text);
            void submit(text);
          }}
        />
        <textarea
          className="mt-3 min-h-24 w-full resize-y rounded-lg border border-line bg-bg p-3 font-mono text-xs text-fg"
          placeholder="摄像头失灵时，可手动粘贴完整授权码（内容.签名）"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          spellCheck={false}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={cn(controlClass, "bg-amber text-ink")}
            onClick={() => void submit()}
            disabled={busy || !code.trim()}
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            {busy ? "校验中…" : "激活授权"}
          </button>
          {flash && (
            <span className={cn("text-xs", flashOk ? "text-signal" : "text-alarm")} role="status">
              {flash}
            </span>
          )}
        </div>
      </section>

      <footer className="text-center text-xs text-muted">
        未授权或授权过期时，本机只能显示这个解锁界面。授权、报价与定制请联系{" "}
        <span className="text-fg">{AUTHOR_EMAIL}</span>。
        {onPreview ? (
          <span className="mt-3 block">
            <button type="button" className="text-xs text-amber underline" onClick={onPreview}>
              网页预览环境 · 直接进入演示
            </button>
          </span>
        ) : null}
      </footer>
    </div>
  );
}
