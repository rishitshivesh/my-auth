"use client";

import { useCallback, useEffect, useState } from "react";
import { cooldownEnd, remainingSeconds } from "@/lib/resend-cooldown";

/** Ticks once a second while a cooldown is active. `start()` after each successful send. */
export function useResendCooldown(initialSendCount = 0) {
  const [until, setUntil] = useState(0);
  const [sendCount, setSendCount] = useState(initialSendCount);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (until === 0) return;
    const tick = () => {
      const left = remainingSeconds(until, Date.now());
      setSeconds(left);
      if (left === 0) setUntil(0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until]);

  const start = useCallback(() => {
    setUntil(cooldownEnd(Date.now(), sendCount));
    setSendCount((n) => n + 1);
  }, [sendCount]);

  return { secondsLeft: seconds, isCoolingDown: seconds > 0, start } as const;
}
