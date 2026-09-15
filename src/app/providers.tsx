"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui";
import ThemeLayer from "@/components/ThemeLayer";
import CustomizationRuntime from "@/components/CustomizationRuntime";

export default function Providers({ children }: { children: ReactNode }) {
  return <ToastProvider><ThemeLayer /><CustomizationRuntime />{children}</ToastProvider>;
}
