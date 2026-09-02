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
  const doc = rows[0];

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
