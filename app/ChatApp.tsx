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
  image?: string;
};
type FriendState = { friends: string[]; incoming: string[]; outgoing: string[] };
type Guild = { id: string; name: string; owner: string };
type View =
  | { type: "friends" }
  | { type: "dm"; id: string }
  | { type: "channel"; gid: string; id: string }
  | { type: "voice"; gid: string };
type Dialog =
  | null
  | { kind: "create" }
  | { kind: "join" }
  | { kind: "addChannel" }
  | { kind: "invite"; code: string };

const DOWNLOAD_URL =
  "https://github.com/weswurld1/readisccopy/releases/latest/download/Relay-Setup.exe";
const EMPTY_FRIENDS: FriendState = { friends: [], incoming: [], outgoing: [] };

export default function ChatApp({
  identity,
  onSwitch,
  switchLabel,
  accountControl,
  avatarUrl,
}: {
  identity: string;
  onSwitch?: () => void;
  switchLabel?: string;
  accountControl?: React.ReactNode;
  avatarUrl?: string;
}) {
  const [view, setView] = useState<View>({ type: "friends" });

  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [channels, setChannels] = useState<string[]>(["general"]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogInput, setDialogInput] = useState("");
  const [dialogError, setDialogError] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const [online, setOnline] = useState<string[]>([]);
  const [friends, setFriends] = useState<FriendState>(EMPTY_FRIENDS);
  const [durable, setDurable] = useState<boolean | null>(null);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [activities, setActivities] = useState<Record<string, string>>({});
  const [myActivity, setMyActivity] = useState("");
  const [profile, setProfile] = useState<string | null>(null);

  const [addInput, setAddInput] = useState("");
  const [addMsg, setAddMsg] = useState("");

  const [inVoice, setInVoice] = useState(false);
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [live, setLive] = useState<{ url: string; token: string } | null>(null);

  const sinceRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastVoiceRoom = useRef("");
  const fileRef = useRef<HTMLInputElement>(null);

  const activeGid =
    view.type === "channel" || view.type === "voice" ? view.gid : null;
  const activeGuild = guilds.find((g) => g.id === activeGid) || null;
  const viewKey =
    view.type === "channel"
      ? `c:${view.gid}:${view.id}`
      : view.type === "dm"
        ? `dm:${view.id}`
        : view.type;

  const isOnline = useCallback((u: string) => online.includes(u), [online]);

  // ---- load guilds + active guild channels ----
  const loadGuilds = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/guilds?me=${encodeURIComponent(identity)}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as { guilds?: Guild[] };
      setGuilds(data.guilds ?? []);
    } catch {}
  }, [identity]);

  useEffect(() => {
    loadGuilds();
  }, [loadGuilds]);

  useEffect(() => {
    if (!activeGid) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/guilds?me=${encodeURIComponent(identity)}&gid=${activeGid}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as { channels?: string[] };
        setChannels(data.channels ?? ["general"]);
      } catch {}
    })();
  }, [activeGid, identity]);

  // ---- sync loop: presence + friends ----
  const sync = useCallback(async () => {
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          me: identity,
          avatar: avatarUrl,
          activity: myActivity,
        }),
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        online: string[];
        friends: FriendState | null;
        avatars: Record<string, string>;
        activities: Record<string, string>;
        durable: boolean;
      };
      setOnline(data.online ?? []);
      if (data.friends) setFriends(data.friends);
      if (data.avatars) setAvatars(data.avatars);
      if (data.activities) setActivities(data.activities);
      setDurable(data.durable);
    } catch {}
  }, [identity, avatarUrl, myActivity]);

  // desktop app (Electron) reports the game you're playing via a preload bridge
  useEffect(() => {
    const relay = (
      window as unknown as {
        relay?: { onActivity?: (cb: (g: string | null) => void) => void };
      }
    ).relay;
    relay?.onActivity?.((g) => setMyActivity(g || ""));
  }, []);

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
      url = `/api/messages?guild=${view.gid}&channel=${encodeURIComponent(view.id)}&since=${sinceRef.current}`;
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

  async function postMessage(content: string, image?: string) {
    if (view.type === "channel") {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          author: identity,
          guild: view.gid,
          channel: view.id,
          image,
        }),
      });
    } else if (view.type === "dm") {
      await fetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, me: identity, peer: view.id, image }),
      });
    }
    await pollMessages();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft("");
    try {
      await postMessage(content);
    } finally {
      setSending(false);
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || sending) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        alert(
          d.error === "uploads not configured"
            ? "Image uploads aren't enabled yet — add a Vercel Blob store."
            : d.error || "Upload failed"
        );
        return;
      }
      const { url } = (await res.json()) as { url: string };
      await postMessage(draft.trim(), url);
      setDraft("");
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

  // ---- voice (presence-only shell; skipped when LiveKit audio is active) ----
  useEffect(() => {
    if (view.type !== "voice" || live) return;
    const room = `g_${view.gid}`;
    const tick = async () => {
      try {
        if (inVoice) {
          const res = await fetch("/api/voice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ me: identity, room, action: "ping" }),
          });
          const data = (await res.json()) as { participants: string[] };
          setParticipants(data.participants ?? []);
        } else {
          const res = await fetch(`/api/voice?room=${room}`, {
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
  }, [view, inVoice, identity, live]);

  async function joinVoice() {
    if (view.type !== "voice") return;
    const room = `g_${view.gid}`;
    lastVoiceRoom.current = room;
    try {
      const res = await fetch(
        `/api/voice/token?room=${room}&identity=${encodeURIComponent(identity)}`,
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
      body: JSON.stringify({ me: identity, room, action: "join" }),
    });
  }
  async function leaveVoice() {
    const room = lastVoiceRoom.current;
    const wasLive = live !== null;
    setLive(null);
    setInVoice(false);
    if (!wasLive && room) {
      await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ me: identity, room, action: "leave" }),
      });
    }
  }

  // disconnect voice when navigating away from the voice view
  useEffect(() => {
    if (view.type === "voice") return;
    if (!inVoice && !live) return;
    const room = lastVoiceRoom.current;
    const wasLive = live !== null;
    setLive(null);
    setInVoice(false);
    if (!wasLive && room) {
      fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ me: identity, room, action: "leave" }),
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.type]);

  // leave voice on unload
  useEffect(() => {
    if (!inVoice) return;
    const handler = () =>
      navigator.sendBeacon?.(
        "/api/voice",
        new Blob(
          [
            JSON.stringify({
              me: identity,
              room: lastVoiceRoom.current,
              action: "leave",
            }),
          ],
          { type: "application/json" }
        )
      );
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [inVoice, identity]);

  // ---- guild / dialog actions ----
  async function guildPost(bodyObj: Record<string, unknown>) {
    const res = await fetch("/api/guilds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ me: identity, ...bodyObj }),
    });
    return res.json();
  }
  async function createServer() {
    const name = dialogInput.trim();
    if (!name) return;
    const data = await guildPost({ action: "create", name });
    if (data.guild) {
      setGuilds(data.guilds ?? []);
      setView({ type: "channel", gid: data.guild.id, id: "general" });
      setDialog(null);
    } else setDialogError(data.error || "Could not create server");
  }
  async function joinServer() {
    const code = dialogInput.trim();
    if (!code) return;
    const data = await guildPost({ action: "join", code });
    if (data.guild) {
      setGuilds(data.guilds ?? []);
      setView({ type: "channel", gid: data.guild.id, id: "general" });
      setDialog(null);
    } else setDialogError(data.error || "Invalid invite");
  }
  async function makeInvite() {
    if (!activeGid) return;
    const data = await guildPost({ action: "invite", gid: activeGid });
    if (data.code) setDialog({ kind: "invite", code: data.code });
  }
  async function createChannel() {
    const name = dialogInput.trim();
    if (!name || !activeGid) return;
    const data = await guildPost({ action: "addChannel", gid: activeGid, name });
    if (data.channels) {
      setChannels(data.channels);
      setDialog(null);
    } else setDialogError(data.error || "Could not add channel");
  }
  function openDialog(kind: "create" | "join" | "addChannel") {
    setDialogInput("");
    setDialogError("");
    setDialog({ kind });
  }

  const header =
    view.type === "channel"
      ? `# ${view.id}`
      : view.type === "dm"
        ? `@ ${view.id}`
        : view.type === "voice"
          ? `🔊 ${activeGuild?.name ?? "Voice"}`
          : "Friends";

  const meFooter = (
    <div className="me">
      <div className="me-row">
        <span className="dot on" />
        <span className="me-name">{identity}</span>
        {accountControl ? (
          <span className="me-account">{accountControl}</span>
        ) : (
          <button className="link" onClick={onSwitch}>
            {switchLabel}
          </button>
        )}
      </div>
      {myActivity && <div className="me-activity">🎮 Playing {myActivity}</div>}
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
  );

  return (
    <div className="app">
      <div className="rail">
        <button
          className={`rail-btn home${view.type === "friends" || view.type === "dm" ? " active" : ""}`}
          title="Home (friends & DMs)"
          onClick={() => setView({ type: "friends" })}
        >
          <span className="brand-dot" />
        </button>
        <div className="rail-sep" />
        {guilds.map((g) => (
          <button
            key={g.id}
            className={`rail-btn${activeGid === g.id ? " active" : ""}`}
            title={g.name}
            onClick={() =>
              setView({ type: "channel", gid: g.id, id: "general" })
            }
          >
            {g.name.slice(0, 2).toUpperCase()}
          </button>
        ))}
        <button
          className="rail-btn add"
          title="Create a server"
          onClick={() => openDialog("create")}
        >
          +
        </button>
        <button
          className="rail-btn add"
          title="Join with an invite"
          onClick={() => openDialog("join")}
        >
          ⇲
        </button>
      </div>

      <aside className="sidebar">
        {activeGid ? (
          <>
            <div className="brand guild-brand">
              <span className="guild-name">{activeGuild?.name ?? "Server"}</span>
              <button className="invite-btn" onClick={makeInvite}>
                Invite
              </button>
            </div>
            <nav className="channels">
              <div className="channels-label">
                Text Channels
                <button
                  className="mini-add"
                  title="Add channel"
                  onClick={() => openDialog("addChannel")}
                >
                  +
                </button>
              </div>
              {channels.map((c) => (
                <button
                  key={c}
                  className={`channel${view.type === "channel" && view.id === c ? " active" : ""}`}
                  onClick={() =>
                    setView({ type: "channel", gid: activeGid, id: c })
                  }
                >
                  <span className="hash">#</span>
                  {c}
                </button>
              ))}
              <div className="channels-label">Voice</div>
              <button
                className={`channel${view.type === "voice" ? " active" : ""}`}
                onClick={() => setView({ type: "voice", gid: activeGid })}
              >
                🔊 lounge
                {view.type === "voice" && participants.length > 0 && (
                  <span className="count">{participants.length}</span>
                )}
              </button>
            </nav>
            {meFooter}
          </>
        ) : (
          <>
            <div className="brand">
              <span className="brand-dot" />
              Relay
            </div>
            <nav className="channels">
              <button
                className={`channel wide${view.type === "friends" ? " active" : ""}`}
                onClick={() => setView({ type: "friends" })}
              >
                👥 Friends
                {friends.incoming.length > 0 && (
                  <span className="badge">{friends.incoming.length}</span>
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
                  <Avatar handle={f} url={avatars[f]} size={20} />
                  {f}
                </button>
              ))}
            </nav>
            {meFooter}
          </>
        )}
      </aside>

      <main className="main">
        <header className="header">{header}</header>

        {view.type === "friends" ? (
          <FriendsPanel
            identity={identity}
            friends={friends}
            isOnline={isOnline}
            avatars={avatars}
            activities={activities}
            openProfile={setProfile}
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
                avatars={avatars}
                onLeave={leaveVoice}
              />
            </div>
          ) : (
            <VoicePanel
              room={activeGuild?.name ?? "voice"}
              inVoice={inVoice}
              muted={muted}
              setMuted={setMuted}
              participants={participants}
              me={identity}
              avatars={avatars}
              openProfile={setProfile}
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
                    <button
                      className="avatar-btn"
                      onClick={() => setProfile(m.author)}
                      title={`View ${m.author}`}
                    >
                      <Avatar handle={m.author} url={avatars[m.author]} size={38} />
                    </button>
                    <div className="msg-main">
                      <div className="msg-head">
                        <button
                          className="msg-author linklike"
                          onClick={() => setProfile(m.author)}
                        >
                          {m.author}
                        </button>
                        <span className="msg-time">
                          {new Date(m.ts).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {m.content && (
                        <div className="msg-content">{m.content}</div>
                      )}
                      {m.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="msg-image"
                          src={m.image}
                          alt="attachment"
                          onClick={() => window.open(m.image, "_blank")}
                        />
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <div className="composer">
              <form onSubmit={send}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={onPickImage}
                />
                <button
                  type="button"
                  className="attach-btn"
                  title="Send an image"
                  disabled={sending}
                  onClick={() => fileRef.current?.click()}
                >
                  {sending ? "…" : "＋"}
                </button>
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

      {profile && (
        <ProfileCard
          handle={profile}
          me={identity}
          avatarUrl={avatars[profile]}
          online={isOnline(profile)}
          activity={activities[profile]}
          relation={
            profile === identity
              ? "self"
              : friends.friends.includes(profile)
                ? "friend"
                : friends.incoming.includes(profile)
                  ? "incoming"
                  : friends.outgoing.includes(profile)
                    ? "outgoing"
                    : "none"
          }
          onClose={() => setProfile(null)}
          onMessage={() => {
            setView({ type: "dm", id: profile });
            setProfile(null);
          }}
          onAction={(action) => friendAction(action, profile)}
        />
      )}

      {dialog && (
        <div className="modal-backdrop" onClick={() => setDialog(null)}>
          <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setDialog(null)}>
              ✕
            </button>
            {dialog.kind === "invite" ? (
              <>
                <h3>Invite to {activeGuild?.name ?? "server"}</h3>
                <p className="muted">
                  Share this code — anyone can join the server with it.
                </p>
                <div className="invite-code">{dialog.code}</div>
                <button
                  onClick={() =>
                    navigator.clipboard?.writeText(dialog.code).catch(() => {})
                  }
                >
                  Copy code
                </button>
              </>
            ) : (
              <>
                <h3>
                  {dialog.kind === "create"
                    ? "Create a server"
                    : dialog.kind === "join"
                      ? "Join a server"
                      : "New channel"}
                </h3>
                <form
                  className="add-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (dialog?.kind === "create") createServer();
                    else if (dialog?.kind === "join") joinServer();
                    else if (dialog?.kind === "addChannel") createChannel();
                  }}
                >
                  <input
                    autoFocus
                    value={dialogInput}
                    maxLength={40}
                    placeholder={
                      dialog.kind === "join"
                        ? "invite code"
                        : dialog.kind === "create"
                          ? "server name"
                          : "channel-name"
                    }
                    onChange={(e) => setDialogInput(e.target.value)}
                  />
                  <button type="submit">
                    {dialog.kind === "create"
                      ? "Create"
                      : dialog.kind === "join"
                        ? "Join"
                        : "Add"}
                  </button>
                </form>
                {dialogError && <div className="add-msg">{dialogError}</div>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileCard(props: {
  handle: string;
  me: string;
  avatarUrl?: string;
  online: boolean;
  activity?: string;
  relation: "self" | "friend" | "incoming" | "outgoing" | "none";
  onClose: () => void;
  onMessage: () => void;
  onAction: (action: string) => void;
}) {
  const { handle, avatarUrl, online, activity, relation } = props;
  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="profile-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={props.onClose}>
          ✕
        </button>
        <div className="profile-banner" />
        <div className="profile-body">
          <div className="profile-avatar">
            <Avatar handle={handle} url={avatarUrl} size={80} />
          </div>
          <div className="profile-name">{handle}</div>
          <div className="profile-status">
            <span className={`dot ${online ? "on" : "off"}`} />
            {online ? "Online" : "Offline"}
          </div>
          {activity && <div className="profile-activity">🎮 Playing {activity}</div>}

          <div className="profile-actions">
            {relation === "self" && (
              <span className="muted">This is you.</span>
            )}
            {relation === "friend" && (
              <>
                <button onClick={props.onMessage}>Message</button>
                <button
                  className="ghost"
                  onClick={() => props.onAction("remove")}
                >
                  Remove friend
                </button>
              </>
            )}
            {relation === "incoming" && (
              <>
                <button onClick={() => props.onAction("accept")}>
                  Accept request
                </button>
                <button
                  className="ghost"
                  onClick={() => props.onAction("decline")}
                >
                  Decline
                </button>
              </>
            )}
            {relation === "outgoing" && (
              <span className="muted">Friend request sent.</span>
            )}
            {relation === "none" && (
              <button onClick={() => props.onAction("request")}>
                Add friend
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Avatar({
  handle,
  url,
  size = 24,
}: {
  handle: string;
  url?: string;
  size?: number;
}) {
  const style = { width: size, height: size } as React.CSSProperties;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar-img" style={style} src={url} alt={handle} />;
  }
  return (
    <div className="avatar-initials" style={style}>
      {handle.slice(0, 2).toUpperCase()}
    </div>
  );
}

function FriendsPanel(props: {
  identity: string;
  friends: FriendState;
  isOnline: (u: string) => boolean;
  avatars: Record<string, string>;
  activities: Record<string, string>;
  openProfile: (h: string) => void;
  addInput: string;
  setAddInput: (v: string) => void;
  addFriend: (e: React.FormEvent) => void;
  addMsg: string;
  friendAction: (action: string, target: string) => void;
  openDM: (f: string) => void;
}) {
  const { friends, isOnline, avatars, activities, openProfile } = props;
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
              <button className="avatar-btn" onClick={() => openProfile(u)}>
                <Avatar handle={u} url={avatars[u]} size={28} />
              </button>
              <button className="fname linklike" onClick={() => openProfile(u)}>
                {u}
              </button>
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
              <button className="avatar-btn" onClick={() => openProfile(u)}>
                <Avatar handle={u} url={avatars[u]} size={28} />
              </button>
              <button className="fname linklike" onClick={() => openProfile(u)}>
                {u}
              </button>
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
              <button className="avatar-btn" onClick={() => openProfile(u)}>
                <Avatar handle={u} url={avatars[u]} size={28} />
              </button>
              <button className="fname linklike" onClick={() => openProfile(u)}>
                {u}
              </button>
              <span className="muted">
                {activities[u]
                  ? `🎮 ${activities[u]}`
                  : isOnline(u)
                    ? "online"
                    : "offline"}
              </span>
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
  avatars: Record<string, string>;
  openProfile: (h: string) => void;
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
              <button
                className="voice-tile tile-btn"
                key={u}
                onClick={() => props.openProfile(u)}
              >
                <Avatar handle={u} url={props.avatars[u]} size={56} />
                <span className="fname">
                  {u}
                  {u === props.me ? " (you)" : ""}
                </span>
              </button>
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
