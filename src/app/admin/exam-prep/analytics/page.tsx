"use client";

import { useMemo, useState } from "react";
import { Card, Select, Badge } from "@/components/ui";
import { useApi } from "@/lib/api";

type Activity = { id: string; name: string; examName: string; status: string; openAt: string | null; closeAt: string | null };
type SubjectStat = { subject: string; questionCount: number; answered: number; correct: number; accuracy: number };
type OptionStat = { label: string; text: string; selected: number; probability: number; correct: boolean };
type QuestionStat = { questionId: string; subject: string; stem: string; answered: number; accuracy: number; options: OptionStat[] };
type Analytics = {
  activities: Activity[];
  selectedActivityId: string | null;
  selectedActivities: Activity[];
  summary: { attempts: number; submittedAttempts: number; participants: number; answerRecords: number; correctAnswers: number; accuracy: number; averageScore: number; completionRate: number };
  subjects: SubjectStat[];
  questions: QuestionStat[];
};
type PrintFormat = "overview" | "subjects" | "questions";

function pct(value: number) { return `${value.toFixed(1)}%`; }
function date(value: string | null) { return value ? new Date(value).toLocaleDateString("zh-TW") : "未設定"; }
function donut(value: number, color: string) { return { background: `conic-gradient(${color} 0 ${Math.max(0, Math.min(100, value))}%, rgba(255,255,255,.08) ${Math.max(0, Math.min(100, value))}% 100%)` }; }
function csvCell(value: unknown) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
function downloadBytes(filename: string, bytes: Uint8Array, type: string) {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function ExamPrepAnalyticsPage() {
  const [activityId, setActivityId] = useState("");
  const path = `/admin/exam-prep/analytics${activityId ? `?activityId=${encodeURIComponent(activityId)}` : ""}`;
  const api = useApi<Analytics>(path, [activityId]);
  const data = api.data;
  const weakest = useMemo(() => data?.subjects.slice().sort((a, b) => a.accuracy - b.accuracy).slice(0, 3) ?? [], [data]);
  const hardest = useMemo(() => data?.questions.slice(0, 8) ?? [], [data]);
  const selectedLabel = activityId ? data?.activities.find((item) => item.id === activityId)?.name : "全部段考衝刺活動";
  function print(format: PrintFormat) {
    document.documentElement.dataset.printFormat = format;
    const cleanup = () => { delete document.documentElement.dataset.printFormat; window.removeEventListener("afterprint", cleanup); };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }
  async function exportFile(format: "overview" | "subjects" | "questions" | "json" | "pdf-overview" | "pdf-subjects" | "pdf-questions") {
    if (!data) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const safeName = (selectedLabel ?? "exam-prep").replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, "-");
    if (format.startsWith("pdf-")) {
      const pdfMode = format.slice(4) as "overview" | "subjects" | "questions";
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const { default: fontkit } = await import("@pdf-lib/fontkit");
      const fontBytes = await fetch("/api/fonts/cjk").then((response) => response.arrayBuffer());
      const pdf = await PDFDocument.create();
      pdf.registerFontkit(fontkit);
      const font = await pdf.embedFont(fontBytes, { subset: false });
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const title = pdfMode === "overview" ? "段考衝刺使用分析｜完整總覽" : pdfMode === "subjects" ? "段考衝刺使用分析｜科目分析" : "段考衝刺使用分析｜題目與選項分析";
      const lines = [title, `分析範圍：${selectedLabel}`, `產生日期：${new Date().toLocaleString("zh-TW")}`, ""];
      if (pdfMode === "overview") lines.push(`參與人數：${data.summary.participants}    作答次數：${data.summary.attempts}    已交卷：${data.summary.submittedAttempts}`, `整體答對率：${pct(data.summary.accuracy)}    完成率：${pct(data.summary.completionRate)}    平均成績：${data.summary.averageScore}`, "", "各科目答對率", ...data.subjects.map((item) => `${item.subject}｜答對率 ${pct(item.accuracy)}｜答對 ${item.correct}/${item.answered}｜涵蓋 ${item.questionCount} 題`), "", `答對 ${data.summary.correctAnswers} 題／答錯 ${Math.max(0, data.summary.answerRecords - data.summary.correctAnswers)} 題`);
      if (pdfMode === "subjects") lines.push("科目答對率", ...data.subjects.map((item) => `${item.subject}｜涵蓋 ${item.questionCount} 題｜作答 ${item.answered}｜答對 ${item.correct}｜答對率 ${pct(item.accuracy)}`), "", "優先加強科目", ...weakest.map((item, index) => `${index + 1}. ${item.subject}｜${pct(item.accuracy)}`));
      if (pdfMode === "questions") for (const question of data.questions) lines.push(`${question.subject}｜${question.stem}`, `答題 ${question.answered} 次｜題目答對率 ${pct(question.accuracy)}`, ...question.options.map((option) => `${option.label}. ${option.text}｜被選 ${option.selected} 次｜${pct(option.probability)}${option.correct ? "｜正確答案" : ""}`), "");
      const wrapped = lines.flatMap((line) => { const chunks: string[] = []; for (let index = 0; index < line.length; index += 46) chunks.push(line.slice(index, index + 46)); return chunks.length ? chunks : [""]; });
      let page = pdf.addPage([595.28, 841.89]);
      let y = 800;
      for (const line of wrapped) {
        if (y < 42) { page = pdf.addPage([595.28, 841.89]); y = 800; }
        page.drawText(line, { x: 42, y, size: line === title ? 16 : 9, font: line === title ? bold : font, color: rgb(.08, .1, .18) });
        y -= line === title ? 28 : 16;
      }
      const bytes = await pdf.save();
      const labels = { overview: "總覽", subjects: "科目分析", questions: "題目選項分析" } as const;
      downloadBytes(`${safeName}-段考衝刺-${labels[pdfMode]}-${stamp}.pdf`, bytes, "application/pdf");
      return;
    }
    if (format === "json") {
      downloadFile(`${safeName}-段考衝刺分析-${stamp}.json`, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
      return;
    }
    const rows: unknown[][] = format === "overview"
      ? [["分析範圍", "參與人數", "作答次數", "已交卷次數", "答題總數", "答對題數", "整體答對率", "完成率", "平均成績"], [selectedLabel, data.summary.participants, data.summary.attempts, data.summary.submittedAttempts, data.summary.answerRecords, data.summary.correctAnswers, pct(data.summary.accuracy), pct(data.summary.completionRate), data.summary.averageScore]]
      : format === "subjects"
        ? [["科目", "涵蓋題數", "作答題數", "答對題數", "答對率"], ...data.subjects.map((item) => [item.subject, item.questionCount, item.answered, item.correct, pct(item.accuracy)])]
        : [["題目 ID", "科目", "題目", "作答次數", "題目答對率", "選項", "選項內容", "被選次數", "被選機率", "是否正確答案"], ...data.questions.flatMap((question) => question.options.map((option) => [question.questionId, question.subject, question.stem, question.answered, pct(question.accuracy), option.label, option.text, option.selected, pct(option.probability), option.correct ? "是" : "否"]))];
    const csv = `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
    const labels = { overview: "總覽", subjects: "科目分析", questions: "題目選項分析" } as const;
    downloadFile(`${safeName}-段考衝刺-${labels[format as "overview" | "subjects" | "questions"]}-${stamp}.csv`, csv, "text/csv;charset=utf-8");
  }

  return <div className="space-y-6">
    <header className="rounded-[2rem] border border-cyan-300/25 bg-[radial-gradient(circle_at_85%_10%,rgba(55,211,255,.2),transparent_35%),linear-gradient(135deg,rgba(13,32,60,.96),rgba(20,16,48,.98))] p-6 shadow-[0_0_45px_rgba(55,211,255,.12)] sm:p-8">
      <p className="text-xs font-black tracking-[.25em] text-cyan-200">EXAM PREP · ANALYTICS CENTER</p>
      <div className="mt-2 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="text-3xl font-black text-white sm:text-4xl">段考衝刺使用分析</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">以真實作答紀錄呈現參與率、完成率、科目答對率與每個選項的被選比例，協助你像大考中心一樣快速掌握整體表現。</p></div><div className="min-w-[240px]"><label className="mb-1 block text-xs font-bold text-cyan-100">分析範圍</label><Select value={activityId} onChange={(event) => setActivityId(event.target.value)}><option value="">全部段考衝刺活動</option>{data?.activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}・{activity.examName}</option>)}</Select></div></div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-cyan-100 print:hidden"><Badge tone="cyan">目前：{selectedLabel ?? "載入中"}</Badge>{data?.selectedActivities.map((activity) => <Badge key={activity.id} tone="violet">{activity.status}・{date(activity.openAt)}～{date(activity.closeAt)}</Badge>)}<span className="ml-auto text-muted">下載 CSV：</span><button type="button" onClick={() => void exportFile("overview")} className="rounded-lg border border-cyan-200/30 bg-cyan-300/10 px-3 py-1.5 font-semibold text-cyan-100 hover:bg-cyan-300/20">總覽</button><button type="button" onClick={() => void exportFile("subjects")} className="rounded-lg border border-emerald-200/30 bg-emerald-300/10 px-3 py-1.5 font-semibold text-emerald-100 hover:bg-emerald-300/20">科目</button><button type="button" onClick={() => void exportFile("questions")} className="rounded-lg border border-violet-200/30 bg-violet-300/10 px-3 py-1.5 font-semibold text-violet-100 hover:bg-violet-300/20">題目選項</button><button type="button" onClick={() => void exportFile("json")} className="rounded-lg border border-amber-200/30 bg-amber-300/10 px-3 py-1.5 font-semibold text-amber-100 hover:bg-amber-300/20">JSON 完整資料</button><span className="ml-2 text-muted">下載 PDF：</span><button type="button" onClick={() => void exportFile("pdf-overview")} className="rounded-lg border border-rose-200/30 bg-rose-300/10 px-3 py-1.5 font-semibold text-rose-100 hover:bg-rose-300/20">總覽</button><button type="button" onClick={() => void exportFile("pdf-subjects")} className="rounded-lg border border-rose-200/30 bg-rose-300/10 px-3 py-1.5 font-semibold text-rose-100 hover:bg-rose-300/20">科目</button><button type="button" onClick={() => void exportFile("pdf-questions")} className="rounded-lg border border-rose-200/30 bg-rose-300/10 px-3 py-1.5 font-semibold text-rose-100 hover:bg-rose-300/20">題目選項</button><span className="ml-2 text-muted">瀏覽器列印：</span><button type="button" onClick={() => print("overview")} className="rounded-lg border border-white/15 px-3 py-1.5 font-semibold hover:bg-white/10">總覽</button><button type="button" onClick={() => print("subjects")} className="rounded-lg border border-white/15 px-3 py-1.5 font-semibold hover:bg-white/10">科目</button><button type="button" onClick={() => print("questions")} className="rounded-lg border border-white/15 px-3 py-1.5 font-semibold hover:bg-white/10">題目</button></div>
    </header>

    {api.loading && <Card><p className="text-sm text-muted">正在整理真實作答資料…</p></Card>}
    {api.error && <Card><p className="text-sm text-rose-200">{api.error}</p></Card>}
    {data && !api.loading && <>
      <section className="print-section print-overview print-subjects grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[['參與人數', data.summary.participants, '有開始作答的帳號', 'text-cyan-200'], ['作答次數', data.summary.attempts, `已交卷 ${data.summary.submittedAttempts} 次`, 'text-violet-200'], ['整體答對率', pct(data.summary.accuracy), `${data.summary.correctAnswers} / ${data.summary.answerRecords} 題`, 'text-emerald-200'], ['完成率', pct(data.summary.completionRate), `平均成績 ${data.summary.averageScore} 分`, 'text-amber-200']].map(([label, value, detail, color]) => <Card key={String(label)} className="!p-5"><p className="text-xs font-bold text-muted">{label}</p><p className={`mt-2 text-3xl font-black ${color}`}>{value}</p><p className="mt-1 text-xs text-muted">{detail}</p></Card>)}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.4fr_.9fr]">
        <div className="print-section print-overview print-subjects"><Card title="各科目答對率" subtitle="依所有已交卷答案計算；題數為本範圍實際出現過的題目數。"><div className="space-y-4">{data.subjects.length ? data.subjects.map((item) => <div key={item.subject}><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="font-bold">{item.subject}</span><span className="font-mono text-cyan-200">{pct(item.accuracy)}</span></div><div className="h-3 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${item.accuracy >= 80 ? "bg-emerald-300" : item.accuracy >= 60 ? "bg-amber-300" : "bg-rose-300"}`} style={{ width: `${Math.max(2, item.accuracy)}%` }} /></div><p className="mt-1 text-xs text-muted">答題 {item.answered} 題・答對 {item.correct} 題・涵蓋 {item.questionCount} 題</p></div>) : <p className="text-sm text-muted">目前沒有已交卷的答題資料。</p>}</div></Card></div>
        <div className="print-section print-overview"><Card title="整體答對／答錯" subtitle="大考中心式快速總覽"><div className="flex items-center gap-5"><div className="relative h-36 w-36 shrink-0 rounded-full p-4" style={donut(data.summary.accuracy, "#5eead4")}><div className="flex h-full w-full items-center justify-center rounded-full bg-[#10152b] text-center"><span><b className="block text-2xl text-white">{pct(data.summary.accuracy)}</b><small className="text-muted">答對率</small></span></div></div><div className="space-y-3 text-sm"><p><span className="mr-2 inline-block h-3 w-3 rounded-full bg-emerald-300" />答對 <b>{data.summary.correctAnswers}</b> 題</p><p><span className="mr-2 inline-block h-3 w-3 rounded-full bg-rose-300" />答錯 <b>{Math.max(0, data.summary.answerRecords - data.summary.correctAnswers)}</b> 題</p><p className="text-xs leading-5 text-muted">完成率反映開始測驗後實際交卷的比例，可用來判斷題目長度與活動流程是否需要調整。</p></div></div></Card></div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <div className="print-section print-overview print-subjects"><Card title="需要優先加強的科目" subtitle="依答對率由低至高排序"><div className="space-y-3">{weakest.length ? weakest.map((item, index) => <div key={item.subject} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.03] p-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-300/15 font-black text-rose-200">{index + 1}</span><div className="min-w-0 flex-1"><p className="font-bold">{item.subject}</p><p className="text-xs text-muted">{item.answered} 題作答・{item.questionCount} 題</p></div><b className="text-rose-200">{pct(item.accuracy)}</b></div>) : <p className="text-sm text-muted">資料累積後會顯示弱科排序。</p>}</div></Card></div>
        <div className="print-section print-overview print-questions"><Card title="題目難度分布" subtitle="答對率最低的題目優先列出，方便檢查詳解與干擾選項"><div className="space-y-3">{hardest.length ? hardest.map((item) => <div key={item.questionId} className="rounded-xl border border-white/10 bg-white/[.025] p-3"><div className="flex items-start justify-between gap-3"><p className="line-clamp-2 text-sm font-semibold">{item.subject}｜{item.stem}</p><b className={item.accuracy < 60 ? "shrink-0 text-rose-200" : "shrink-0 text-amber-200"}>{pct(item.accuracy)}</b></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-rose-300 to-amber-300" style={{ width: `${Math.max(2, item.accuracy)}%` }} /></div></div>) : <p className="text-sm text-muted">尚無題目分析資料。</p>}</div></Card></div>
      </section>

      <div className="print-section print-questions"><Card title="每題選項被選機率" subtitle="每個選項的分母是該題已提交的作答次數；綠色標示正確答案，能直接看出干擾選項是否過強或過弱。"><div className="space-y-5">{data.questions.length ? data.questions.map((question) => <div key={question.questionId} className="rounded-2xl border border-white/10 bg-white/[.025] p-4 print:break-inside-avoid"><div className="flex flex-col justify-between gap-2 sm:flex-row"><div><Badge tone="muted">{question.subject}</Badge><p className="mt-2 text-sm font-semibold leading-6">{question.stem}</p></div><span className="shrink-0 text-xs text-muted">{question.answered} 次作答・答對率 {pct(question.accuracy)}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{question.options.map((option) => <div key={`${question.questionId}-${option.label}`}><div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className={option.correct ? "font-black text-emerald-200" : "text-slate-200"}>{option.label}. {option.text}{option.correct ? "（正解）" : ""}</span><b className={option.correct ? "text-emerald-200" : "text-cyan-100"}>{pct(option.probability)}</b></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${option.correct ? "bg-emerald-300" : "bg-cyan-300/75"}`} style={{ width: `${Math.max(option.selected ? 2 : 0, option.probability)}%` }} /></div><p className="mt-1 text-[11px] text-muted">被選 {option.selected} 次</p></div>)}</div></div>) : <p className="text-sm text-muted">目前沒有可分析的選擇題作答資料。</p>}</div></Card></div>
    </>}
  </div>;
}
