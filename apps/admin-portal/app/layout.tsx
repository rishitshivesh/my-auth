// @ts-ignore
import "@repo/ui/globals.css";
import type { Metadata } from "next";
import { Providers } from "@/components/providers/Providers";
import { PRODUCT_NAME } from "@/lib/document-title";

export const metadata: Metadata = { title: PRODUCT_NAME };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased font-sans" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
