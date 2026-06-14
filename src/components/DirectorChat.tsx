"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProposedChange } from "@/lib/types";

/**
 * Director's Chat v2 (DIRECTOR_CHAT_V2.md) — a conversational co-director,
 * not a single-shot executor. Sends the full (capped) conversation history
 * so the agent has multi-turn memory; the agent proposes BEFORE→AFTER diffs
 * and only executes once the director approves. Proposals render as diff
 * cards with Apply / Refine / Reject.
 */

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  actions?: Array<{ type: string; target: string }>;
  suggestions?: string[];
  proposals?: ProposedChange[];
}

const MAX_HISTORY = 20;

// Contextual conversation starters per page.
const STARTERS: Record<string, string[]> = {
  cast: ["Change a character's look", "This casting doesn't match the era"],
  lock: ["The pose sheet doesn't match the headshot", "Re-cast this character"],
  locations: ["Make a location's mood warmer", "This set feels too modern"],
  scenes: ["Change the atmosphere of a scene", "The lighting here is too flat"],
  storyboard: ["Adjust the camera on a panel", "Change the action in a scene"],
  "first-frames": ["Regenerate this frame", "The lighting is too flat"],
  hub: ["Change a character's look", "Update a location's mood"],
  video: ["Push the camera in instead of panning", "This shot's motion looks off"],
};

/** Tiny markdown: **bold**, bullet lines, preserved breaks. No deps. */
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const bullet = /^\s*[-•]\s+/.test(line);
    const content = bullet ? line.replace(/^\s*[-•]\s+/, "") : line;
    const parts = content.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
      seg.startsWith("**") && seg.endsWith("**") ? (
        <strong key={j} style={{ color: "var(--brand-white)" }}>{seg.slice(2, -2)}</strong>
      ) : (
        <span key={j}>{seg}</span>
      )
    );
    return (
      <div key={i} style={bullet ? { paddingLeft: 12, position: "relative" } : undefined}>
        {bullet && <span style={{ position: "absolute", left: 0 }}>•</span>}
        {parts}
      </div>
    );
  });
}

export default function DirectorChat({
  projectId,
  currentPage,
  selectedItemId,
  onActionComplete,
}: {
  projectId: string;
  currentPage: string;
  selectedItemId?: string;
  onActionComplete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const starters = useMemo(() => STARTERS[currentPage] || STARTERS.hub, [currentPage]);

  const send = async (text?: string, baseMessages?: ChatMessage[]) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    setInput("");
    const prior = baseMessages ?? messages;
    const nextMessages: ChatMessage[] = [...prior, { role: "user", text: msg }];
    setMessages(nextMessages);
    setSending(true);
    try {
      // Cap history: always keep the first message + the most recent ones.
      let history = nextMessages.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      }));
      if (history.length > MAX_HISTORY) {
        history = [history[0], ...history.slice(history.length - (MAX_HISTORY - 1))];
      }
      const res = await fetch(`/api/projects/${projectId}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          context: { current_page: currentPage, selected_item_id: selectedItemId },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Agent error (${res.status})`);
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: data.reply || "Done.",
          actions: data.actions_taken,
          suggestions: data.suggestions,
          proposals: data.proposals,
        },
      ]);
      if ((data.actions_taken || []).length > 0) onActionComplete?.();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: `Something went wrong: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  const clearThread = () => {
    setMessages([]);
    setInput("");
  };

  const refine = () => {
    setInput("I'd change ");
    inputRef.current?.focus();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 no-print">
      {open ? (
        <div
          className="w-[440px] max-w-[calc(100vw-2rem)] rounded-xl overflow-hidden shadow-2xl flex flex-col"
          style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)", maxHeight: "78vh" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--brand-steel)", background: "rgba(255,138,42,0.04)" }}
          >
            <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--brand-orange)" }}>
              🎬 Director&apos;s Chat
            </span>
            <div className="flex items-center gap-3">
              {messages.length > 0 && (
                <button onClick={clearThread} title="New thread" className="text-[10px] uppercase tracking-widest" style={{ color: "var(--brand-gray)" }}>
                  ↻ New
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-xs" style={{ color: "var(--brand-gray)" }}>
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: 200 }}>
            {messages.length === 0 && (
              <div>
                <p className="text-[11px] leading-relaxed mb-3" style={{ color: "var(--brand-gray)" }}>
                  Give direction in plain language — I know the script, the cast, the locked choices, and the
                  visual style. I&apos;ll propose a change and show you a before/after before applying anything.
                </p>
                <div className="space-y-1.5">
                  {starters.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => send(s)}
                      className="block w-full text-left text-[11px] px-3 py-2 rounded transition-colors"
                      style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.25)" }}
                    >
                      → {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i}>
                <div
                  className="rounded-lg px-3 py-2 text-xs leading-relaxed"
                  style={{
                    background: m.role === "user" ? "rgba(255,138,42,0.08)" : "var(--brand-navy)",
                    border: m.role === "user" ? "1px solid rgba(255,138,42,0.25)" : "1px solid var(--brand-steel)",
                    color: "var(--brand-white)",
                  }}
                >
                  {m.role === "agent" ? renderMarkdown(m.text) : m.text}
                </div>

                {/* Proposal diff cards */}
                {m.proposals && m.proposals.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {m.proposals.map((p, j) => (
                      <div key={j} className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,138,42,0.4)" }}>
                        <div className="px-3 py-2 text-[10px] uppercase tracking-widest flex items-center gap-2" style={{ background: "rgba(255,138,42,0.06)", color: "var(--brand-orange)" }}>
                          📝 {p.entity_name} · {p.field}
                        </div>
                        <div className="px-3 py-2 space-y-2" style={{ background: "var(--brand-navy)" }}>
                          {p.before && (
                            <div>
                              <p className="text-[8px] uppercase tracking-widest mb-0.5" style={{ color: "#f87171" }}>Before</p>
                              <p className="text-[11px] leading-snug" style={{ color: "var(--brand-gray)" }}>{p.before}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-[8px] uppercase tracking-widest mb-0.5 text-green-400">After</p>
                            <p className="text-[11px] leading-snug" style={{ color: "var(--brand-white)" }}>{p.after}</p>
                          </div>
                          {p.reasoning && (
                            <p className="text-[10px] italic leading-snug" style={{ color: "var(--brand-cyan)" }}>Why: {p.reasoning}</p>
                          )}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => send("Apply that")}
                              disabled={sending}
                              className="text-[9px] uppercase tracking-widest px-3 py-1.5 disabled:opacity-40"
                              style={{ background: "var(--brand-orange)", color: "var(--brand-navy)", fontWeight: 700 }}
                            >
                              ✓ Apply
                            </button>
                            <button
                              onClick={refine}
                              disabled={sending}
                              className="text-[9px] uppercase tracking-widest px-3 py-1.5 disabled:opacity-40"
                              style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.35)" }}
                            >
                              ✎ Refine
                            </button>
                            <button
                              onClick={() => send("No, leave it as is")}
                              disabled={sending}
                              className="text-[9px] uppercase tracking-widest px-3 py-1.5 disabled:opacity-40"
                              style={{ color: "var(--brand-gray)", border: "1px solid var(--brand-steel)" }}
                            >
                              ✕ Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {m.actions && m.actions.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.actions.map((a, j) => (
                      <span key={j} className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded text-green-400 border border-green-800/50">
                        {a.type.replace(/_/g, " ")}: {a.target}
                      </span>
                    ))}
                  </div>
                )}
                {m.suggestions && m.suggestions.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {m.suggestions.map((s, j) => (
                      <button
                        key={j}
                        onClick={() => send(s)}
                        className="block w-full text-left text-[10px] px-2 py-1.5 rounded transition-colors"
                        style={{ color: "var(--brand-cyan)", border: "1px solid rgba(76,201,240,0.25)" }}
                      >
                        → {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <p className="text-[10px] uppercase tracking-widest animate-pulse" style={{ color: "var(--brand-orange)" }}>
                Directing…
              </p>
            )}
          </div>

          {/* Input */}
          <div className="px-3 py-3 flex gap-2 flex-shrink-0" style={{ borderTop: "1px solid var(--brand-steel)" }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Type your direction…"
              disabled={sending}
              className="flex-1 text-xs px-3 py-2 rounded-md outline-none"
              style={{ background: "var(--brand-navy)", color: "var(--brand-white)", border: "1px solid var(--brand-steel)" }}
            />
            <button
              onClick={() => send()}
              disabled={sending || !input.trim()}
              className="text-[10px] uppercase tracking-widest px-3 py-2 disabled:opacity-40"
              style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,138,42,0.4)" }}
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full px-4 py-3 text-[10px] uppercase tracking-widest font-bold shadow-xl transition-transform hover:scale-105"
          style={{ background: "var(--brand-orange)", color: "var(--brand-navy)" }}
        >
          🎬 Director&apos;s Chat
        </button>
      )}
    </div>
  );
}
