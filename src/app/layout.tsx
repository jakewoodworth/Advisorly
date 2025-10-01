import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { UIProvider } from "./providers";
import { AxeA11y } from "./components/AxeA11y";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Advisorly",
  description: "Modern Next.js starter with Tailwind CSS and TypeScript.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <UIProvider>
          <AxeA11y />
          {children}
        </UIProvider>
      </body>
    </html>
  );
}
