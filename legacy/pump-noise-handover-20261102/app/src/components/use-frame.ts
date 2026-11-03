import { useEffect, useState } from "react";

export function useFrame(ms = 100) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((v) => (v + 1) % 1_000_000), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return n;
}
