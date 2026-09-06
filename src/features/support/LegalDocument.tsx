import Link from "next/link";

const DOCUMENTS = {
  privacy: {
    title: "StudyNova 隱私權政策",
    body: [
      ["我們如何使用資料", "StudyNova 只會在提供學習功能所需的範圍內處理帳號、學習紀錄、教材、測驗與上傳檔案資料。"],
      ["資料控制", "你的個人學習資料預設為私人，除非你主動使用分享、好友挑戰或活動功能。你可以從個人設定或支援中心提出查詢、更正與刪除要求。"],
      ["AI、OCR 與第三方服務", "圖片分析、檔案儲存與 AI 服務只會接收完成對應功能所需的資料。服務供應商依其安全與隱私政策處理資料；StudyNova 不會出售你的個人資料給廣告商。"],
      ["資料保存與安全", "我們會採取存取控制、權限檢查、登入 session 管理與錯誤紀錄等措施保護資料。若你刪除帳號或要求刪除資料，系統會依功能與法令要求處理相關備份。"],
      ["未成年人使用", "若你未滿法定年齡，請在家長或法定代理人同意與陪同下使用需要上傳資料、分享或公開活動的功能。"],
      ["聯絡我們", "如對隱私有疑問，請透過回報問題頁面聯絡 StudyNova。"],
    ],
  },
  terms: {
    title: "StudyNova 服務條款",
    body: [
      ["使用資格", "StudyNova 提供國中、高中學生使用學習與測驗工具。請提供真實且不冒用他人的帳號資訊，並妥善保管登入狀態。"],
      ["合理使用", "請勿嘗試繞過權限、濫用 AI、上傳違法或侵害他人權利的內容，或干擾其他使用者的學習、活動與服務穩定性。"],
      ["教材、題目與 AI 結果", "你保有自己上傳內容的權利；你授權 StudyNova 為提供 OCR、分析、儲存、題目建立與測驗功能而處理這些內容。AI 產生的翻譯、解析與建議應由使用者自行核對，不取代教師或正式評量。"],
      ["Nova 點數與匯出", "部分功能可能消耗 Nova 點數。匯出前會顯示檔案項目、預估大小與點數費用；使用者確認後才會扣除點數。"],
      ["活動與學校限制", "管理員可以依活動、學校、年級、會員權限或活動期間設定使用範圍。請遵守活動規則與管理員公告。"],
      ["服務調整", "我們可能因安全性、維護、法令或功能更新調整服務；重要變更會在平台公告。"],
      ["聯絡我們", "如對服務條款有疑問，請透過回報問題頁面聯絡 StudyNova。"],
    ],
  },
} as const;

export function LegalDocument({ slug }: { slug: "privacy" | "terms" }) {
  const document = DOCUMENTS[slug];
  return (
    <article className="glass anim-in p-5 sm:p-7">
      <header className="mb-5 border-b border-[var(--line)] pb-4">
        <h1 className="text-xl font-bold sm:text-2xl">{document.title}</h1>
        <p className="mt-1 text-xs text-muted">版本 1.0・生效日 2026/01/01・最後更新 2026/09/06</p>
      </header>
      <div className="max-w-3xl space-y-5">
        {document.body.map(([heading, paragraph]) => (
          <section key={heading}>
            <h2 className="mb-2 border-l-2 border-[#7c5cff] pl-3 text-base font-semibold text-[var(--text)]">{heading}</h2>
            <p className="text-sm leading-8 text-muted">{paragraph}</p>
          </section>
        ))}
      </div>
      <footer className="mt-6 border-t border-[var(--line)] pt-4 text-xs text-muted">
        對這份文件有疑問？ <Link href="/support" className="underline">回報問題</Link> 或閱讀 <Link href="/faq" className="underline">常見問題</Link>。
      </footer>
    </article>
  );
}
