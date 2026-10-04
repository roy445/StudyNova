"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea, useToast } from "@/components/ui";
import { apiPost, errorMessage, useApi } from "@/lib/api";

type Comment = { id: string; body: string; createdAt: string; authorId: string; authorName: string };
type Post = { id: string; title: string; body: string; category: string; status: string; pinned: boolean; createdAt: string; updatedAt: string; authorId: string; authorName: string; comments: Comment[] };

type Props = { admin?: boolean };

export function FeedbackBoard({ admin = false }: Props) {
  const toast = useToast();
  const board = useApi<{ posts: Post[] }>("/tester/feedback");
  const [newPost, setNewPost] = useState({ title: "", body: "", category: "心得" });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => void board.reload(), 10000);
    return () => window.clearInterval(timer);
  }, [board.reload]);

  async function createPost(event: React.FormEvent) {
    event.preventDefault();
    setPosting(true);
    try {
      await apiPost("/tester/feedback", newPost);
      setNewPost({ title: "", body: "", category: "心得" });
      toast.push("success", "心得已發布到測試回饋看板");
      await board.reload();
    } catch (error) {
      toast.push("error", errorMessage(error));
    } finally {
      setPosting(false);
    }
  }

  async function comment(postId: string) {
    const body = commentDrafts[postId]?.trim();
    if (!body) return;
    try {
      await apiPost(`/tester/feedback/${postId}/comments`, { body });
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
      await board.reload();
    } catch (error) {
      toast.push("error", errorMessage(error));
    }
  }

  return <Card title={admin ? "測試員心得與回饋看板" : "即時測試心得回饋看板"} subtitle="每 10 秒自動更新；切換分頁或回到頁面時也會同步最新留言。">
    {!admin && <form onSubmit={createPost} className="mb-5 rounded-2xl border border-violet-300/25 bg-violet-300/[.06] p-4"><div className="mb-3 flex items-center gap-2"><span className="text-lg">✦</span><p className="font-bold text-violet-100">分享你的測試心得</p><Badge tone="cyan">即時</Badge></div><div className="grid gap-3 sm:grid-cols-[1fr_160px]"><Field label="標題" required><Input required minLength={4} maxLength={120} value={newPost.title} onChange={(event) => setNewPost({ ...newPost, title: event.target.value })} placeholder="例如：AI 相機新版很適合整理考卷" /></Field><Field label="分類"><Select value={newPost.category} onChange={(event) => setNewPost({ ...newPost, category: event.target.value })}><option>心得</option><option>Bug 討論</option><option>功能建議</option><option>測試問題</option></Select></Field></div><Field label="內容" required><Textarea required minLength={10} maxLength={5000} rows={4} value={newPost.body} onChange={(event) => setNewPost({ ...newPost, body: event.target.value })} placeholder="分享操作感受、發現的問題或想和其他測試員討論的地方。" /></Field><Button className="tester-button mt-3" loading={posting} type="submit">發布心得</Button></form>}
    {board.loading && !board.data && <p className="text-sm text-muted">正在載入回饋看板…</p>}
    {board.error && <p className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm text-rose-100">{board.error}</p>}
    {!board.loading && !board.data?.posts.length && <EmptyState icon="◇" title="看板還沒有貼文" hint={admin ? "測試員發布心得後會顯示在這裡。" : "成為第一位分享測試心得的人吧。"} />}
    <div className="space-y-4">{board.data?.posts.map((post) => <article key={post.id} className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><Badge tone={post.pinned ? "gold" : "cyan"}>{post.pinned ? "置頂" : post.category}</Badge><h3 className="font-bold text-violet-100">{post.title}</h3></div><p className="mt-1 text-[11px] text-slate-400">{post.authorName} · {new Date(post.createdAt).toLocaleString("zh-TW")}</p></div><span className="text-[11px] text-slate-500">{post.comments.length} 則留言</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">{post.body}</p><div className="mt-4 space-y-2 border-t border-white/10 pt-3">{post.comments.map((item) => <div key={item.id} className="rounded-xl bg-black/15 px-3 py-2 text-sm"><p className="text-xs font-bold text-cyan-200">{item.authorName}<span className="ml-2 font-normal text-slate-500">{new Date(item.createdAt).toLocaleString("zh-TW")}</span></p><p className="mt-1 whitespace-pre-wrap leading-5 text-slate-300">{item.body}</p></div>)}</div><div className="mt-3 flex gap-2"><Input value={commentDrafts[post.id] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void comment(post.id); }} placeholder="留下留言，Ctrl／⌘ + Enter 送出" /><Button size="sm" variant="outline" disabled={!commentDrafts[post.id]?.trim()} onClick={() => void comment(post.id)}>留言</Button></div></article>)}</div>
  </Card>;
}
