import { useEffect, useRef, useState } from "react";

export function CountUp({
  to,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const [value, setValue] = useState(0);
  const hasAnimated = useRef(false);
  const animationStarted = useRef(false);

  useEffect(() => {
    let frameId = 0;
    if (hasAnimated.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      hasAnimated.current = true;
      frameId = window.requestAnimationFrame(() => setValue(to));
      return () => window.cancelAnimationFrame(frameId);
    }

    hasAnimated.current = true;
    animationStarted.current = false;
    const startedAt = performance.now();
    const animate = (now: number) => {
      animationStarted.current = true;
      const progress = Math.min((now - startedAt) / 800, 1);
      const eased = 1 - (1 - progress) ** 3;
      const factor = 10 ** decimals;
      setValue(Math.round(to * eased * factor) / factor);
      if (progress < 1) frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(frameId);
      if (!animationStarted.current) hasAnimated.current = false;
    };
  }, [decimals, to]);

  return (
    <>
      {prefix}
      {new Intl.NumberFormat("en-NG", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value)}
      {suffix}
    </>
  );
}
