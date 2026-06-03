import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, Handle, Position, type EdgeProps } from "@xyflow/react";
import PhaseNode, { NODE_W, NODE_H } from "./PhaseNode";
import type { Phase, Ticket } from "../lib/types";

/* React Flow custom node wrapper around the shared PhaseNode visual.
   React Flow positions the node; PhaseNode renders the content (without absolute pos).
   Handles on all four sides let forward edges (L→R), rework loops (bottom→bottom),
   and escalate arcs (top→top) attach cleanly. */
export interface PhaseNodeData {
  phase: Phase;
  active: Ticket[];
  selected: boolean;
  onClick: () => void;
  [key: string]: unknown;
}

const hStyle = { opacity: 0, width: 1, height: 1, border: "none", background: "transparent" } as const;

export const PhaseFlowNode = memo(({ data }: { data: PhaseNodeData }) => {
  return (
    <div style={{ width: NODE_W }}>
      <Handle type="target" position={Position.Left} id="l" style={hStyle} />
      <Handle type="source" position={Position.Right} id="r" style={hStyle} />
      <Handle type="source" position={Position.Bottom} id="b" style={hStyle} />
      <Handle type="target" position={Position.Bottom} id="bt" style={hStyle} />
      <Handle type="source" position={Position.Top} id="t" style={hStyle} />
      <Handle type="target" position={Position.Top} id="tt" style={hStyle} />
      <PhaseNode phase={data.phase} x={0} y={0} active={data.active} selected={data.selected} onClick={data.onClick} embedded />
    </div>
  );
});

/* Custom branch edge — reproduces the prototype's curves:
   backward (rework/hold) loops BELOW; forward (escalate) arcs ABOVE. Carries a verdict label. */
export function BranchEdge({ id, sourceX, sourceY, targetX, targetY, data, markerEnd }: EdgeProps) {
  const d = data as { verdict: string; backward: boolean; color: string };
  const backward = d?.backward;
  let path: string;
  let lx: number, ly: number;
  if (backward) {
    const dip = Math.max(sourceY, targetY) + 92;
    path = `M ${sourceX} ${sourceY} C ${sourceX} ${dip}, ${targetX} ${dip}, ${targetX} ${targetY}`;
    lx = (sourceX + targetX) / 2; ly = dip - 14;
  } else {
    const rise = Math.min(sourceY, targetY) - 70;
    path = `M ${sourceX} ${sourceY} C ${sourceX} ${rise}, ${targetX} ${rise}, ${targetX} ${targetY}`;
    lx = (sourceX + targetX) / 2; ly = rise + 10;
  }
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: d?.color, strokeWidth: 1.8, strokeDasharray: "5 4", opacity: 0.9 }} />
      <EdgeLabelRenderer>
        <div className="font-mono" style={{
          position: "absolute", transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`,
          background: "#0c1110", border: "1px solid " + (d?.color || "#7a8a82") + "66", borderRadius: 5,
          padding: "2px 8px", fontSize: 10.5, color: d?.color, pointerEvents: "none",
        }}>{d?.verdict}</div>
      </EdgeLabelRenderer>
    </>
  );
}

export { NODE_W, NODE_H };
