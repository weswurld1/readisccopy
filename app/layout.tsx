import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relay",
  description: "A minimal real-time-ish chat.",
};

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const page = (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
  // Only mount Clerk when configured, so the app runs name-based without keys.
  return clerkEnabled ? <ClerkProvider>{page}</ClerkProvider> : page;
}
