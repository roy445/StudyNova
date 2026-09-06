import type { SVGProps } from "react";

export type SymbolName = "home" | "study" | "nova" | "challenge" | "profile" | "grades" | "weekly" | "report" | "admin" | "search" | "bell" | "settings" | "pen" | "camera" | "question" | "book" | "shop" | "badge" | "audio" | "math" | "science" | "social" | "spark" | "archive";

type Props = SVGProps<SVGSVGElement> & { name: SymbolName; size?: number; active?: boolean };

const paths: Record<SymbolName, string> = {
  home: "M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-9ZM8 21v-6h8v6",
  study: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16ZM4 5.5v16M8 7h8M8 11h8",
  nova: "M12 2 14.5 9.5 22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z",
  challenge: "M5 4h14v16H5zM8 8h8M8 12h5M8 16h8",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
  grades: "M4 19V5m0 14h16M8 16l3-4 3 2 5-7",
  weekly: "M6 3v3M18 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1ZM8 12h3M8 16h6",
  report: "M5 3h14v18H5zM8 7h8M8 11h8M8 15h5",
  admin: "M4 4h16v16H4zM8 8h8M8 12h5M8 16h8",
  search: "m20 20-4.5-4.5M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z",
  bell: "M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M2 12h3m14 0h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
  pen: "m4 20 4.2-1 9.7-9.7a2.1 2.1 0 0 0-3-3L5.2 16 4 20ZM14 7l3 3M4 20h16",
  camera: "M4 7h3l1.5-2h7L17 7h3v12H4V7Zm8 3.2a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z",
  question: "M4 4h16v16H4zM8 8h8M8 12h6M8 16h4",
  book: "M4 4h7a3 3 0 0 1 3 3v13H7a3 3 0 0 0-3 3V4Zm16 0h-6a3 3 0 0 0-3 3v13h7a3 3 0 0 1 3 3V4Z",
  shop: "M4 8h16l-1 12H5L4 8ZM3 8l2-4h14l2 4M9 12v4M15 12v4",
  badge: "M12 3l2.2 2.1 3-.3.8 2.9 2.6 1.5-1.5 2.6.8 2.9-2.9.8-1.5 2.6-2.6-1.5-2.6 1.5-1.5-2.6-2.9-.8.8-2.9L3.9 9.2l2.6-1.5.8-2.9 3 .3L12 3Z",
  audio: "M4 14a2 2 0 0 0 2 2h2V8H6a2 2 0 0 0-2 2v4Zm4 2 5 4V4L8 8m9 1a5 5 0 0 1 0 6m2-9a9 9 0 0 1 0 12",
  math: "M4 18 9 6l4 12 3-7 4 7M7 13h4",
  science: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3M7 16h10",
  social: "M4 5h16v14H4zM4 9h16M8 5v14M16 5v14",
  spark: "M12 3l1.2 6.8L20 12l-6.8 1.2L12 20l-1.2-6.8L4 12l6.8-2.2L12 3Z",
  archive: "M4 7h16v13H4zM3 4h18v3H3zM9 11h6",
};

export function SymbolIcon({ name, size = 20, active, className, ...props }: Props) {
  return <svg {...props} className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.35 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
