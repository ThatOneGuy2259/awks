import { useState, useCallback, useRef, useEffect } from 'react';

export interface DraggableState {
  x: number;
  y: number;
}

export function useDraggablePanel(initial: DraggableState) {
  const [position, setPosition] = useState<DraggableState>(initial);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setPosition({ x: drag.originX + dx, y: drag.originY + dy });
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: position.x,
        originY: position.y,
      };
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [position.x, position.y, handleMouseMove, handleMouseUp],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return { position, handleMouseDown };
}
