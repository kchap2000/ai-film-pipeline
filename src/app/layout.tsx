import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Film Pipeline",
  description: "AI-powered film production pipeline — AI for Real Life",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
