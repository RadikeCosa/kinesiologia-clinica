"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SessionRefresh() {
  const router = useRouter();
  useEffect(() => {
    async function refresh() {
      if (!navigator.onLine) return;
      try {
        const response = await fetch("/api/auth/session/refresh", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
        if (response.status === 401) { router.replace("/ingresar"); router.refresh(); }
      } catch { /* A temporary network loss must not discard the current page. */ }
    }
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 10 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [router]);
  return null;
}
