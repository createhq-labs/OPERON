export function renderResource(block: { content: { title: string; description: string; href: string; external?: boolean }; id?: string }, index: number) {
  return (
    <a
      key={block.id ?? `resource-${index}`}
      href={block.content.href}
      target={block.content.external ? "_blank" : "_self"}
      rel="noreferrer"
      className="block rounded-3xl border border-border p-5 bg-bg-secondary text-sm text-content-primary transition hover:border-accent-soft"
    >
      <div className="font-semibold">{block.content.title}</div>
      <p className="mt-2 text-content-secondary">{block.content.description}</p>
    </a>
  );
}
