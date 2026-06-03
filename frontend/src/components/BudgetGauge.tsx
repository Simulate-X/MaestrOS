import { useTranslation } from "react-i18next";
import { budget, usd } from "../lib/helpers";

/* Per-agent budget gauge. "no budget cap" + the auto-pause reason are chrome. */
export default function BudgetGauge({ spent, limit, period, pausedForBudget }: {
  spent: number; limit: number | null; period: string; pausedForBudget?: string | null;
}) {
  const { t } = useTranslation();
  const b = budget(spent, limit);
  if (!b.capped) {
    return <div className="font-mono" style={{ fontSize: 11.5, color: "#5f7269" }}>{t("roster.noBudgetCap")}</div>;
  }
  const pctText = Math.round(b.pct * 100) + "%";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span className="font-mono" style={{ fontSize: 11.5, color: "#cfe0d7" }}>
          {usd(spent)} <span style={{ color: "#5f7269" }}>/ {usd(limit)} · {period}</span>
        </span>
        <span className="font-mono" style={{ fontSize: 11, color: b.color, fontWeight: 700 }}>{pctText}</span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: "#0a0d0c", border: "1px solid #1a3a2a", overflow: "hidden" }}>
        <div style={{ width: pctText, height: "100%", background: b.color, boxShadow: "0 0 8px -1px " + b.color, transition: "width .3s" }} />
      </div>
      {pausedForBudget && (
        <div className="font-mono" style={{ fontSize: 10.5, color: "#ff6680", marginTop: 5 }}>{pausedForBudget}</div>
      )}
    </div>
  );
}
