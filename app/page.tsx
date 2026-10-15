"use client";

import { useEffect, useState } from "react";
import ChatApp from "./ChatApp";
import ClerkMode from "./ClerkMode";

const DOWNLOAD_URL =
  "https://github.com/weswurld1/readisccopy/releases/latest/download/Relay-win-x64.zip";

// NEXT_PUBLIC_* is inlined at build time, so this is known on the client.
const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function randomName() {
  return `guest-${Math.floor(1000 + Math.random() * 9000)}`;
}

function NameMode() {
  const [name, setName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("relay-name");
      if (stored) setName(stored);
    } catch {}
  }, []);

  function claimName(e: React.FormEvent) {
    e.preventDefault();
    const n = nameDraft.trim().slice(0, 32) || randomName();
    setName(n);
    try {
      localStorage.setItem("relay-name", n);
    } catch {}
  }

  function logout() {
    setName(null);
    setNameDraft("");
    try {
      localStorage.removeItem("relay-name");
    } catch {}
  }

  if (!name) {
    return (
      <div className="gate">
        <form className="gate-card" onSubmit={claimName}>
          <div className="brand big">
            <span className="brand-dot" />
            Relay
          </div>
          <p className="gate-sub">Pick a username to start chatting.</p>
          <input
            autoFocus
            value={nameDraft}
            maxLength={32}
            placeholder="e.g. nova"
            onChange={(e) => setNameDraft(e.target.value)}
          />
          <button type="submit">Enter</button>
          <a className="download-btn" href={DOWNLOAD_URL}>
            ⬇ Download for Windows
          </a>
          <p className="gate-note">
            Name-based identity (no password) — a demo, not secure. Anyone can
            use any free name. The desktop download is a .zip — extract and run
            Relay.exe.
          </p>
        </form>
      </div>
    );
  }

  return <ChatApp identity={name} onSwitch={logout} switchLabel="switch" />;
}

export default function Page() {
  return clerkEnabled ? <ClerkMode /> : <NameMode />;
}
