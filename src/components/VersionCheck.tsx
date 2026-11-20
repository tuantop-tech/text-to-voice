"use client";

import { useEffect } from "react";

export default function VersionCheck({ initialId }: { initialId: string }) {
  useEffect(() => {
    const report = (message: string, stack = "", url = "") => {
      fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, stack, url }),
      }).catch(() => {});
    };
    const onError = (e: ErrorEvent) => report(e.message, e.error?.stack || "", e.filename || "");
    const onReject = (e: PromiseRejectionEvent) =>
      report(String(e.reason), (e.reason as Error)?.stack || "", location.href);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);

    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const data = (await res.json()) as { id: string };
        if (data.id && data.id !== initialId) {
          window.location.reload();
        }
      } catch {
        // offline - thu lai sau
      }
    };
    const timer = setInterval(check, 10000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
    };
  }, [initialId]);

  return null;
}
