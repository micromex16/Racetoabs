import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { THEME_SCRIPT } from "@/components/app/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Micromex Command",
  description: "CEO command center — rocks, picks, pipeline, comms, and a chief of staff.",
  applicationName: "Micromex Command",
  appleWebApp: { capable: true, title: "Command", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#06070b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            className: "!rounded-2xl !border !border-line-2 !bg-panel-solid !text-fg !shadow-2xl",
          }}
        />
      </body>
    </html>
  );
}
