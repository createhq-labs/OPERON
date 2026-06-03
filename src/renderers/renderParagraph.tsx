export function renderParagraph(block: { content: string; id?: string }) {
  return (
    <div key={block.id ?? block.content.slice(0, 32)} className="prose prose-sm text-content-secondary">
      <p>{block.content}</p>
    </div>
  );
}
