import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Instrument } from "@/components/instrument";
import { LicenseGate } from "@/components/license-gate";
import { inspectLicense, type LicenseState } from "@/lib/license";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [state, setState] = useState<LicenseState | null>(null);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = () => {
      void inspectLicense().then((next) => {
        if (alive) setState(next);
      });
    };
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-sm text-muted">
        正在校验本机离线授权…
      </div>
    );
  }
  if (state.status === "valid" || preview) return <Instrument />;
  return (
    <LicenseGate
      initial={state}
      onActivated={setState}
      onPreview={state.source === "web" ? () => setPreview(true) : undefined}
    />
  );
}
