import type { Metadata, Viewport } from "next";
import { Nunito, Fredoka, Geist_Mono } from "next/font/google";
import "./globals.css";
import "../styles/teacher-theme.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximumScale: blocking pinch-zoom fails WCAG 1.4.4 and hurts a CJK app.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "HSK Online — Learn Chinese & Prepare for the HSK Exam",
  description:
    "Study for the new HSK 3.0 (levels 1–9): vocabulary, listening, reading, writing, mock tests, and live 1-on-1 and group classes with teachers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of unstyled (light) content before theme is applied */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
        {/* Apply the saved text size before paint (no flash / no layout shift) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=['100','115','130','150'];var i=parseInt(localStorage.getItem('hsk-fontscale')||'0',10);if(i>0&&i<s.length){document.documentElement.style.fontSize=s[i]+'%'}}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${nunito.variable} ${fredoka.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
