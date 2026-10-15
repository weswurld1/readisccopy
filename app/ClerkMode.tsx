"use client";

import {
  SignedIn,
  SignedOut,
  SignIn,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import ChatApp from "./ChatApp";

const clerkAppearance = {
  variables: {
    colorPrimary: "#5b7cfa",
    colorBackground: "#141517",
    colorText: "#e8e8ea",
    colorTextSecondary: "#9a9ba1",
    colorInputBackground: "#26272b",
    colorInputText: "#e8e8ea",
    colorNeutral: "#e8e8ea",
    borderRadius: "10px",
  },
  elements: {
    rootBox: { width: "100%" },
    card: {
      backgroundColor: "#141517",
      border: "1px solid #2c2d31",
      boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
    },
    headerTitle: { color: "#e8e8ea" },
    headerSubtitle: { color: "#9a9ba1" },
    socialButtonsBlockButton: {
      backgroundColor: "#26272b",
      border: "1px solid #2c2d31",
      color: "#e8e8ea",
    },
    dividerLine: { backgroundColor: "#2c2d31" },
    dividerText: { color: "#9a9ba1" },
    formFieldLabel: { color: "#e8e8ea" },
    footer: { background: "transparent" },
    footerActionText: { color: "#9a9ba1" },
  },
};

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
      avatarUrl={user?.imageUrl}
      accountControl={<UserButton />}
    />
  );
}

export default function ClerkMode() {
  return (
    <>
      <SignedOut>
        <div className="gate">
          <div className="gate-hero">
            <div className="brand big">
              <span className="brand-dot" />
              Relay
            </div>
            <p className="gate-sub">Chat, voice, and servers for your crew.</p>
            <SignIn routing="hash" appearance={clerkAppearance} />
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <SignedInApp />
      </SignedIn>
    </>
  );
}
