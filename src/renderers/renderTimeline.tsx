export function renderTimeline(block: { content: { items: Array<{ period: string; title: string; description: string }> }; id?: string }, index: number) {
  return (
    <div key={block.id ?? `timeline-${index}`} className="rounded-3xl border border-border p-5 bg-bg-primary/80">
      <div className="text-sm font-semibold text-content-primary">Timeline</div>
      <div className="mt-3 space-y-3">
        {block.content.items.map((item: any) => (
          <div key={item.title} className="rounded-3xl border border-border-subtle bg-bg-secondary p-4">
            <div className="text-sm font-semibold text-content-primary">{item.period}</div>
            <p className="mt-1 text-sm text-content-secondary">{item.title}</p>
            <p className="text-sm text-content-secondary">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
