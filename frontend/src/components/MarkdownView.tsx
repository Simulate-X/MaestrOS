import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/* Renders ticket bodies / work products. Replaces the prototype's `marked` global
   with react-markdown + remark-gfm. Styling stays in .mos-md (index.css). */
export default function MarkdownView({ source, className }: { source: string; className?: string }) {
  return (
    <div className={"mos-md " + (className || "")}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source || ""}</ReactMarkdown>
    </div>
  );
}
