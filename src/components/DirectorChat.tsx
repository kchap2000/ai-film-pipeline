"use client";

import { useEffect, useRef, useState } from "react";
import { useDictation } from "@/lib/use-dictation";

/**
 * Director's Chat (FINAL_VISION.md — Agent Revision System).
 * Collapsible bottom-right drawer mounted on every pipeline page. Sends
 * natural-language direction to /api/projects/:id/agent; the agent updates
 * records and triggers regeneration, then reports actions + suggestions.
 */

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  actions?: Array<{ type: string; target: string }>;
  suggestions?: string[];
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
  const dictation = useDictation((text, isFinal) => {
    if (isFinal) setInput((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${text.trim()}`);
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const send = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setSending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          context: { current_page: currentPage, selected_item_id: selectedItemId },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Agent error (${res.status})`);
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: data.reply || "Done.", actions: data.actions_taken, suggestions: data.suggestions },
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

  return (
    <div className="fixed bottom-4 right-4 z-50 no-print">
      {open ? (
        <div
          className="w-[380px] max-w-[calc(100vw-2rem)] rounded-xl overflow-hidden shadow-2xl flex flex-col"
          style={{ background: "var(--brand-mid)", border: "1px solid var(--brand-steel)", maxHeight: "70vh" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--brand-steel)", background: "rgba(255,138,42,0.04)" }}
          >
            <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--brand-orange)" }}>
              🎬 Director&apos;s Chat
            </span>
            <button onClick={() => setOpen(false)} className="text-xs" style={{ color: "var(--brand-gray)" }}>
              ✕
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: 160 }}>
            {messages.length === 0 && (
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--brand-gray)" }}>
                Give direction in plain language — I know the script, the cast, the locked choices, and the visual style.
                Try: &ldquo;Make the kitchen more rustic — exposed brick, warm wood tones&rdquo; or
                &ldquo;Push the camera in on panel 3 instead of panning&rdquo;.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i}>
                <div
                  className="rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap"
                  style={{
                    background: m.role === "user" ? "rgba(255,138,42,0.08)" : "var(--brand-navy)",
                    border: m.role === "user" ? "1px solid rgba(255,138,42,0.25)" : "1px solid var(--brand-steel)",
                    color: "var(--brand-white)",
                  }}
                >
                  {m.text}
                </div>
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={dictation.listening ? "Listening… speak your direction" : "Type your direction…"}
              disabled={sending}
              className="flex-1 text-xs px-3 py-2 rounded-md outline-none"
              style={{ background: "var(--brand-navy)", color: "var(--brand-white)", border: dictation.listening ? "1px solid rgba(239,68,68,0.6)" : "1px solid var(--brand-steel)" }}
            />
            {dictation.supported && (
              <button
                onClick={dictation.toggle}
                title={dictation.listening ? "Stop dictation" : "Dictate"}
                className={`text-sm px-2.5 py-2 rounded-md ${dictation.listening ? "animate-pulse" : ""}`}
                style={{
                  color: dictation.listening ? "#f87171" : "var(--brand-gray)",
                  border: dictation.listening ? "1px solid rgba(239,68,68,0.5)" : "1px solid var(--brand-steel)",
                }}
              >
                {dictation.listening ? "■" : "🎙"}
              </button>
            )}
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
