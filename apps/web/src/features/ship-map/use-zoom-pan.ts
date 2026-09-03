import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const STEP = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Zoom (botoes + roda do mouse) e pan (arrastar quando ampliado) para a
 * planta do deck. Deliberadamente escrito a mao em vez de uma lib de
 * pan/zoom: e pouca logica (~40 linhas), auto-contida numa unica
 * responsabilidade, e evita puxar uma dependencia nova so pra isto.
 */
export function useZoomPan() {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

  const zoomIn = useCallback(() => setScale((s) => clamp(s + STEP, MIN_SCALE, MAX_SCALE)), []);

  const zoomOut = useCallback(() => {
    setScale((s) => {
      const next = clamp(s - STEP, MIN_SCALE, MAX_SCALE);
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const onWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setScale((s) => clamp(s + (event.deltaY < 0 ? STEP : -STEP), MIN_SCALE, MAX_SCALE));
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (scale <= MIN_SCALE) return;
      dragOrigin.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [scale, offset],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragOrigin.current) return;
    setOffset({ x: event.clientX - dragOrigin.current.x, y: event.clientY - dragOrigin.current.y });
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dragOrigin.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return {
    scale,
    offset,
    isZoomed: scale > MIN_SCALE,
    canZoomIn: scale < MAX_SCALE,
    canZoomOut: scale > MIN_SCALE,
    zoomIn,
    zoomOut,
    reset,
    dragHandlers: { onWheel, onPointerDown, onPointerMove, onPointerUp },
  };
}
