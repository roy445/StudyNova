"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui";
import ThemeLayer from "@/components/ThemeLayer";

export default function Providers({ children }: { children: ReactNode }) {
  return <ToastProvider><ThemeLayer />{children}</ToastProvider>;
}
