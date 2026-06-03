import { useState } from "react";
import { Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import { NowProvider } from "./ui/Now";
import HeaderBar, { View } from "./components/HeaderBar";
import LiveOps from "./views/LiveOps";
import Inbox from "./views/Inbox";
import Roster from "./views/Roster";
import WorkflowCanvas from "./views/WorkflowCanvas";
import Tickets from "./views/Tickets";
import TicketDetail from "./views/TicketDetail";
import Audit from "./views/Audit";

export type CompanyId = number | "all";
export type RosterState = "all" | "active" | "paused" | "blocked";

function TicketRoute({ companyId }: { companyId: CompanyId }) {
  const { id } = useParams();
  const nav = useNavigate();
  return (
    <TicketDetail
      ticketId={Number(id)}
      onOpenTicket={(t) => nav(`/tickets/${t}`)}
      onBack={() => nav("/tickets")}
      onOpenCanvas={() => nav("/canvas")}
    />
  );
}

export default function App() {
  const [companyId, setCompanyId] = useState<CompanyId>("all");
  const [rosterState, setRosterState] = useState<RosterState>("all");
  const nav = useNavigate();

  const setView = (v: View) => nav("/" + v);
  const openTicket = (id: number) => nav(`/tickets/${id}`);

  return (
    <NowProvider>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0a0d0c" }}>
        <HeaderBar
          companyId={companyId}
          setCompanyId={setCompanyId}
          setView={setView}
          openTicket={openTicket}
          setRosterState={setRosterState}
        />
        <main style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <Routes>
            <Route path="/" element={<Navigate to="/live" replace />} />
            <Route path="/live" element={<LiveOps companyId={companyId} onOpenTicket={openTicket} />} />
            <Route path="/inbox" element={<Inbox companyId={companyId} onOpenTicket={openTicket} />} />
            <Route path="/roster" element={<Roster companyId={companyId} onOpenTicket={openTicket} stateFilter={rosterState} setStateFilter={setRosterState} />} />
            <Route path="/canvas" element={<WorkflowCanvas companyId={companyId} onOpenTicket={openTicket} />} />
            <Route path="/tickets" element={<Tickets companyId={companyId} onOpenTicket={openTicket} />} />
            <Route path="/tickets/:id" element={<TicketRoute companyId={companyId} />} />
            <Route path="/audit" element={<Audit companyId={companyId} onOpenTicket={openTicket} />} />
            <Route path="*" element={<Navigate to="/live" replace />} />
          </Routes>
        </main>
      </div>
    </NowProvider>
  );
}
