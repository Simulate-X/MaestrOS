import { useTranslation } from "react-i18next";
import { setLng, SUPPORTED, Lng } from "../i18n";

/* TR / EN toggle. Choice lives in i18next + URL query (?lng=), never localStorage. */
export default function LocaleSwitcher() {
  const { i18n } = useTranslation();
  const current = (SUPPORTED.includes(i18n.language as Lng) ? i18n.language : "tr") as Lng;
  return (
    <div className="font-mono" style={{ display: "flex", gap: 3, background: "#11161a", border: "1px solid #1a3a2a", borderRadius: 7, padding: 3 }}>
      {SUPPORTED.map((lng) => (
        <button key={lng} onClick={() => setLng(lng)} style={{
          padding: "4px 9px", borderRadius: 5, fontSize: 11.5, fontWeight: 700, cursor: "pointer", textTransform: "uppercase",
          letterSpacing: "0.06em", border: "none",
          color: current === lng ? "#0a0d0c" : "#9fb3a9",
          background: current === lng ? "#00ff88" : "transparent",
        }}>{lng}</button>
      ))}
    </div>
  );
}
