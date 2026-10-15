import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const enabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Protect all API routes except the public health check, when Clerk is on.
const isProtected = createRouteMatcher(["/api/((?!health).*)"]);

export default enabled
  ? clerkMiddleware(async (auth, req) => {
      if (isProtected(req)) {
        await auth.protect();
      }
    })
  : () => NextResponse.next();

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
