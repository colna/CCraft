"use client";

import { useEffect, useRef } from "react";

export function SignalField() {
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) {
      return;
    }

    let frame = 0;

    const setPosition = (clientX: number, clientY: number) => {
      const rect = field.getBoundingClientRect();
      const x = ((clientX - rect.left) / Math.max(rect.width, 1) - 0.5).toFixed(3);
      const y = ((clientY - rect.top) / Math.max(rect.height, 1) - 0.5).toFixed(3);

      field.style.setProperty("--signal-x", x);
      field.style.setProperty("--signal-y", y);
    };

    const handlePointerMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setPosition(event.clientX, event.clientY);
      });
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  return (
    <div ref={fieldRef} className="signal-field" aria-hidden="true">
      <div className="signal-arc arc-blue" />
      <div className="signal-arc arc-red" />
      <div className="signal-arc arc-yellow" />
      <div className="signal-arc arc-green" />
      <div className="signal-core">
        <span />
        <span />
        <span />
      </div>
      <div className="signal-dots">
        {Array.from({ length: 18 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    </div>
  );
}
