"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Textarea, useToast } from "@/components/ui";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, errorMessage } from "@/lib/api";

type Member = { userId: string; displayName: string; email?: string | null; status: string };
type Group = { id: string; name: string; description: string; badge: string; color: string; enabled: boolean; memberCount: number; members: Member[] };

export default function IdentityGroupsPage() {
  const toast = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", badge: "身分", color: "#37d3ff", enabled: true });
  const [memberIds, setMemberIds] = useState("");

  const active = useMemo(() => groups.find((group) => group.id === selected) ?? null, [groups, selected]);
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
    setMemberIds(group.members.map((member) => member.userId).join("\n"));
  }
  async function createGroup() {
    if (!form.name.trim()) return toast.push("error", "請先輸入身分組名稱");
    setBusy(true);
    try { const result = await apiPost<{ group: Group }>("/admin/identity-groups", form); toast.push("success", "身分組已建立"); await load(); selectGroup({ ...result.group, memberCount: 0, members: [] }); } catch (err) { toast.push("error", errorMessage(err)); } finally { setBusy(false); }
  }
  async function saveGroup() {
    if (!active) return;
    setBusy(true);
    try { await apiPatch(`/admin/identity-groups/${active.id}`, form); await apiPut(`/admin/identity-groups/${active.id}/members`, { userIds: memberIds.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean) }); toast.push("success", "身分組與成員已儲存"); await load(); } catch (err) { toast.push("error", errorMessage(err)); } finally { setBusy(false); }
  }
  async function removeGroup() {
    if (!active || !window.confirm(`確定刪除「${active.name}」？只會移除身分組，不會刪除使用者。`)) return;
    setBusy(true); try { await apiDelete(`/admin/identity-groups/${active.id}`); toast.push("success", "身分組已刪除"); setSelected(null); await load(); } catch (err) { toast.push("error", errorMessage(err)); } finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <Card title="身分組與定向發布" subtitle="建立「某某補習班」「試用者」「進階會員」等群組，再把每週小考或其他內容只開放給指定身分。">
      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋身分組" />
          <div className="space-y-2">
            {groups.map((group) => <button key={group.id} onClick={() => selectGroup(group)} className={`w-full rounded-xl border p-3 text-left transition ${selected === group.id ? "border-[#37d3ff] bg-cyan-300/10" : "border-[var(--line)] hover:bg-white/5"}`}><div className="flex items-center justify-between gap-2"><span className="font-medium">{group.name}</span><Badge tone={group.enabled ? "green" : "muted"}>{group.enabled ? "啟用" : "停用"}</Badge></div><p className="mt-1 text-xs text-muted">{group.badge}・{group.memberCount} 位成員</p></button>)}
            {!groups.length && <EmptyState icon="◎" title="尚未建立身分組" hint="先在右側建立第一個身分組。" />}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--line)] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="身分組名稱"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：某某補習班" /></Field>
            <Field label="標籤文字"><Input value={form.badge} onChange={(event) => setForm({ ...form, badge: event.target.value })} placeholder="補習班" /></Field>
            <Field label="顏色"><Input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} className="h-10 w-full p-1" /></Field>
            <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />啟用這個身分組</label>
            <div className="sm:col-span-2"><Field label="說明"><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="這個身分組適用對象與用途" /></Field></div>
            <div className="sm:col-span-2"><Field label="成員 User ID（每行一個，可貼上多個）"><Textarea value={memberIds} onChange={(event) => setMemberIds(event.target.value)} className="min-h-28 font-mono text-xs" placeholder="uuid-1\nuuid-2" /></Field></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2"><Button loading={busy} onClick={() => void (active ? saveGroup() : createGroup())}>{active ? "儲存身分組與成員" : "建立身分組"}</Button>{active && <Button variant="ghost" onClick={() => void removeGroup()}>刪除身分組</Button>}</div>
          {active && <div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs text-muted"><p className="font-medium text-cyan-100">目前成員清單</p><div className="mt-2 grid gap-1 sm:grid-cols-2">{active.members.map((member) => <span key={member.userId}>{member.displayName || "未命名"}・{member.userId}</span>)}</div></div>}
        </div>
      </div>
    </Card>
    <Card title="使用方式" subtitle="建立後，在每週小考的「發布與受眾」設定選擇身分組即可。"><ol className="list-decimal space-y-2 pl-5 text-sm text-muted"><li>先從使用者管理或登入紀錄取得學生的 User ID。</li><li>建立身分組並貼上 User ID，每行一個後儲存。</li><li>到「英文隨堂考」選擇週次，在受眾設定勾選身分組。</li><li>使用者必須同時符合公開條件、時間條件與至少一個指定受眾。</li></ol></Card>
  </div>;
}
