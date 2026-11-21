import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Fiximperfect", template: "%s · Fiximperfect" },
  description: "AI-coordinated dormitory maintenance and asset intelligence.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#183247" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster richColors position="top-right" toastOptions={{ style: { borderRadius: 14 } }} />
      </body>
    </html>
  );
}
