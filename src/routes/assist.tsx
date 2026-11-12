import { createFileRoute } from "@tanstack/react-router";
import { Bot, HelpCircle, Send, ShieldCheck, User } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSchoolStore } from "@/lib/school-store";
import { requireRoles } from "@/lib/route-guards";
import { askSchoolAssistant } from "@/lib/assistant.functions";

export const Route = createFileRoute("/assist")({
  ssr: false,
  beforeLoad: () => requireRoles(["admin", "principal", "teacher", "bursar", "security"]),
  component: AssistPage,
});
type Message = { role: "user" | "assistant"; text: string };
const prompts = [
  "Summarise today's attendance.",
  "Who is absent today?",
  "List students marked late.",
  "How much is outstanding in fees?",
  "Which students scored below 40% in Mathematics?",
  "Generate the first-term academic performance report.",
  "How many teachers are employed?",
  "How many visitors are on campus?",
];
function AssistPage() {
  const { state } = useSchoolStore();
  const askAssistant = useServerFn(askSchoolAssistant);
  const [messages, setMessages] = useState<Message[]>([]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ask = async (text = value) => {
    const clean = text.trim();
    if (!clean || busy) return;
    if (!state.school?.id) {
      setError("Select a school workspace before asking a question.");
      return;
    }
    const conversation = [...messages, { role: "user" as const, text: clean }];
    setError("");
    setBusy(true);
    setMessages(conversation);
    setValue("");
    try {
      const result = await askAssistant({
        data: {
          schoolId: state.school.id,
          messages: conversation.slice(-12).map(({ role, text: content }) => ({ role, content })),
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessages((current) => [...current, { role: "assistant", text: result.answer }]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The assistant could not answer. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AppShell
      title="School Data Assistant"
      subtitle="Ask common school-data questions and get answers from your selected workspace"
    >
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(250px,.7fr)]">
        <section className="hairline-card flex min-h-[520px] min-w-0 flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
              <Bot className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-semibold">School data assistant</h2>
              <p className="text-xs text-muted-foreground">
                Read-only answers grounded in records your role is allowed to see.
              </p>
            </div>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Ask a school-data question naturally.</p>
                <p className="mt-1">
                  I can look up attendance, fee balances, academic results, staff, and visitor
                  information your role is allowed to see.
                </p>
              </div>
            ) : null}
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-full ${m.role === "assistant" ? "bg-gold/15 text-gold" : "bg-primary/10 text-primary"}`}
                >
                  {m.role === "assistant" ? (
                    <Bot className="size-4" />
                  ) : (
                    <User className="size-4" />
                  )}
                </span>
                <div
                  className={`max-w-[84%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm ${m.role === "assistant" ? "bg-muted" : "bg-primary text-primary-foreground"}`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {busy ? (
              <p className="text-sm text-muted-foreground" role="status">
                Checking permitted school records…
              </p>
            ) : null}
            {error ? (
              <p
                className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </div>
          <p className="px-4 pb-2 text-xs text-muted-foreground">
            No external AI service is used. Questions are processed by SchoolPulse and relevant
            results are fetched from this school’s database. Chats are not saved by SchoolPulse.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
            className="flex gap-2 border-t border-border p-3 sm:p-4"
          >
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ask in your own words…"
              aria-label="Ask the operations assistant"
              maxLength={2000}
              disabled={busy}
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Send question"
              disabled={busy || !value.trim()}
            >
              <Send className="size-4" />
            </Button>
          </form>
        </section>
        <section className="hairline-card min-w-0 p-5">
          <h3 className="display-title flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-gold" /> Suggested questions
          </h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            These are starting points, not a fixed command list.
          </p>
          <div className="mt-4 space-y-2">
            {prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void ask(prompt)}
                className="flex w-full items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-left text-sm transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <HelpCircle className="mt-0.5 size-4 shrink-0 text-primary" />
                {prompt}
              </button>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
