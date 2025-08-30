import { useEffect, useRef, useState } from "react";

export function useInfiniteGrid(initialVisible = 120, pageStep = 60) {
  const [visible, setVisible] = useState(initialVisible);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setVisible(v => v + pageStep); },
      { rootMargin: "800px 0px 800px 0px", threshold: 0 }
    );
    obs.observe(el);
    return () => obs.unobserve(el);
  }, [pageStep]);

  return { visible, setVisible, sentinelRef };
}
