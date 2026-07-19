import { useEffect, useRef, useState } from "react";

export default function AnimatedNumber({ value = 0, duration = 900 }) {
  const target = Number.isFinite(Number(value)) ? Number(value) : 0;
  const previous = useRef(target);
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    const start = previous.current;
    const diff = target - start;
    const startedAt = performance.now();
    let frameId;

    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + diff * eased);
      if (progress < 1) frameId = requestAnimationFrame(tick);
      else previous.current = target;
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [target, duration]);

  return Math.round(display).toLocaleString();
}
