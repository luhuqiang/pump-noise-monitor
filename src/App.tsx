import { useEffect } from "react";
import { useUi } from "@/store/ui";
import { InstrumentPanel } from "@/components/InstrumentPanel";

export default function App() {
  const theme = useUi((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return <InstrumentPanel />;
}
