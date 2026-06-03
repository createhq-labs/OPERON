import { renderParagraph } from "@/renderers/renderParagraph";
import { renderChecklist } from "@/renderers/renderChecklist";
import { renderSteps } from "@/renderers/renderSteps";
import { renderTable } from "@/renderers/renderTable";
import { renderTimeline } from "@/renderers/renderTimeline";
import { renderResource } from "@/renderers/renderResource";
import { renderVideo } from "@/renderers/renderVideo";
import { renderAlert } from "@/renderers/renderAlert";
import { renderHeading } from "@/renderers/renderHeading";

export function renderBlock(block: any, index: number) {
  switch (block.type) {
    case "heading":
    case "subheading":
      return renderHeading(block, index);
    case "paragraph":
      return renderParagraph(block);
    case "warning":
    case "note":
    case "callout":
    case "success":
      return renderAlert(block, index);
    case "checklist":
      return renderChecklist(block, index);
    case "steps":
      return renderSteps(block, index);
    case "faq":
      return renderSteps(block, index);
    case "table":
      return renderTable(block, index);
    case "timeline":
      return renderTimeline(block, index);
    case "resource":
      return renderResource(block, index);
    case "video":
      return renderVideo(block, index);
    case "divider":
      return <div key={`${block.id ?? index}-divider`} className="border-t border-border" />;
    default:
      return null;
  }
}
