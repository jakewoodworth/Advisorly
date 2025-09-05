"use client";

import { useEffect, useRef, useState } from "react";

type Message = { id: string; role: "user" | "assistant" | "system"; content: string; createdAt?: number; voted?: boolean };

export default function DemoPage() {
  const TypingDots = () => (
    <div className="flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-pulse" style={{ animationDelay: "0ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-pulse" style={{ animationDelay: "200ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-pulse" style={{ animationDelay: "400ms" }} />
    </div>
  );
  const mkId = () => `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const [messages, setMessages] = useState<Message[]>([
    { id: mkId(), role: "assistant", content: "Hi! Ask me about ACI-NA conferences or programming.", createdAt: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voting, setVoting] = useState<Record<string, boolean>>({});
  const lastUserRef = useRef<string>("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [expiry, setExpiry] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    // Fetch demo expiry from server-side env
    (async () => {
      try {
        const res = await fetch("/api/config", { cache: "no-store" });
        const data = await res.json();
        const e = (data?.demoExpiry as string) || null;
        setExpiry(e);
        if (e) {
          const d = new Date(e);
          if (!Number.isNaN(d.getTime())) {
            const now = new Date();
            setExpired(now > d);
          }
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const appendMessage = (role: Message["role"], content: string): string => {
    const id = mkId();
    setMessages((m) => [...m, { id, role, content, createdAt: Date.now() }]);
    return id;
  };

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setLoading(true);
    appendMessage("user", text);
    lastUserRef.current = text;
    // Placeholder assistant bubble while waiting
    const placeholderId = appendMessage("assistant", "typing…");
    setInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        // Friendly rate-limit message with hours remaining
        const resetAt = data?.resetAt ? new Date(data.resetAt) : null;
        const msLeft = resetAt ? Math.max(0, resetAt.getTime() - Date.now()) : 0;
        const hrs = Math.ceil(msLeft / (60 * 60 * 1000));
        const msg = `You’ve hit today’s limit. Please try again in about ${hrs || 1} hour(s).`;
        setMessages((m) => m.map((msg0) => (msg0.id === placeholderId ? { ...msg0, content: msg } : msg0)));
        return;
      }

      if (!res.ok) throw new Error("bad_status");

      const answer = (data?.answer as string) || "I had trouble answering that.";
      setMessages((m) => m.map((msg) => (msg.id === placeholderId ? { ...msg, content: answer } : msg)));
    } catch (err) {
      // Inline compact error bubble with Retry
      setMessages((m) =>
        m.map((msg) =>
          msg.id === placeholderId
            ? {
                ...msg,
                content: "There was a network error.",
              }
            : msg
        )
      );
      // Add a tiny retry control just below the error bubble
      const retryId = appendMessage(
        "assistant",
        "Retry"
      );
      // Replace the 'Retry' text with a button-like chip behavior
      setMessages((m) =>
        m.map((mm) =>
          mm.id === retryId
            ? {
                ...mm,
                content: "[retry]",
              }
            : mm
        )
      );
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl md:max-w-3xl lg:max-w-4xl">
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2 text-xs">
          <strong>Demo — Internal Evaluation Only.</strong> Not production-ready. <span className="opacity-80">Answers do not include sources.</span>
          {expiry ? (
            <span className="ml-2 opacity-80">Demo access expires on {new Date(expiry).toLocaleDateString()}.</span>
          ) : null}
        </div>
        <header className="text-center mb-3">
          <h1 className="text-sm font-medium text-neutral-600">
            Arkand AI • ACI-NA Chatbot — Demo
          </h1>
        </header>
        {/* About this Demo disclosure */}
        <div className="mb-3">
          <button
            type="button"
            aria-expanded={aboutOpen}
            onClick={() => setAboutOpen((v) => !v)}
            className="w-full flex items-center justify-between rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 px-3 py-2 text-left"
          >
            <span className="text-sm text-neutral-700">ℹ️ About this Demo</span>
            <span className={`ml-2 inline-block transform transition-transform ${aboutOpen ? "rotate-90" : "rotate-0"}`} aria-hidden>
              ▶
            </span>
          </button>
          {aboutOpen && (
            <div className="mt-2 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
              <ul className="list-disc pl-5 space-y-1">
                <li>This demo is hosted by Arkand AI</li>
                <li>Answers are limited to public conference FAQs</li>
                <li>No sources or private data included</li>
                <li>Production version includes full content + integrations.</li>
              </ul>
            </div>
          )}
        </div>
        <div className="bg-white border border-neutral-200 shadow-sm rounded-xl flex flex-col h-[80vh] max-h-[900px]">
          {expired ? (
            <div className="p-6 text-center text-sm text-neutral-700">
              This demo has expired. Contact Arkand AI for a full version.
            </div>
          ) : (
            <>
          <div className="px-4 py-3 border-b border-neutral-200">
            <p className="text-xs text-neutral-500">
              Ask a question. Press Enter to send, Shift+Enter for a newline.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth">
            {messages.length === 1 && messages[0]?.role === "assistant" && (
              <div className="text-center text-neutral-600 text-sm mt-6">
                <div className="mb-3">Try one of these:</div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {[
                    "What’s included with registration?",
                    "What’s the refund policy?",
          "How do I sponsor an event?",
          "How do I exhibit at the Annual Conference?",
          "Which days include meals?",
          "How do I join a committee?",
                  ].map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => {
            setInput(ex);
            void sendMessage(ex);
                      }}
                      className="px-3 py-1.5 rounded-full border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 text-xs"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, idx) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%]">
                  <div
                    className={
                      "whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm border " +
                      (m.role === "user"
                        ? "bg-blue-50 text-blue-900 border-blue-200 rounded-br-md"
                        : "bg-neutral-100 text-neutral-900 border-neutral-200 rounded-bl-md")
                    }
                  >
        {m.role === "assistant" && m.content === "typing…" ? (
                      <TypingDots />
                    ) : m.role === "assistant" && m.content === "[retry]" ? (
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded border border-neutral-300 bg-white hover:bg-neutral-50"
                        onClick={() => {
          void sendMessage(lastUserRef.current);
                        }}
                      >
                        Retry
                      </button>
                    ) : (
                      m.content
                    )}
                  </div>
      {m.role === "assistant" && m.content !== "typing…" && m.content !== "[retry]" && (
                    <div className="mt-1 flex items-center gap-2 text-neutral-400">
                      <button
                        type="button"
                        disabled={!!m.voted || !!voting[m.id]}
                        onClick={async () => {
                          setVoting((v) => ({ ...v, [m.id]: true }));
                          try {
                            await fetch("/api/feedback", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ messageId: m.id, vote: "up" }),
                            });
                            setMessages((msgs) => msgs.map((mm) => (mm.id === m.id ? { ...mm, voted: true } : mm)));
                          } finally {
                            setVoting((v) => ({ ...v, [m.id]: false }));
                          }
                        }}
                        className="text-[11px] px-1 py-0.5 rounded hover:text-neutral-600 disabled:opacity-40"
                        aria-label="Thumbs up"
                        title="Thumbs up"
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        disabled={!!m.voted || !!voting[m.id]}
                        onClick={async () => {
                          setVoting((v) => ({ ...v, [m.id]: true }));
                          try {
                            await fetch("/api/feedback", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ messageId: m.id, vote: "down" }),
                            });
                            setMessages((msgs) => msgs.map((mm) => (mm.id === m.id ? { ...mm, voted: true } : mm)));
                          } finally {
                            setVoting((v) => ({ ...v, [m.id]: false }));
                          }
                        }}
                        className="text-[11px] px-1 py-0.5 rounded hover:text-neutral-600 disabled:opacity-40"
                        aria-label="Thumbs down"
                        title="Thumbs down"
                      >
                        👎
                      </button>
                    </div>
                  )}
                  {m.createdAt && (
                    <div className={`mt-1 text-[10px] leading-none text-neutral-400 ${m.role === "user" ? "text-right" : "text-left"}`}>
                      {new Date(m.createdAt).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="border-t border-neutral-200 p-3">
            {/* Quick suggestion chips */}
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              {[
                "What’s included with registration?",
                "What’s the refund policy?",
                "How do I sponsor an event?",
                "How do I exhibit at the Annual Conference?",
                "Which days include meals?",
                "How do I join a committee?",
              ].map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="px-2.5 py-1 rounded-full border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                  onClick={() => {
                    setInput(ex);
                    void sendMessage(ex);
                  }}
                >
                  Try this: {ex}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Type your question..."
                rows={2}
                className="flex-1 resize-none rounded-lg border border-neutral-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-200 outline-none p-3 text-sm max-h-40"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={loading || input.trim().length === 0}
                className="shrink-0 inline-flex items-center justify-center rounded-lg bg-blue-600 text-white text-sm font-medium h-10 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
