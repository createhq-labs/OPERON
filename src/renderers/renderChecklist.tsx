export function renderChecklist(block: { content: { title: string; items: Array<{ id: string; label: string }> }; id?: string }, index: number) {
  return (
    <div key={block.id ?? `checklist-${index}`} className="rounded-3xl border border-border-subtle bg-bg-secondary p-5">
      <div className="text-sm font-semibold text-content-primary">{block.content.title}</div>
      <div className="mt-3 space-y-3">
        {block.content.items.map((item: any) => (
          <div key={item.id} className="flex items-start gap-3 rounded-3xl border border-border bg-bg-primary/80 px-4 py-3">
            <span className="mt-1 h-3 w-3 rounded-full bg-accent" />
            <p className="text-sm text-content-secondary">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
