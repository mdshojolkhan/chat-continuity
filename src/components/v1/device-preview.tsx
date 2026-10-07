/**
 * Device preview: renders the active project's preview HTML inside a
 * realistically sized desktop/tablet/phone frame, scaled to fit, with a
 * fullscreen option.
 */
import { useEffect, useRef, useState } from 'react';

export const PREVIEW_DEVICES = {
  Desktop: { width: 1440, height: 900, label: 'Desktop · 1440×900' },
  Tablet: { width: 820, height: 1180, label: 'Tablet · 820×1180' },
  Mobile: { width: 390, height: 844, label: 'Phone · 390×844' },
} as const;
export type PreviewDevice = keyof typeof PREVIEW_DEVICES;

const CHROME = 36; // desktop browser bar height
const BEZEL = { Desktop: 0, Tablet: 18, Mobile: 12 } as const;

export function DevicePreview({ html, device, frameKey }: { html: string; device: PreviewDevice; frameKey: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 800, h: 600 });
  const [fullscreen, setFullscreen] = useState(false);
  const spec = PREVIEW_DEVICES[device];
  const bezel = BEZEL[device];
  const outerW = spec.width + bezel * 2;
  const outerH = spec.height + bezel * 2 + (device === 'Desktop' ? CHROME : 0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setBox({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const scale = Math.min(1, box.w / outerW, Math.max(box.h, 300) / outerH);

  const frame = (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        width: outerW,
        height: outerH,
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
        padding: bezel,
        borderRadius: device === 'Mobile' ? 44 : device === 'Tablet' ? 28 : 10,
        background: device === 'Desktop' ? 'var(--ws-raised)' : 'var(--ws-line)',
        border: '1px solid var(--ws-line)',
        boxShadow: '0 20px 50px -20px rgba(0,0,0,0.6)',
      }}
      data-testid={`frame-device-${device}`}
    >
      {device === 'Desktop' && (
        <div className="flex shrink-0 items-center gap-2 px-3" style={{ height: CHROME }}>
          <span className="h-3 w-3 rounded-full" style={{ background: 'var(--ws-danger)' }} />
          <span className="h-3 w-3 rounded-full" style={{ background: 'var(--ws-muted)' }} />
          <span className="h-3 w-3 rounded-full" style={{ background: 'var(--ws-accent)' }} />
          <span
            className="ml-3 flex-1 truncate rounded-md px-3 py-1 text-xs"
            style={{ background: 'var(--ws-panel)', color: 'var(--ws-muted)' }}
          >
            preview.local
          </span>
        </div>
      )}
      <iframe
        key={frameKey}
        title="Workspace preview"
        srcDoc={html}
        sandbox="allow-scripts"
        className="bg-background"
        style={{
          width: spec.width,
          height: spec.height,
          border: 0,
          borderRadius: device === 'Mobile' ? 32 : device === 'Tablet' ? 12 : 0,
        }}
        data-testid="frame-builder-preview"
      />
    </div>
  );

  const toolbar = (
    <div className="mb-2 flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--ws-muted)' }}>
      <span className="truncate">{spec.label} · {Math.round(scale * 100)}%</span>
      <button
        type="button"
        onClick={() => setFullscreen((v) => !v)}
        className="shrink-0 rounded-[7px] border px-2 py-1"
        style={{ borderColor: 'var(--ws-line)', background: 'var(--ws-panel)' }}
        data-testid="button-preview-fullscreen"
      >
        {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      </button>
    </div>
  );

  const stage = (
    <div ref={wrapRef} className="flex min-h-0 flex-1 justify-center overflow-hidden">
      <div style={{ width: outerW * scale, height: outerH * scale }} className="flex justify-center">
        {frame}
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col p-4"
        style={{ background: 'var(--ws-bg, var(--ws-panel))' }}
        data-testid="panel-preview-fullscreen"
      >
        {toolbar}
        {stage}
      </div>
    );
  }
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {toolbar}
      {stage}
    </div>
  );
}
