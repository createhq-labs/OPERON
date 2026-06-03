export function renderSteps(block: { content: Array<{ title: string; description: string }>; id?: string }, index: number) {
  return (
    <div key={block.id ?? `steps-${index}`} className="rounded-3xl border border-border p-5 bg-bg-primary/80">
      <div className="text-sm font-semibold text-content-primary">Steps</div>
      <div className="mt-4 space-y-4">
        {block.content.map((item: any, itemIndex: number) => (
          <div key={`${item.title}-${itemIndex}`} className="rounded-3xl border border-border-subtle bg-bg-secondary p-4">
            <div className="text-sm font-semibold text-content-primary">Step {itemIndex + 1}</div>
            <p className="mt-2 text-sm text-content-secondary">{item.description || item.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
