"use client";

import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const handleGoogleLogin = () => {
    const supabase = createClient();
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--brand-navy)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 flex flex-col items-center gap-6"
        style={{
          background: "var(--brand-mid)",
          border: "1px solid var(--brand-steel)",
        }}
      >
        {/* Logo / Header */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{
              background: "rgba(255,138,42,0.15)",
              border: "1px solid rgba(255,138,42,0.25)",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="w-6 h-6"
              style={{ color: "var(--brand-orange)" }}
            >
              <rect x="2" y="2" width="20" height="20" rx="3" />
              <path d="M7 2v20M17 2v20M2 7h5M17 7h5M2 12h20M2 17h5M17 17h5" />
            </svg>
          </div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ color: "var(--brand-white)" }}
          >
            AI Film Pipeline
          </h1>
          <p
            className="text-xs text-center"
            style={{ color: "var(--brand-gray)" }}
          >
            Sign in to access your production pipeline
          </p>
        </div>

        {/* Google Sign-In Button */}
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 text-sm font-semibold px-5 py-3 rounded-xl transition-all duration-150 hover:opacity-90 cursor-pointer"
          style={{
            background: "var(--brand-orange)",
            color: "#0B1C2D",
          }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </button>

        <p
          className="text-[10px] text-center"
          style={{ color: "var(--brand-gray)", opacity: 0.6 }}
        >
          Your data stays private. No third-party access.
        </p>
      </div>
    </div>
  );
}
