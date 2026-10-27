"use client";

import { useEffect, useState } from "react";

type ApiWakeupEvent = CustomEvent<{ active: boolean }>;

export function useApiWakeup(): boolean {
  const [isWaking, setIsWaking] = useState(false);

  useEffect(() => {
    const handleWakeup = (event: Event) => {
      setIsWaking((event as ApiWakeupEvent).detail.active);
    };
    window.addEventListener("api:waking", handleWakeup);
    return () => window.removeEventListener("api:waking", handleWakeup);
  }, []);

  return isWaking;
}
