export type FloatingLayerSource =
  | "calendar"
  | "doc-actions"
  | "mobile-nav"
  | "notification"
  | "search"
  | "select";

const CLOSE_FLOATING_PANELS = "close-floating-panels";

export function openFloatingLayer(source: FloatingLayerSource) {
  document.dispatchEvent(new CustomEvent(CLOSE_FLOATING_PANELS, { detail: { source } }));
}

export function subscribeFloatingLayerClose(
  source: FloatingLayerSource,
  onClose: () => void
) {
  function handleClosePanel(e: Event) {
    const eventSource = (e as CustomEvent<{ source?: FloatingLayerSource }>).detail?.source;
    if (eventSource !== source) onClose();
  }

  document.addEventListener(CLOSE_FLOATING_PANELS, handleClosePanel);
  return () => document.removeEventListener(CLOSE_FLOATING_PANELS, handleClosePanel);
}
