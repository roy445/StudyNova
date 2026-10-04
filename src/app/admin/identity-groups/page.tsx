"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Textarea, useToast } from "@/components/ui";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, errorMessage, useApi } from "@/lib/api";

type Member = { userId: string; novaId: string; displayName: string; email?: string | null; status: string };
type SearchUser = { userId: string; novaId: string; displayName: string; email: string; status: string; role: string };
type Group = { id: string; name: string; description: string; badge: string; color: string; enabled: boolean; memberCount: number; members: Member[] };

export default function IdentityGroupsPage() {
  const toast = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", badge: "身分", color: "#37d3ff", enabled: true });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const active = useMemo(() => groups.find((group) => group.id === selected) ?? null, [groups, selected]);
  const memberSearch = useApi<{ users: SearchUser[] }>(memberQuery.trim() ? `/admin/users?q=${encodeURIComponent(memberQuery.trim())}&page=1&pageSize=20` : null, [memberQuery]);

  async function load() {
    try {
      const result = await apiGet<{ groups: Group[] }>(`/admin/identity-groups${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      setGroups(result.groups);
      if (!selected && result.groups[0]) setSelected(result.groups[0].id);
    } catch (err) { toast.push("error", errorMessage(err)); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer); }, [query]);

  function selectGroup(group: Group) {
    setSelected(group.id);
    setForm({ name: group.name, description: group.description, badge: group.badge, color: group.color, enabled: group.enabled });
    setSelectedIds(group.members.map((member) => member.userId));
    setMemberQuery("");
  }
  async function createGroup() {
    if (!form.name.trim()) return toast.push("error", "請先輸入身分組名稱");
    setBusy(true);
    try { const result = await apiPost<{ group: Group }>("/admin/identity-groups", form); toast.push("success", "身分組已建立"); await load(); selectGroup({ ...result.group, memberCount: 0, members: [] }); } catch (err) { toast.push("error", errorMessage(err)); } finally { setBusy(false); }
  }
  async function saveGroup() {
    if (!active) return;
    setBusy(true);
    try { await apiPatch(`/admin/identity-groups/${active.id}`, form); await apiPut(`/admin/identity-groups/${active.id}/members`, { userIds: selectedIds }); toast.push("success", "身分組與成員已儲存"); await load(); } catch (err) { toast.push("error", errorMessage(err)); } finally { setBusy(false); }
  }
  async function removeGroup() {
    if (!active || !window.confirm(`確定刪除「${active.name}」？只會移除身分組，不會刪除使用者。`)) return;
    setBusy(true); try { await apiDelete(`/admin/identity-groups/${active.id}`); toast.push("success", "身分組已刪除"); setSelected(null); await load(); } catch (err) { toast.push("error", errorMessage(err)); } finally { setBusy(false); }
  }
  function toggleMember(userId: string) { setSelectedIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]); }

  const searchResults = (memberSearch.data?.users ?? []).filter((user) => user.status === "active");
  const selectedMembers = active?.members.filter((member) => selectedIds.includes(member.userId)) ?? [];

  return <div className="space-y-4">
    <Card title="身分組與定向發布" subtitle="建立「某某補習班」「試用者」「進階會員」等群組，再把每週小考或其他內容只開放給指定身分。">
      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋身分組" /><div className="space-y-2">{groups.map((group) => <button key={group.id} onClick={() => selectGroup(group)} className={`w-full rounded-xl border p-3 text-left transition ${selected === group.id ? "border-[#37d3ff] bg-cyan-300/10" : "border-[var(--line)] hover:bg-white/5"}`}><div className="flex items-center justify-between gap-2"><span className="font-medium">{group.name}</span><Badge tone={group.enabled ? "green" : "muted"}>{group.enabled ? "啟用" : "停用"}</Badge></div><p className="mt-1 text-xs text-muted">{group.badge}・{group.memberCount} 位成員</p></button>)}{!groups.length && <EmptyState icon="◎" title="尚未建立身分組" hint="先在右側建立第一個身分組。" />}</div></div>
        <div className="rounded-2xl border border-[var(--line)] p-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="身分組名稱"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：某某補習班" /></Field><Field label="標籤文字"><Input value={form.badge} onChange={(event) => setForm({ ...form, badge: event.target.value })} placeholder="補習班" /></Field><Field label="顏色"><Input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} className="h-10 w-full p-1" /></Field><label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />啟用這個身分組</label><div className="sm:col-span-2"><Field label="說明"><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="這個身分組適用對象與用途" /></Field></div><div className="sm:col-span-2"><Field label="搜尋並選擇成員"><Input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="輸入使用者名稱或 Nova ID，例如：小明／NV-AB12" /></Field>{memberQuery.trim() && <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/15 p-2">{memberSearch.loading && <p className="p-2 text-xs text-muted">搜尋中…</p>}{!memberSearch.loading && !searchResults.length && <p className="p-2 text-xs text-muted">找不到啟用中的使用者。</p>}{searchResults.map((user) => <label key={user.userId} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-cyan-300/10"><input type="checkbox" checked={selectedIds.includes(user.userId)} onChange={() => toggleMember(user.userId)} className="h-4 w-4 accent-cyan-400" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{user.displayName}</span><span className="block text-[11px] text-muted">{user.novaId} · {user.email}</span></span>{selectedIds.includes(user.userId) && <Badge tone="cyan">已選</Badge>}</label>)}</div>}<p className="mt-2 text-xs text-muted">已選取 {selectedIds.length} 位使用者；點擊下方成員標籤即可移除。</p><div className="mt-2 flex flex-wrap gap-2">{selectedMembers.map((member) => <button type="button" key={member.userId} onClick={() => toggleMember(member.userId)} className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100 hover:border-rose-300/50">{member.displayName}（{member.novaId}） ×</button>)}</div></div></div><div className="mt-4 flex flex-wrap gap-2"><Button loading={busy} onClick={() => void (active ? saveGroup() : createGroup())}>{active ? "儲存身分組與成員" : "建立身分組"}</Button>{active && <Button variant="ghost" onClick={() => void removeGroup()}>刪除身分組</Button>}</div></div>
      </div>
    </Card>
    <Card title="使用方式" subtitle="建立後，在每週小考的「發布與受眾」設定選擇身分組即可。"><ol className="list-decimal space-y-2 pl-5 text-sm text-muted"><li>在成員搜尋框輸入使用者名稱或 Nova ID。</li><li>勾選要加入的使用者，已選取的成員可點擊標籤移除。</li><li>儲存身分組後，到「英文隨堂考」選擇週次，在受眾設定勾選身分組。</li><li>使用者必須同時符合公開條件、時間條件與至少一個指定受眾。</li></ol></Card>
  </div>;
}
