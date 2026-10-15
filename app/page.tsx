"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  author: string;
  content: string;
  channel: string;
  ts: number;
};

const CHANNELS = ["general", "random", "dev"];

function randomName() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `guest-${n}`;
}

export default function Page() {
  const [channel, setChannel] = useState("general");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const sinceRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load / persist display name locally (per-viewer convenience only).
  useEffect(() => {
    let stored = "";
    try {
      stored = localStorage.getItem("relay-name") || "";
    } catch {}
    const n = stored || randomName();
    setName(n);
    try {
      localStorage.setItem("relay-name", n);
    } catch {}
  }, []);

  useEffect(() => {
    if (!name) return;
    try {
      localStorage.setItem("relay-name", name);
    } catch {}
  }, [name]);

  // Reset when switching channel.
  useEffect(() => {
    setMessages([]);
    sinceRef.current = 0;
  }, [channel]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/messages?channel=${encodeURIComponent(channel)}&since=${sinceRef.current}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { messages: Message[] };
      if (data.messages.length > 0) {
        sinceRef.current = data.messages[data.messages.length - 1].ts;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const next = [...prev];
          for (const m of data.messages) if (!seen.has(m.id)) next.push(m);
          return next;
        });
      }
    } catch {
      // network hiccup; next tick retries
    }
  }, [channel]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft("");
    try {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, author: name, channel }),
      });
      await poll();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" />
          Relay
        </div>
        <nav className="channels">
          <div className="channels-label">Channels</div>
          {CHANNELS.map((c) => (
            <button
              key={c}
              className={`channel${c === channel ? " active" : ""}`}
              onClick={() => setChannel(c)}
            >
              <span className="hash">#</span>
              {c}
            </button>
          ))}
        </nav>
        <div className="me">
          <label className="me-label" htmlFor="name">
            Your name
          </label>
          <input
            id="name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </aside>

      <main className="main">
        <header className="header">
          <span className="hash">#</span>
          {channel}
        </header>

        <div className="messages">
          {messages.length === 0 ? (
            <div className="empty">
              No messages yet in <strong>#{channel}</strong>.
              <br />
              Say hello — anyone on this instance will see it.
            </div>
          ) : (
            messages.map((m) => (
              <div className="msg" key={m.id}>
                <span className="msg-author">{m.author}</span>
                <span className="msg-time">
                  {new Date(m.ts).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="msg-content">{m.content}</span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className="composer">
          <form onSubmit={send}>
            <input
              value={draft}
              placeholder={`Message #${channel}`}
              maxLength={2000}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" disabled={sending || !draft.trim()}>
              Send
            </button>
          </form>
          <div className="note">
            No database yet — messages are in-memory and reset on redeploys and
            cold starts.
          </div>
        </div>
      </main>
    </div>
  );
}
