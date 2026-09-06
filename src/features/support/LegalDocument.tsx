import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { legalDocuments } from "@/db/schema";
import { ensureSeeded } from "@/server/seed";

/** Minimal, safe markdown renderer (headings / bold / lists / paragraphs). No HTML injection. */
function renderMarkdown(body: string) {
  const lines = body.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];

  const inline = (text: string, key: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? (
        <strong key={`${key}-${i}`} className="text-[var(--text)]">
          {p.slice(2, -2)}
        </strong>
      ) : (
        <span key={`${key}-${i}`}>{p}</span>
      ),
    );
  };

  const flush = (key: string) => {
    if (!list.length) return;
    out.push(
      <ul key={`ul-${key}`} className="my-2 list-disc space-y-1 pl-5 text-sm text-muted">
        {list.map((li, i) => (
          <li key={i}>{inline(li, `${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) {
      flush(String(idx));
      out.push(
        <h2 key={idx} className="mt-6 mb-2 border-l-2 border-[#7c5cff] pl-3 text-base font-semibold text-[var(--text)]">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("- ")) {
      list.push(line.slice(2));
    } else if (/^\d+\.\s/.test(line)) {
      list.push(line.replace(/^\d+\.\s/, ""));
    } else if (line.trim() === "") {
      flush(String(idx));
    } else {
      flush(String(idx));
      out.push(
        <p key={idx} className="my-2 text-sm leading-relaxed text-muted">
          {inline(line, String(idx))}
        </p>,
      );
    }
  });
  flush("end");
  return out;
}

export async function LegalDocument({ slug }: { slug: "privacy" | "terms" }) {
  await ensureSeeded().catch(() => undefined);
  const rows = await db.select().from(legalDocuments).where(eq(legalDocuments.slug, slug)).limit(1);
  const doc = rows[0] ?? {
    slug,
    title: slug === "privacy" ? "StudyNova 隱私權政策" : "StudyNova 服務條款",
    version: "1.0",
    effectiveAt: new Date("2026-01-01"),
    updatedAt: new Date(),
    body: slug === "privacy"
      ? "## 我們如何使用資料\nStudyNova 只會在提供學習功能所需的範圍內處理帳號、學習紀錄、教材與測驗資料。\n\n## 資料控制\n你的個人學習資料預設為私人，除非你主動使用分享或好友功能。你可以從個人設定或支援中心提出查詢、更正與刪除要求。\n\n## 第三方服務\n圖片分析、檔案儲存與 AI 服務只會接收完成對應功能所需的資料，我們不會將資料出售給廣告商。\n\n## 聯絡我們\n如對隱私有疑問，請透過回報問題頁面聯絡 StudyNova。"
      : "## 使用資格\nStudyNova 提供國中、高中學生使用學習與測驗工具。請提供真實且不冒用他人的帳號資訊。\n\n## 合理使用\n請勿嘗試繞過權限、濫用 AI、上傳違法內容，或干擾其他使用者的學習與活動。\n\n## 內容與帳號\n你保有自己上傳內容的權利；你授權 StudyNova 為提供 OCR、分析、儲存與測驗功能而處理這些內容。\n\n## 服務調整\n我們可能因安全性、維護或功能更新調整服務，重要變更會在平台公告。\n\n## 聯絡我們\n如對服務條款有疑問，請透過回報問題頁面聯絡 StudyNova。",
  };

  if (!doc) {
    return (
      <div className="glass p-6 text-sm text-muted">
        文件尚未初始化，請先開啟 <code>/api/health</code> 完成種子資料建立。
      </div>
    );
  }

  return (
    <article className="glass anim-in p-5 sm:p-7">
      <header className="mb-4 border-b border-[var(--line)] pb-4">
        <h1 className="text-xl font-bold sm:text-2xl">{doc.title}</h1>
        <p className="mt-1 text-xs text-muted">
          版本 {doc.version}・生效日 {new Date(doc.effectiveAt).toLocaleDateString("zh-TW")}・最後更新{" "}
          {new Date(doc.updatedAt).toLocaleDateString("zh-TW")}
        </p>
      </header>
      <div className="max-w-3xl">{renderMarkdown(doc.body)}</div>
      <footer className="mt-6 border-t border-[var(--line)] pt-4 text-xs text-muted">
        對這份文件有疑問？{" "}
        <Link href="/support" className="underline">
          回報問題
        </Link>{" "}
        或閱讀{" "}
        <Link href="/faq" className="underline">
          常見問題
        </Link>
        。
      </footer>
    </article>
  );
}
