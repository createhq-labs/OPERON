export function renderAlert(block: { type: string; title?: string; content: string }, index: number) {
  return (
    <div key={`${block.type}-${block.title ?? index}`} className="rounded-3xl border border-accent bg-accent/10 p-5">
      {block.title ? <div className="text-sm font-semibold text-accent">{block.title}</div> : null}
      <p className="mt-2 text-sm text-content-secondary">{block.content}</p>
    </div>
  );
}
