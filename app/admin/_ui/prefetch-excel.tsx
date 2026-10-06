"use client";

import { useEffect } from "react";
import { EXCELJS_URL } from "@/lib/vendor";

/** When the owner is looking at the products or stock screens, quietly download the Excel library in idle time (once;
 * after that the browser keeps it forever), so "Add many with Excel" opens instantly. Never blocks the page. */
export function PrefetchExcel() {
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;
    const start = () => {
      if (document.querySelector(`link[href="${EXCELJS_URL}"]`)) return;
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = "script";
      link.href = EXCELJS_URL;
      document.head.appendChild(link);
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(start);
    else window.setTimeout(start, 3000);
  }, []);
  return null;
}
