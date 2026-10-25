"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { titleFromHeading } from "@/lib/document-title";

/**
 * Keeps the tab title in step with the page's first heading (WCAG 2.4.2). Screens render their
 * own `h1`, so following it avoids a second source of truth per route.
 */
export function useDocumentTitleFromHeading(): void {
  const pathname = usePathname();
  useEffect(() => {
    const apply = (): void => {
      document.title = titleFromHeading(document.querySelector("h1")?.textContent);
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [pathname]);
}
