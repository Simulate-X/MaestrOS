import { createContext, useContext, useEffect, useState, ReactNode } from "react";

/* A ticking "now" so relative timestamps + derived verbs re-render every second. */
const NowContext = createContext<number>(Date.now());

export function NowProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <NowContext.Provider value={now}>{children}</NowContext.Provider>;
}

export const useNow = () => useContext(NowContext);
