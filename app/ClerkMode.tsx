"use client";

import { SignedIn, SignedOut, SignIn, useUser, useClerk } from "@clerk/nextjs";
import ChatApp from "./ChatApp";

function deriveHandle(user: ReturnType<typeof useUser>["user"]): string {
  if (!user) return "user";
  return (
    user.username ||
    user.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    user.firstName ||
    user.id.slice(0, 8)
  );
}

function SignedInApp() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  if (!isLoaded) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="brand big">
            <span className="brand-dot" />
            Relay
          </div>
          <p className="gate-sub">Loading…</p>
        </div>
      </div>
    );
  }
  const identity = deriveHandle(user);
  return (
    <ChatApp
      identity={identity}
      onSwitch={() => signOut()}
      switchLabel="sign out"
    />
  );
}

export default function ClerkMode() {
  return (
    <>
      <SignedOut>
        <div className="gate">
          <div className="gate-card">
            <div className="brand big">
              <span className="brand-dot" />
              Relay
            </div>
            <p className="gate-sub">Sign in to start chatting.</p>
            <SignIn routing="hash" />
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <SignedInApp />
      </SignedIn>
    </>
  );
}
