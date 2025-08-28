import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { Inter } from "next/font/google";
import type { Metadata } from "next";
import { ThemeProviderWrapper } from "@/providers/themeProvider";
import { WalletAdapterProvider } from "@/providers/walletAdapterProvider";
import { UmiProvider } from "@/providers/umiProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Metaplex Umi Next.js",
  description: "Metaplex template for Next.js using Umi",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <WalletAdapterProvider>
          <UmiProvider>
            <ThemeProviderWrapper>{children}</ThemeProviderWrapper>
          </UmiProvider>
        </WalletAdapterProvider>
      </body>
    </html>
  );
}
