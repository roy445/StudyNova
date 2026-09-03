import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: {
    default: "StudyNova AI｜超強 AI 讀書神器",
    template: "%s｜StudyNova AI",
  },
  description: "讓學習更聰明，讓進步看得見。StudyNova AI 是專為台灣國中、高中生打造的 AI 學習平台：成績分析、教材 OCR、AI 出題、錯題本、每週小考、錄音評分與 Novi AI 助理。",
  applicationName: "StudyNova AI",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "StudyNova", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "StudyNova AI｜超強 AI 讀書神器",
    description: "讓學習更聰明，讓進步看得見。",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#060915",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sn-theme');if(t)document.documentElement.dataset.theme=t;var m=localStorage.getItem('sn-motion');if(m)document.documentElement.dataset.motion=m;}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
