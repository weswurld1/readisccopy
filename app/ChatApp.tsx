"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const VoiceRoom = dynamic(() => import("./components/VoiceRoom"), {
  ssr: false,
});

type Message = {
  id: string;
  author: string;
  content: string;
  channel: string;
  ts: number;
};
type FriendState = { friends: string[]; incoming: string[]; outgoing: string[] };
type View =
  | { type: "channel"; id: string }
  | { type: "dm"; id: string }
  | { type: "friends"; id: "" }
  | { type: "voice"; id: string };

const CHANNELS = ["general", "random", "dev"];
const VOICE_ROOM = "lounge";
const DOWNLOAD_URL =
  "https://github.com/weswurld1/readisccopy/releases/latest/download/Relay-win-x64.zip";
const EMPTY_FRIENDS: FriendState = { friends: [], incoming: [], outgoing: [] };

export default function ChatApp({
  identity,
  onSwitch,
  switchLabel,
}: {
  identity: string;
  onSwitch: () => void;
  switchLabel: string;
}) {
  const [view, setView] = useState<View>({ type: "channel", id: "general" });

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const [online, setOnline] = useState<string[]>([]);
  const [friends, setFriends] = useState<FriendState>(EMPTY_FRIENDS);
  const [durable, setDurable] = useState<boolean | null>(null);

  const [addInput, setAddInput] = useState("");
  const [addMsg, setAddMsg] = useState("");

  const [inVoice, setInVoice] = useState(false);
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [live, setLive] = useState<{ url: string; token: string } | null>(null);

  const sinceRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const viewKey = `${view.type}:${view.id}`;

  const isOnline = useCallback((u: string) => online.includes(u), [online]);

  // ---- sync loop: presence + friends ----
  const sync = useCallback(async () => {
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ me: identity }),
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        online: string[];
        friends: FriendState | null;
        durable: boolean;
      };
      setOnline(data.online ?? []);
      if (data.friends) setFriends(data.friends);
      setDurable(data.durable);
    } catch {}
  }, [identity]);

  useEffect(() => {
    sync();
    const id = setInterval(sync, 3000);
    return () => clearInterval(id);
  }, [sync]);

  // ---- message loop (channel or dm) ----
  useEffect(() => {
    setMessages([]);
    sinceRef.current = 0;
  }, [viewKey]);

  const pollMessages = useCallback(async () => {
    let url = "";
    if (view.type === "channel") {
      url = `/api/messages?channel=${encodeURIComponent(view.id)}&since=${sinceRef.current}`;
    } else if (view.type === "dm") {
      url = `/api/dm?me=${encodeURIComponent(identity)}&peer=${encodeURIComponent(view.id)}&since=${sinceRef.current}`;
    } else {
      return;
    }
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: Message[] };
      if (data.messages?.length) {
        sinceRef.current = data.messages[data.messages.length - 1].ts;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const next = [...prev];
          for (const m of data.messages) if (!seen.has(m.id)) next.push(m);
          return next;
        });
      }
    } catch {}
  }, [identity, view]);

  useEffect(() => {
    if (view.type !== "channel" && view.type !== "dm") return;
    pollMessages();
    const id = setInterval(pollMessages, 1500);
    return () => clearInterval(id);
  }, [pollMessages, view.type]);

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
      if (view.type === "channel") {
        await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, author: identity, channel: view.id }),
        });
      } else if (view.type === "dm") {
        await fetch("/api/dm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, me: identity, peer: view.id }),
        });
      }
      await pollMessages();
    } finally {
      setSending(false);
    }
  }

  // ---- friends actions ----
  async function friendAction(action: string, target: string) {
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ me: identity, target, action }),
      });
      const data = (await res.json()) as {
        friends?: FriendState;
        error?: string;
      };
      if (data.friends) setFriends(data.friends);
      if (data.error) setAddMsg(data.error);
    } catch {}
  }

  async function addFriend(e: React.FormEvent) {
    e.preventDefault();
    const target = addInput.trim().slice(0, 32);
    setAddMsg("");
    if (!target) return;
    if (target === identity) {
      setAddMsg("You can't add yourself.");
      return;
    }
    await friendAction("request", target);
    setAddInput("");
    setAddMsg(`Friend request sent to ${target}.`);
  }

  // ---- voice shell (presence-only; skipped when LiveKit audio is active) ----
  useEffect(() => {
    const active = view.type === "voice" || inVoice;
    if (!active || live) return;

    const tick = async () => {
      try {
        if (inVoice) {
          const res = await fetch("/api/voice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              me: identity,
              room: VOICE_ROOM,
              action: "ping",
            }),
          });
          const data = (await res.json()) as { participants: string[] };
          setParticipants(data.participants ?? []);
        } else {
          const res = await fetch(`/api/voice?room=${VOICE_ROOM}`, {
            cache: "no-store",
          });
          const data = (await res.json()) as { participants: string[] };
          setParticipants(data.participants ?? []);
        }
      } catch {}
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [view.type, inVoice, identity, live]);

  async function joinVoice() {
    // Try real audio first; fall back to the presence-only shell.
    try {
      const res = await fetch(
        `/api/voice/token?room=${VOICE_ROOM}&identity=${encodeURIComponent(identity)}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as {
        enabled: boolean;
        url?: string;
        token?: string;
      };
      if (data.enabled && data.url && data.token) {
        setLive({ url: data.url, token: data.token });
        setInVoice(true);
        return;
      }
    } catch {}
    setLive(null);
    setInVoice(true);
    await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ me: identity, room: VOICE_ROOM, action: "join" }),
    });
  }
  async function leaveVoice() {
    const wasLive = live !== null;
    setLive(null);
    setInVoice(false);
    if (!wasLive) {
      await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          me: identity,
          room: VOICE_ROOM,
          action: "leave",
        }),
      });
    }
  }

  // leave voice on unload
  useEffect(() => {
    if (!inVoice) return;
    const handler = () =>
      navigator.sendBeacon?.(
        "/api/voice",
        new Blob(
          [JSON.stringify({ me: identity, room: VOICE_ROOM, action: "leave" })],
          { type: "application/json" }
        )
      );
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [inVoice, identity]);

  const header =
    view.type === "channel"
      ? `# ${view.id}`
      : view.type === "dm"
        ? `@ ${view.id}`
        : view.type === "voice"
          ? `🔊 ${view.id}`
          : "Friends";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" />
          Relay
        </div>

        <nav className="channels">
          <button
            className={`channel wide${view.type === "friends" ? " active" : ""}`}
            onClick={() => setView({ type: "friends", id: "" })}
          >
            👥 Friends
            {friends.incoming.length > 0 && (
              <span className="badge">{friends.incoming.length}</span>
            )}
          </button>

          <div className="channels-label">Text Channels</div>
          {CHANNELS.map((c) => (
            <button
              key={c}
              className={`channel${view.type === "channel" && view.id === c ? " active" : ""}`}
              onClick={() => setView({ type: "channel", id: c })}
            >
              <span className="hash">#</span>
              {c}
            </button>
          ))}

          <div className="channels-label">Voice</div>
          <button
            className={`channel${view.type === "voice" ? " active" : ""}`}
            onClick={() => setView({ type: "voice", id: VOICE_ROOM })}
          >
            🔊 {VOICE_ROOM}
            {participants.length > 0 && (
              <span className="count">{participants.length}</span>
            )}
          </button>

          <div className="channels-label">Direct Messages</div>
          {friends.friends.length === 0 && (
            <div className="hint">Add friends to DM them.</div>
          )}
          {friends.friends.map((f) => (
            <button
              key={f}
              className={`channel${view.type === "dm" && view.id === f ? " active" : ""}`}
              onClick={() => setView({ type: "dm", id: f })}
            >
              <span className={`dot ${isOnline(f) ? "on" : "off"}`} />
              {f}
            </button>
          ))}
        </nav>

        <div className="me">
          <div className="me-row">
            <span className={`dot on`} />
            <span className="me-name">{identity}</span>
            <button className="link" onClick={onSwitch}>
              {switchLabel}
            </button>
          </div>
          <div className="note small">
            {durable === null
              ? "Connecting…"
              : durable
                ? "Synced across everyone"
                : "In-memory mode (resets on cold starts)"}
          </div>
          <a className="download-link" href={DOWNLOAD_URL}>
            ⬇ Get the Windows app
          </a>
        </div>
      </aside>

      <main className="main">
        <header className="header">{header}</header>

        {view.type === "friends" ? (
          <FriendsPanel
            identity={identity}
            friends={friends}
            isOnline={isOnline}
            addInput={addInput}
            setAddInput={setAddInput}
            addFriend={addFriend}
            addMsg={addMsg}
            friendAction={friendAction}
            openDM={(f) => setView({ type: "dm", id: f })}
          />
        ) : view.type === "voice" ? (
          live && inVoice ? (
            <div className="panel">
              <VoiceRoom
                url={live.url}
                token={live.token}
                me={identity}
                onLeave={leaveVoice}
              />
            </div>
          ) : (
            <VoicePanel
              room={view.id}
              inVoice={inVoice}
              muted={muted}
              setMuted={setMuted}
              participants={participants}
              me={identity}
              join={joinVoice}
              leave={leaveVoice}
            />
          )
        ) : (
          <>
            <div className="messages">
              {messages.length === 0 ? (
                <div className="empty">
                  {view.type === "dm" ? (
                    <>
                      This is the start of your DMs with{" "}
                      <strong>{view.id}</strong>.
                    </>
                  ) : (
                    <>
                      No messages yet in <strong>#{view.id}</strong>. Say hello!
                    </>
                  )}
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
                  placeholder={
                    view.type === "dm"
                      ? `Message @${view.id}`
                      : `Message #${view.id}`
                  }
                  maxLength={2000}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button type="submit" disabled={sending || !draft.trim()}>
                  Send
                </button>
              </form>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function FriendsPanel(props: {
  identity: string;
  friends: FriendState;
  isOnline: (u: string) => boolean;
  addInput: string;
  setAddInput: (v: string) => void;
  addFriend: (e: React.FormEvent) => void;
  addMsg: string;
  friendAction: (action: string, target: string) => void;
  openDM: (f: string) => void;
}) {
  const { friends, isOnline } = props;
  return (
    <div className="panel">
      <section className="card">
        <h3>Add friend</h3>
        <form className="add-form" onSubmit={props.addFriend}>
          <input
            value={props.addInput}
            placeholder="username"
            maxLength={32}
            onChange={(e) => props.setAddInput(e.target.value)}
          />
          <button type="submit">Send request</button>
        </form>
        {props.addMsg && <div className="add-msg">{props.addMsg}</div>}
      </section>

      {friends.incoming.length > 0 && (
        <section className="card">
          <h3>Incoming requests</h3>
          {friends.incoming.map((u) => (
            <div className="frow" key={u}>
              <span className={`dot ${isOnline(u) ? "on" : "off"}`} />
              <span className="fname">{u}</span>
              <button onClick={() => props.friendAction("accept", u)}>
                Accept
              </button>
              <button
                className="ghost"
                onClick={() => props.friendAction("decline", u)}
              >
                Decline
              </button>
            </div>
          ))}
        </section>
      )}

      {friends.outgoing.length > 0 && (
        <section className="card">
          <h3>Pending (sent)</h3>
          {friends.outgoing.map((u) => (
            <div className="frow" key={u}>
              <span className={`dot ${isOnline(u) ? "on" : "off"}`} />
              <span className="fname">{u}</span>
              <span className="muted">pending…</span>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h3>Friends — {friends.friends.length}</h3>
        {friends.friends.length === 0 ? (
          <div className="hint">No friends yet. Add someone above.</div>
        ) : (
          friends.friends.map((u) => (
            <div className="frow" key={u}>
              <span className={`dot ${isOnline(u) ? "on" : "off"}`} />
              <span className="fname">{u}</span>
              <span className="muted">{isOnline(u) ? "online" : "offline"}</span>
              <button onClick={() => props.openDM(u)}>Message</button>
              <button
                className="ghost"
                onClick={() => props.friendAction("remove", u)}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function VoicePanel(props: {
  room: string;
  inVoice: boolean;
  muted: boolean;
  setMuted: (v: boolean) => void;
  participants: string[];
  me: string;
  join: () => void;
  leave: () => void;
}) {
  return (
    <div className="panel">
      <div className="voice-banner">
        🎧 Voice shell — the participant list is live, but there’s no audio yet.
        Set LiveKit env vars to enable real audio in room{" "}
        <code>{props.room}</code>.
      </div>

      <section className="card">
        <h3>In the room — {props.participants.length}</h3>
        {props.participants.length === 0 ? (
          <div className="hint">Nobody here yet. Join to start the room.</div>
        ) : (
          <div className="voice-grid">
            {props.participants.map((u) => (
              <div className="voice-tile" key={u}>
                <div className="avatar">{u.slice(0, 2).toUpperCase()}</div>
                <span className="fname">
                  {u}
                  {u === props.me ? " (you)" : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="voice-controls">
          {!props.inVoice ? (
            <button onClick={props.join}>Join room</button>
          ) : (
            <>
              <button
                className={props.muted ? "ghost" : ""}
                onClick={() => props.setMuted(!props.muted)}
                title="Local only — no audio is transmitted yet"
              >
                {props.muted ? "Unmute" : "Mute"}
              </button>
              <button className="danger" onClick={props.leave}>
                Leave
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
