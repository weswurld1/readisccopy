"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import Pusher from "pusher-js";
import { channelTopic, dmTopic } from "./lib/util";

const VoiceRoom = dynamic(() => import("./components/VoiceRoom"), {
  ssr: false,
});

// ---- lightweight, XSS-safe markdown (bold/italic/strike/code/links) ----
function renderPlain(text: string, key: number): ReactNode {
  const lines = text.split("\n");
  return (
    <Fragment key={key}>
      {lines.map((l, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {l}
        </Fragment>
      ))}
    </Fragment>
  );
}
function renderInline(text: string, me: string): ReactNode[] {
  const token =
    /(`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|\*[^*\n]+\*|_[^_\n]+_|https?:\/\/[^\s]+|@[a-zA-Z0-9_-]{1,32})/;
  const nodes: ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest.length) {
    const m = token.exec(rest);
    if (!m) {
      nodes.push(renderPlain(rest, k++));
      break;
    }
    if (m.index > 0) nodes.push(renderPlain(rest.slice(0, m.index), k++));
    const t = m[0];
    if (t.startsWith("`"))
      nodes.push(
        <code key={k++} className="md-code">
          {t.slice(1, -1)}
        </code>
      );
    else if (t.startsWith("**"))
      nodes.push(<strong key={k++}>{renderInline(t.slice(2, -2), me)}</strong>);
    else if (t.startsWith("~~"))
      nodes.push(<s key={k++}>{renderInline(t.slice(2, -2), me)}</s>);
    else if (t.startsWith("*"))
      nodes.push(<em key={k++}>{renderInline(t.slice(1, -1), me)}</em>);
    else if (t.startsWith("_"))
      nodes.push(<em key={k++}>{renderInline(t.slice(1, -1), me)}</em>);
    else if (t.startsWith("@"))
      nodes.push(
        <span
          key={k++}
          className={`md-mention${t.slice(1) === me ? " me" : ""}`}
        >
          {t}
        </span>
      );
    else
      nodes.push(
        <a
          key={k++}
          href={t}
          target="_blank"
          rel="noreferrer noopener"
          className="md-link"
        >
          {t}
        </a>
      );
    rest = rest.slice(m.index + t.length);
  }
  return nodes;
}
function renderMarkdown(text: string, me = ""): ReactNode {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) =>
    part.length >= 6 && part.startsWith("```") && part.endsWith("```") ? (
      <pre key={i} className="md-codeblock">
        <code>{part.slice(3, -3).replace(/^\n/, "").replace(/\n$/, "")}</code>
      </pre>
    ) : (
      <Fragment key={i}>{renderInline(part, me)}</Fragment>
    )
  );
}


type Message = {
  id: string;
  author: string;
  content: string;
  channel: string;
  ts: number;
  image?: string;
  edited?: boolean;
  reactions?: Record<string, string[]>;
};

const EMOJI_PALETTE = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🔥", "👀"];

// ---- inline line-icons (currentColor, themeable) ----
const ICON_PATHS: Record<string, ReactNode> = {
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  volume: (
    <>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),
  login: (
    <>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </>
  ),
  pin: (
    <>
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14l-1.65-9.9A2 2 0 0 0 15.38 5.4L8.62 5.4A2 2 0 0 0 6.65 7.1Z" />
    </>
  ),
  edit: (
    <>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </>
  ),
  trash: (
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  x: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  gamepad: (
    <>
      <line x1="6" y1="12" x2="10" y2="12" />
      <line x1="8" y1="10" x2="8" y2="14" />
      <line x1="15" y1="13" x2="15.01" y2="13" />
      <line x1="18" y1="11" x2="18.01" y2="11" />
      <rect x="2" y="6" width="20" height="12" rx="4" />
    </>
  ),
  message: (
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
  ),
  headphones: (
    <>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </>
  ),
  crown: (
    <path d="M2 6l4 4 6-7 6 7 4-4-2 13H4L2 6z" />
  ),
};
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
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
  const [members, setMembers] = useState<string[]>([]);
  const [showMembers, setShowMembers] = useState(true);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogInput, setDialogInput] = useState("");
  const [dialogError, setDialogError] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTypingSent = useRef(0);

  const [online, setOnline] = useState<string[]>([]);
  const [friends, setFriends] = useState<FriendState>(EMPTY_FRIENDS);
  const [durable, setDurable] = useState<boolean | null>(null);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [activities, setActivities] = useState<Record<string, string>>({});
  const [myActivity, setMyActivity] = useState("");
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [myStatus, setMyStatus] = useState("");
  const [profile, setProfile] = useState<string | null>(null);
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [pins, setPins] = useState<Message[] | null>(null);
  const [search, setSearch] = useState<{
    q: string;
    results: Message[] | null;
  } | null>(null);
  const [sourcePick, setSourcePick] = useState<
    { id: string; name: string; thumbnail: string }[] | null
  >(null);
  const [pusher, setPusher] = useState<{ key: string; cluster: string } | null>(
    null
  );
  const pusherEnabled = !!pusher;

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
  const pusherRef = useRef<Pusher | null>(null);

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
        const data = (await res.json()) as {
          channels?: string[];
          members?: string[];
        };
        setChannels(data.channels ?? ["general"]);
        setMembers(data.members ?? []);
      } catch {}
    })();
  }, [activeGid, identity]);

  const isOwner = !!activeGuild && activeGuild.owner === identity;

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
          status: myStatus,
        }),
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        online: string[];
        friends: FriendState | null;
        avatars: Record<string, string>;
        activities: Record<string, string>;
        statuses: Record<string, string>;
        durable: boolean;
      };
      setOnline(data.online ?? []);
      if (data.friends) setFriends(data.friends);
      if (data.avatars) setAvatars(data.avatars);
      if (data.activities) setActivities(data.activities);
      if (data.statuses) setStatuses(data.statuses);
      setDurable(data.durable);
    } catch {}
  }, [identity, avatarUrl, myActivity, myStatus]);

  // ask for notification permission once
  useEffect(() => {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  function notify(m: Message) {
    if (typeof Notification === "undefined" || Notification.permission !== "granted")
      return;
    const mentioned = m.content.includes(`@${identity}`);
    if (!mentioned && !document.hidden) return;
    try {
      new Notification(mentioned ? `${m.author} mentioned you` : m.author, {
        body: m.content.slice(0, 140) || "sent an image",
      });
    } catch {}
  }

  // desktop app (Electron) bridge: game detection + screen-share source picker
  useEffect(() => {
    const relay = (
      window as unknown as {
        relay?: {
          onActivity?: (cb: (g: string | null) => void) => void;
          onPickSource?: (
            cb: (s: { id: string; name: string; thumbnail: string }[]) => void
          ) => void;
        };
      }
    ).relay;
    relay?.onActivity?.((g) => setMyActivity(g || ""));
    relay?.onPickSource?.((list) => setSourcePick(list));
  }, []);

  function chooseSource(id: string | null) {
    const relay = (
      window as unknown as { relay?: { chooseSource?: (id: string | null) => void } }
    ).relay;
    relay?.chooseSource?.(id);
    setSourcePick(null);
  }

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
    // With Pusher, this is just a slow safety net; without it, it's the engine.
    const id = setInterval(pollMessages, pusherEnabled ? 10000 : 1500);
    return () => clearInterval(id);
  }, [pollMessages, view.type, pusherEnabled]);

  // ---- realtime: fetch config, connect Pusher, subscribe to active topic ----
  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { pusher?: { key: string; cluster: string } | null }) => {
        if (d.pusher) setPusher(d.pusher);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!pusher) return;
    const p = new Pusher(pusher.key, { cluster: pusher.cluster });
    pusherRef.current = p;
    return () => {
      p.disconnect();
      pusherRef.current = null;
    };
  }, [pusher]);

  useEffect(() => {
    const p = pusherRef.current;
    if (!p) return;
    let topic = "";
    if (view.type === "channel") topic = channelTopic(view.gid, view.id);
    else if (view.type === "dm") topic = dmTopic(identity, view.id);
    else return;
    const ch = p.subscribe(topic);
    const onNew = (m: Message) => {
      setMessages((prev) =>
        prev.some((x) => x.id === m.id) ? prev : [...prev, m]
      );
      if (m.ts > sinceRef.current) sinceRef.current = m.ts;
      if (m.author !== identity) notify(m);
    };
    const onUpdate = (m: Message) =>
      setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
    const onDelete = (d: { id: string }) =>
      setMessages((prev) => prev.filter((x) => x.id !== d.id));
    const onTyping = (d: { user: string }) => {
      if (d.user === identity) return;
      setTyping((prev) => (prev.includes(d.user) ? prev : [...prev, d.user]));
      clearTimeout(typingTimers.current[d.user]);
      typingTimers.current[d.user] = setTimeout(
        () => setTyping((prev) => prev.filter((u) => u !== d.user)),
        3500
      );
    };
    ch.bind("new-message", onNew);
    ch.bind("update-message", onUpdate);
    ch.bind("delete-message", onDelete);
    ch.bind("typing", onTyping);
    return () => {
      ch.unbind("new-message", onNew);
      ch.unbind("update-message", onUpdate);
      ch.unbind("delete-message", onDelete);
      ch.unbind("typing", onTyping);
      p.unsubscribe(topic);
      setTyping([]);
    };
  }, [view, identity, pusher]);

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

  async function send(e: React.SyntheticEvent) {
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

  function sendTyping() {
    if (!pusherEnabled) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;
    let body: Record<string, unknown> | null = null;
    if (view.type === "channel")
      body = { me: identity, guild: view.gid, channel: view.id };
    else if (view.type === "dm") body = { me: identity, peer: view.id };
    if (!body) return;
    fetch("/api/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  async function saveEdit(m: Message) {
    const content = editDraft.trim();
    if (!content) return;
    setEditing(null);
    setMessages((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, content, edited: true } : x))
    );
    try {
      if (view.type === "channel") {
        await fetch("/api/messages", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: m.id,
            author: identity,
            guild: view.gid,
            channel: view.id,
            content,
          }),
        });
      } else if (view.type === "dm") {
        await fetch("/api/dm", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: m.id, me: identity, peer: view.id, content }),
        });
      }
    } catch {}
  }

  async function deleteMsg(m: Message) {
    if (!window.confirm("Delete this message?")) return;
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    try {
      if (view.type === "channel") {
        await fetch("/api/messages", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: m.id,
            author: identity,
            guild: view.gid,
            channel: view.id,
          }),
        });
      } else if (view.type === "dm") {
        await fetch("/api/dm", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: m.id, me: identity, peer: view.id }),
        });
      }
    } catch {}
  }

  async function toggleReaction(m: Message, emoji: string) {
    setReactFor(null);
    setMessages((prev) =>
      prev.map((x) => {
        if (x.id !== m.id) return x;
        const reactions: Record<string, string[]> = { ...(x.reactions || {}) };
        const users = new Set(reactions[emoji] || []);
        if (users.has(identity)) users.delete(identity);
        else users.add(identity);
        if (users.size) reactions[emoji] = Array.from(users);
        else delete reactions[emoji];
        return { ...x, reactions };
      })
    );
    try {
      if (view.type === "channel") {
        await fetch("/api/react", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: m.id,
            emoji,
            me: identity,
            guild: view.gid,
            channel: view.id,
          }),
        });
      } else if (view.type === "dm") {
        await fetch("/api/react", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: m.id, emoji, me: identity, peer: view.id }),
        });
      }
    } catch {}
  }

  function setStatusPrompt() {
    const v = window.prompt("Set a custom status (blank to clear):", myStatus);
    if (v !== null) setMyStatus(v.slice(0, 80));
  }

  async function pinMessage(m: Message) {
    try {
      if (view.type === "channel") {
        await fetch("/api/pins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            me: identity,
            guild: view.gid,
            channel: view.id,
            message: m,
          }),
        });
      } else if (view.type === "dm") {
        await fetch("/api/pins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ me: identity, peer: view.id, message: m }),
        });
      }
    } catch {}
  }

  async function openPins() {
    let url = "";
    if (view.type === "channel")
      url = `/api/pins?me=${encodeURIComponent(identity)}&guild=${view.gid}&channel=${encodeURIComponent(view.id)}`;
    else if (view.type === "dm")
      url = `/api/pins?me=${encodeURIComponent(identity)}&peer=${encodeURIComponent(view.id)}`;
    else return;
    setPins([]);
    try {
      const r = await fetch(url, { cache: "no-store" });
      const d = (await r.json()) as { pins: Message[] };
      setPins(d.pins ?? []);
    } catch {
      setPins([]);
    }
  }

  async function unpinMessage(id: string) {
    try {
      let body: Record<string, unknown> | null = null;
      if (view.type === "channel")
        body = {
          me: identity,
          guild: view.gid,
          channel: view.id,
          action: "unpin",
          id,
        };
      else if (view.type === "dm")
        body = { me: identity, peer: view.id, action: "unpin", id };
      if (!body) return;
      const r = await fetch("/api/pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await r.json()) as { pins: Message[] };
      setPins(d.pins ?? []);
    } catch {}
  }

  async function runSearch(q: string) {
    setSearch({ q, results: null });
    let url = "";
    if (view.type === "channel")
      url = `/api/search?me=${encodeURIComponent(identity)}&guild=${view.gid}&channel=${encodeURIComponent(view.id)}&q=${encodeURIComponent(q)}`;
    else if (view.type === "dm")
      url = `/api/search?me=${encodeURIComponent(identity)}&peer=${encodeURIComponent(view.id)}&q=${encodeURIComponent(q)}`;
    else return;
    try {
      const r = await fetch(url, { cache: "no-store" });
      const d = (await r.json()) as { results: Message[] };
      setSearch({ q, results: d.results ?? [] });
    } catch {
      setSearch({ q, results: [] });
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
  async function deleteChannel(name: string) {
    if (!activeGid) return;
    if (!window.confirm(`Delete #${name}?`)) return;
    const data = await guildPost({
      action: "deleteChannel",
      gid: activeGid,
      name,
    });
    if (data.channels) {
      setChannels(data.channels);
      if (view.type === "channel" && view.id === name) {
        setView({ type: "channel", gid: activeGid, id: "general" });
      }
    }
  }
  async function leaveServer() {
    if (!activeGid) return;
    if (!window.confirm(`Leave ${activeGuild?.name ?? "this server"}?`)) return;
    const data = await guildPost({ action: "leave", gid: activeGid });
    setGuilds(data.guilds ?? []);
    setView({ type: "friends" });
  }

  const header =
    view.type === "channel"
      ? `# ${view.id}`
      : view.type === "dm"
        ? `@ ${view.id}`
        : view.type === "voice"
          ? `${activeGuild?.name ?? "Voice"} — voice`
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
      {myActivity && (
        <div className="me-activity">
          <Icon name="gamepad" size={13} /> Playing {myActivity}
        </div>
      )}
      <button className="me-status" onClick={setStatusPrompt}>
        {myStatus ? (
          <>
            <Icon name="message" size={12} /> {myStatus}
          </>
        ) : (
          "Set a custom status"
        )}
      </button>
      <div className="note small">
        {durable === null
          ? "Connecting…"
          : durable
            ? "Synced across everyone"
            : "In-memory mode (resets on cold starts)"}
      </div>
      <a className="download-link" href={DOWNLOAD_URL}>
        <Icon name="download" size={13} /> Get the Windows app
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
          <Icon name="plus" />
        </button>
        <button
          className="rail-btn add"
          title="Join with an invite"
          onClick={() => openDialog("join")}
        >
          <Icon name="login" />
        </button>
      </div>

      <aside className="sidebar">
        {activeGid ? (
          <>
            <div className="brand guild-brand">
              <span className="guild-name">{activeGuild?.name ?? "Server"}</span>
              <div className="guild-actions">
                <button
                  className="leave-btn"
                  onClick={() => setShowMembers((v) => !v)}
                  title="Toggle member list"
                >
                  <Icon name="users" size={16} />
                </button>
                <button className="invite-btn" onClick={makeInvite}>
                  Invite
                </button>
                <button
                  className="leave-btn"
                  onClick={leaveServer}
                  title="Leave server"
                >
                  <Icon name="logout" size={16} />
                </button>
              </div>
            </div>
            <nav className="channels">
              <div className="channels-label">
                Text Channels
                {isOwner && (
                  <button
                    className="mini-add"
                    title="Add channel"
                    onClick={() => openDialog("addChannel")}
                  >
                    <Icon name="plus" size={15} />
                  </button>
                )}
              </div>
              {channels.map((c) => (
                <div className="channel-row" key={c}>
                  <button
                    className={`channel${view.type === "channel" && view.id === c ? " active" : ""}`}
                    onClick={() =>
                      setView({ type: "channel", gid: activeGid, id: c })
                    }
                  >
                    <span className="hash">#</span>
                    {c}
                  </button>
                  {isOwner && c !== "general" && (
                    <button
                      className="chan-del"
                      title={`Delete #${c}`}
                      onClick={() => deleteChannel(c)}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>
              ))}
              <div className="channels-label">Voice</div>
              <button
                className={`channel${view.type === "voice" ? " active" : ""}`}
                onClick={() => setView({ type: "voice", gid: activeGid })}
              >
                <Icon name="volume" size={15} /> lounge
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
                <Icon name="users" size={16} /> Friends
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
        <header className="header">
          <span className="header-title">{header}</span>
          {(view.type === "channel" || view.type === "dm") && (
            <div className="header-actions">
              <button title="Pinned messages" onClick={openPins}>
                <Icon name="pin" size={16} />
              </button>
              <button
                title="Search messages"
                onClick={() => setSearch({ q: "", results: null })}
              >
                <Icon name="search" size={16} />
              </button>
            </div>
          )}
        </header>

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
                messages.map((m, i) => {
                  const prev = messages[i - 1];
                  const grouped =
                    !!prev &&
                    prev.author === m.author &&
                    m.ts - prev.ts < 300000;
                  const mine = m.author === identity;
                  const time = new Date(m.ts).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <div className={`msg${grouped ? " grouped" : ""}`} key={m.id}>
                      {grouped ? (
                        <span className="msg-gutter-time">{time}</span>
                      ) : (
                        <button
                          className="avatar-btn"
                          onClick={() => setProfile(m.author)}
                          title={`View ${m.author}`}
                        >
                          <Avatar
                            handle={m.author}
                            url={avatars[m.author]}
                            size={38}
                          />
                        </button>
                      )}
                      <div className="msg-main">
                        {!grouped && (
                          <div className="msg-head">
                            <button
                              className="msg-author linklike"
                              onClick={() => setProfile(m.author)}
                            >
                              {m.author}
                            </button>
                            <span className="msg-time">{time}</span>
                          </div>
                        )}
                        {editing === m.id ? (
                          <div className="edit-box">
                            <textarea
                              className="edit-input"
                              value={editDraft}
                              autoFocus
                              onChange={(e) => setEditDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  saveEdit(m);
                                } else if (e.key === "Escape") {
                                  setEditing(null);
                                }
                              }}
                            />
                            <div className="edit-actions">
                              <button onClick={() => saveEdit(m)}>Save</button>
                              <button
                                className="ghost"
                                onClick={() => setEditing(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {m.content && (
                              <div className="msg-content">
                                {renderMarkdown(m.content, identity)}
                                {m.edited && (
                                  <span className="edited-tag"> (edited)</span>
                                )}
                              </div>
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
                            {m.reactions &&
                              Object.keys(m.reactions).length > 0 && (
                                <div className="reactions">
                                  {Object.entries(m.reactions).map(
                                    ([e, users]) => (
                                      <button
                                        key={e}
                                        className={`reaction${users.includes(identity) ? " mine" : ""}`}
                                        onClick={() => toggleReaction(m, e)}
                                        title={users.join(", ")}
                                      >
                                        {e} {users.length}
                                      </button>
                                    )
                                  )}
                                </div>
                              )}
                          </>
                        )}
                      </div>
                      {editing !== m.id && (
                        <div className="msg-actions">
                          <button
                            title="React"
                            onClick={() =>
                              setReactFor(reactFor === m.id ? null : m.id)
                            }
                          >
                            <Icon name="smile" size={15} />
                          </button>
                          <button title="Pin" onClick={() => pinMessage(m)}>
                            <Icon name="pin" size={15} />
                          </button>
                          {mine && m.content && (
                            <button
                              title="Edit"
                              onClick={() => {
                                setEditing(m.id);
                                setEditDraft(m.content);
                              }}
                            >
                              <Icon name="edit" size={15} />
                            </button>
                          )}
                          {mine && (
                            <button title="Delete" onClick={() => deleteMsg(m)}>
                              <Icon name="trash" size={15} />
                            </button>
                          )}
                          {reactFor === m.id && (
                            <div className="react-palette">
                              {EMOJI_PALETTE.map((e) => (
                                <button
                                  key={e}
                                  onClick={() => toggleReaction(m, e)}
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <div className="composer">
              {typing.length > 0 && (
                <div className="typing-row">
                  <span className="typing-dots">
                    <span />
                    <span />
                    <span />
                  </span>
                  {typing.slice(0, 3).join(", ")}{" "}
                  {typing.length === 1 ? "is" : "are"} typing…
                </div>
              )}
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
                  {sending ? "…" : <Icon name="plus" size={20} />}
                </button>
                <textarea
                  className="composer-input"
                  value={draft}
                  rows={1}
                  placeholder={
                    view.type === "dm"
                      ? `Message @${view.id}`
                      : `Message #${view.id}`
                  }
                  maxLength={2000}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height =
                      Math.min(e.target.scrollHeight, 180) + "px";
                    sendTyping();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(e);
                    }
                  }}
                />
                <button type="submit" disabled={sending || !draft.trim()}>
                  Send
                </button>
              </form>
            </div>
          </>
        )}
      </main>

      {activeGid && showMembers && (
        <aside className="members">
          <div className="members-list">
            {(() => {
              const onlineM = members.filter((u) => isOnline(u));
              const offlineM = members.filter((u) => !isOnline(u));
              const row = (u: string) => (
                <button
                  className="member-row"
                  key={u}
                  onClick={() => setProfile(u)}
                >
                  <span className={`dot ${isOnline(u) ? "on" : "off"}`} />
                  <Avatar handle={u} url={avatars[u]} size={28} />
                  <span className="member-info">
                    <span className="member-name">
                      {u}
                      {u === activeGuild?.owner && (
                        <>
                          {" "}
                          <Icon name="crown" size={12} />
                        </>
                      )}
                    </span>
                    {activities[u] ? (
                      <span className="member-activity">
                        <Icon name="gamepad" size={11} /> {activities[u]}
                      </span>
                    ) : (
                      statuses[u] && (
                        <span className="member-activity">
                          <Icon name="message" size={11} /> {statuses[u]}
                        </span>
                      )
                    )}
                  </span>
                </button>
              );
              return (
                <>
                  <div className="members-head">
                    Online — {onlineM.length}
                  </div>
                  {onlineM.map(row)}
                  {offlineM.length > 0 && (
                    <div className="members-head">
                      Offline — {offlineM.length}
                    </div>
                  )}
                  {offlineM.map(row)}
                </>
              );
            })()}
          </div>
        </aside>
      )}

      {profile && (
        <ProfileCard
          handle={profile}
          me={identity}
          avatarUrl={avatars[profile]}
          online={isOnline(profile)}
          activity={activities[profile]}
          status={statuses[profile]}
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
              <Icon name="x" size={14} />
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

      {sourcePick && (
        <div className="modal-backdrop" onClick={() => chooseSource(null)}>
          <div
            className="dialog-card source-picker"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={() => chooseSource(null)}>
              <Icon name="x" size={14} />
            </button>
            <h3>Share your screen</h3>
            <p className="muted">Pick a screen or window to share.</p>
            <div className="source-grid">
              {sourcePick.map((s) => (
                <button
                  key={s.id}
                  className="source-tile"
                  onClick={() => chooseSource(s.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.thumbnail} alt={s.name} />
                  <span className="source-name">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {pins && (
        <div className="modal-backdrop" onClick={() => setPins(null)}>
          <div
            className="dialog-card source-picker"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setPins(null)}>
              <Icon name="x" size={14} />
            </button>
            <h3>
              <Icon name="pin" size={16} /> Pinned messages
            </h3>
            {pins.length === 0 ? (
              <p className="muted">No pinned messages yet.</p>
            ) : (
              <div className="pins-list">
                {pins.map((m) => (
                  <div className="pin-item" key={m.id}>
                    <div className="pin-head">
                      <strong>{m.author}</strong>
                      <button
                        className="ghost"
                        onClick={() => unpinMessage(m.id)}
                      >
                        Unpin
                      </button>
                    </div>
                    {m.content && (
                      <div className="msg-content">
                        {renderMarkdown(m.content, identity)}
                      </div>
                    )}
                    {m.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="msg-image" src={m.image} alt="" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {search && (
        <div className="modal-backdrop" onClick={() => setSearch(null)}>
          <div
            className="dialog-card source-picker"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setSearch(null)}>
              <Icon name="x" size={14} />
            </button>
            <h3>
              <Icon name="search" size={16} /> Search this conversation
            </h3>
            <form
              className="add-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (search.q.trim()) runSearch(search.q.trim());
              }}
            >
              <input
                autoFocus
                value={search.q}
                placeholder="Search messages…"
                onChange={(e) =>
                  setSearch({ q: e.target.value, results: search.results })
                }
              />
              <button type="submit">Search</button>
            </form>
            {search.results === null ? null : search.results.length === 0 ? (
              <p className="muted" style={{ marginTop: 12 }}>
                No matches.
              </p>
            ) : (
              <div className="pins-list">
                {search.results.map((m) => (
                  <div className="pin-item" key={m.id}>
                    <div className="pin-head">
                      <strong>{m.author}</strong>
                      <span className="msg-time">
                        {new Date(m.ts).toLocaleString()}
                      </span>
                    </div>
                    {m.content && (
                      <div className="msg-content">
                        {renderMarkdown(m.content, identity)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
  status?: string;
  relation: "self" | "friend" | "incoming" | "outgoing" | "none";
  onClose: () => void;
  onMessage: () => void;
  onAction: (action: string) => void;
}) {
  const { handle, avatarUrl, online, activity, status, relation } = props;
  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="profile-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={props.onClose}>
          <Icon name="x" size={14} />
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
          {activity && (
            <div className="profile-activity">
              <Icon name="gamepad" size={13} /> Playing {activity}
            </div>
          )}
          {status && (
            <div className="profile-status-text">
              <Icon name="message" size={13} /> {status}
            </div>
          )}

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
                {activities[u] ? (
                  <>
                    <Icon name="gamepad" size={11} /> {activities[u]}
                  </>
                ) : isOnline(u) ? (
                  "online"
                ) : (
                  "offline"
                )}
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
        <Icon name="headphones" size={14} /> Voice shell — the participant list
        is live, but there’s no audio yet.
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
