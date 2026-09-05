/**
 * devicePixelRatio-aware canvas sizing with ResizeObserver, so resizing
 * rescales the drawing without clipping or distortion.
 */
export interface ViewportSize {
  cssWidth: number;
  cssHeight: number;
}

export function attachViewport(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  onResize: (size: ViewportSize) => void,
): () => void {
  const apply = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const rect = host.getBoundingClientRect();
    const cssWidth = Math.max(rect.width, 1);
    const cssHeight = Math.max(rect.height, 1);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    onResize({ cssWidth, cssHeight });
  };

  apply();
  const observer = new ResizeObserver(apply);
  observer.observe(host);
  return () => observer.disconnect();
}
