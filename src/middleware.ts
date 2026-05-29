import { NextRequest, NextResponse } from "next/server";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(req: NextRequest) {
  const isPreview = process.env.VERCEL_ENV === "preview";
  const writesAllowed = process.env.ALLOW_PREVIEW_MUTATIONS === "true";

  if (
    isPreview &&
    !writesAllowed &&
    req.nextUrl.pathname.startsWith("/api/") &&
    WRITE_METHODS.has(req.method)
  ) {
    return NextResponse.json(
      {
        error:
          "Preview write APIs are disabled until this deployment is connected to a staging Supabase database.",
      },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
