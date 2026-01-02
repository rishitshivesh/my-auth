"use client"
import "@repo/ui/globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { ThemeProvider } from "@repo/ui/components/theme-provider";
import { AuthProvider } from "@repo/web-sdk/react";
// import { defaultAuthClient } from "@repo/web-sdk";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          async={true}
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8195619606985915"
          crossOrigin="anonymous"
        ></Script>
        <meta name="google-adsense-account" content="ca-pub-8195619606985915" />
      </head>

      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {/* <AuthProvider authClient={defaultAuthClient}> */}

        <ThemeProvider>{children}</ThemeProvider>
        {/* </AuthProvider> */}
      </body>
    </html>
  );
}
