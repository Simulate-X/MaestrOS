import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNow } from "../ui/Now";
import { useTickets } from "../lib/queries";
import type { CompanyId } from "../lib/types";
import ApprovalCard from "../components/ApprovalCard";

export default function Inbox({ companyId, onOpenTicket }: { companyId: CompanyId; onOpenTicket: (id: number) => void }) {
  const { t } = useTranslation();
  useNow();
  const { data: tickets = [] } = useTickets(companyId);

  const pending = useMemo(() => tickets
    .filter((tk) => tk.status === "needs_approval")
    .sort((a, b) => (a.priority - b.priority) || (+new Date(a.locked_at || a.created_at) - +new Date(b.locked_at || b.created_at))),
    [tickets]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderBottom: "1px solid #1a3a2a", flexWrap: "wrap" }}>
        <span className="font-mono" style={{ color: "#e6f1ec", fontSize: 14, fontWeight: 700 }}>{t("inbox.title")}</span>
        <span className="font-mono" style={{ color: "#7a8a82", fontSize: 11.5 }}>{t("inbox.subtitle")}</span>
        {pending.length > 0 && (
          <span className="font-mono" style={{ color: "#ffaa00", fontSize: 12, fontWeight: 700, background: "rgba(255,170,0,0.1)", border: "1px solid #ffaa0055", borderRadius: 20, padding: "2px 11px" }}>
            {t("inbox.pending", { n: pending.length })}
          </span>
        )}
      </div>
      <div className="mos-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "18px 16px" }}>
        {pending.length === 0 ? (
          <div style={{ display: "grid", placeItems: "center", height: "60%", textAlign: "center" }}>
            <div>
              <div className="font-mono" style={{ color: "#00ff88", fontSize: 15, fontWeight: 700 }}>{t("inbox.emptyTitle")}</div>
              <div className="font-mono" style={{ color: "#5f7269", fontSize: 12.5, marginTop: 6 }}>{t("inbox.emptyBody")}</div>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
            {pending.map((tk) => <ApprovalCard key={tk.id} ticket={tk} onOpenTicket={onOpenTicket} />)}
          </div>
        )}
      </div>
    </div>
  );
}
