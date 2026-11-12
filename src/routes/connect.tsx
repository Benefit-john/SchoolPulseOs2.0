import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare, Plus, Reply, Send, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { requireRoles } from "@/lib/route-guards";

export const Route = createFileRoute("/connect")({ ssr: false, beforeLoad: () => requireRoles(["admin", "principal", "teacher", "parent", "student"]), component: ConnectPage });
const db = () => supabase as any;
type Thread = { id: string; subject: string; student_id: string | null; last_message_at: string; members?: { user_id: string }[] };
type Message = { id: string; body: string; sender_id: string; created_at: string };

function ConnectPage() {
  const [userId, setUserId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Thread | null>(null);
  const [recipients, setRecipients] = useState<{ id: string; name: string; role: string }[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    setUserId(user.user.id);
    const { data: membership } = await db().from("school_memberships").select("school_id").eq("user_id", user.user.id).limit(1).maybeSingle();
    if (!membership?.school_id) return;
    setSchoolId(membership.school_id);
    const [threadResult, staffResult] = await Promise.all([
      db().from("message_threads").select("id,subject,student_id,last_message_at,message_thread_members(user_id)").eq("school_id", membership.school_id).order("last_message_at", { ascending: false }),
      db().from("staff_directory").select("user_id,full_name,role_title").eq("school_id", membership.school_id).eq("active", true).not("user_id", "is", null).order("full_name"),
    ]);
    const available = (threadResult.data ?? []).filter((thread: Thread & { message_thread_members?: { user_id: string }[] }) => (thread.message_thread_members ?? []).some((member) => member.user_id === user.user.id));
    setThreads(available);
    setRecipients((staffResult.data ?? []).filter((row: any) => row.user_id).map((row: any) => ({ id: row.user_id, name: row.full_name, role: row.role_title })));
    if (available.length && !selected) await selectThread(available[0]);
  };
  const selectThread = async (thread: Thread) => { setSelected(thread); const { data } = await db().from("message_thread_messages").select("id,body,sender_id,created_at").eq("thread_id", thread.id).order("created_at"); setMessages(data ?? []); };
  useEffect(() => { void load(); }, []);
  const startThread = async () => {
    if (!schoolId || !userId || !recipientId || !subject.trim() || !body.trim()) { setNotice("Choose a recipient and add a subject and message."); return; }
    setBusy(true); setNotice("");
    const { data: thread, error } = await db().from("message_threads").insert({ school_id: schoolId, subject: subject.trim(), created_by: userId }).select("id,subject,student_id,last_message_at").single();
    if (!error && thread) {
      await db().from("message_thread_members").insert([{ thread_id: thread.id, user_id: userId }, { thread_id: thread.id, user_id: recipientId }]);
      await db().from("message_thread_messages").insert({ thread_id: thread.id, sender_id: userId, body: body.trim() });
      setSubject(""); setBody(""); setRecipientId(""); setNotice("Conversation started."); await load(); await selectThread(thread);
    } else setNotice(error?.message ?? "Could not start conversation.");
    setBusy(false);
  };
  const reply = async () => { if (!selected || !userId || !body.trim()) return; setBusy(true); const { error } = await db().from("message_thread_messages").insert({ thread_id: selected.id, sender_id: userId, body: body.trim() }); setBusy(false); if (error) setNotice(error.message); else { setBody(""); await selectThread(selected); await load(); } };

  return <AppShell title="Connect" subtitle="Two-way parent, teacher, and school conversations"><div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]"><section className="hairline-card p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Conversations</h2><Badge variant="outline">{threads.length}</Badge></div><div className="mt-4 space-y-2">{threads.map((thread) => <button key={thread.id} onClick={() => void selectThread(thread)} className={`w-full rounded-lg border p-3 text-left transition ${selected?.id === thread.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}><p className="truncate text-sm font-medium">{thread.subject}</p><p className="mt-1 text-xs text-muted-foreground">Updated {new Date(thread.last_message_at).toLocaleString()}</p></button>)}{!threads.length ? <p className="text-sm text-muted-foreground">No conversations yet. Start one with a school team member.</p> : null}</div></section><section className="hairline-card min-h-[520px] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-semibold"><MessageSquare className="size-4 text-primary" /> {selected?.subject ?? "New conversation"}</h2><p className="mt-1 text-xs text-muted-foreground">Replies stay grouped in one conversation instead of creating separate messages.</p></div><Badge variant="outline"><Users className="mr-1 size-3" /> Threaded</Badge></div>{selected ? <div className="mt-6 space-y-3">{messages.map((message) => <article key={message.id} className={`max-w-[85%] rounded-xl p-3 ${message.sender_id === userId ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}><p className="whitespace-pre-wrap text-sm">{message.body}</p><p className={`mt-1 text-[11px] ${message.sender_id === userId ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{new Date(message.created_at).toLocaleString()}</p></article>)}{!messages.length ? <p className="text-sm text-muted-foreground">No messages in this thread yet.</p> : null}</div> : <div className="mt-6 grid gap-3 rounded-xl border border-dashed border-border p-4"><label className="text-sm font-medium">Recipient<select value={recipientId} onChange={(event) => setRecipientId(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select a school team member</option>{recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name} · {recipient.role}</option>)}</select></label><Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" /><Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write your message" rows={5} /><Button disabled={busy} onClick={() => void startThread()}><Plus className="mr-2 size-4" /> Start conversation</Button></div>}<div className="mt-6 flex gap-2"><Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={selected ? "Write a reply…" : "Choose a conversation or start a new one"} rows={3} disabled={!selected} /><Button size="icon" aria-label={selected ? "Send reply" : "Start conversation"} disabled={!selected || busy || !body.trim()} onClick={() => void reply()}><Reply className="size-4" /></Button></div>{notice ? <p className="mt-3 text-sm text-muted-foreground" role="status">{notice}</p> : null}</section></div></AppShell>;
}
