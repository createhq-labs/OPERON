export function renderHeading(block: { type: string; content: string; id?: string }, index: number) {
  return (
    <div key={block.id ?? `${block.type}-${index}`} className="mt-8 scroll-mt-20">
      {block.type === "heading" ? (
        <h2 className="text-2xl font-semibold text-content-primary">{block.content}</h2>
      ) : (
        <h3 className="text-xl font-semibold text-content-primary">{block.content}</h3>
      )}
    </div>
  );
}
