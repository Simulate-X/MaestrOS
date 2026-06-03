import { Fragment } from "react";
import { parentChain, truncate } from "../lib/helpers";
import { idx } from "../lib/mock";

/* Goal genealogy: root → … → current. Phase names + goal title are DATA (English). */
export default function ParentChainBreadcrumb({ ticketId, onNavigate }: { ticketId: number; onNavigate?: (id: number) => void }) {
  const chain = parentChain(ticketId);
  return (
    <div className="font-mono" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, fontSize: 12 }}>
      {chain.map((t, i) => {
        const isCurrent = t.id === ticketId;
        const ph = t.current_phase_id ? idx.phase(t.current_phase_id) : null;
        const isRoot = !t.parent_ticket_id;
        const label = isRoot ? "◆ " + truncate(t.title, 34) : (ph ? ph.name : "ticket") + " #" + t.id;
        return (
          <Fragment key={t.id}>
            {i > 0 && <span style={{ color: "#3a4a42" }}>→</span>}
            <button
              onClick={() => !isCurrent && onNavigate && onNavigate(t.id)}
              title={t.title}
              style={{
                background: isCurrent ? "rgba(0,255,136,0.1)" : "transparent",
                border: "1px solid " + (isCurrent ? "rgba(0,255,136,0.4)" : "transparent"),
                color: isCurrent ? "#00ff88" : "#7a8a82", padding: "2px 8px", borderRadius: 5,
                cursor: isCurrent ? "default" : "pointer", fontSize: 12, fontFamily: "inherit",
              }}
            >{label}</button>
          </Fragment>
        );
      })}
    </div>
  );
}
