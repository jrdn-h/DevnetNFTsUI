import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { Inter, Press_Start_2P, VT323, Share_Tech_Mono, Space_Grotesk } from "next/font/google";
import type { Metadata } from "next";
import { ThemeProviderWrapper } from "@/providers/themeProvider";
import { WalletAdapterProvider } from "@/providers/walletAdapterProvider";
import { UmiProvider } from "@/providers/umiProvider";

const inter = Inter({ subsets: ["latin"] });

// Pixel fonts for the cosmic theme
const pressStart2P = Press_Start_2P({ 
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press-start",
  display: "swap",
});

const vt323 = VT323({ 
  weight: "400",
  subsets: ["latin"],
  variable: "--font-vt323",
  display: "swap",
});

const shareTechMono = Share_Tech_Mono({ 
  weight: "400",
  subsets: ["latin"],
  variable: "--font-share-tech-mono",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({ 
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MetaMartians - Cosmic NFT Collection",
  description: "Join the MetaMartians adventure! Unique pixel-perfect NFT characters from across the cosmos on Solana blockchain.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceGrotesk.className} ${pressStart2P.variable} ${vt323.variable} ${shareTechMono.variable} ${spaceGrotesk.variable}`}>
        <WalletAdapterProvider>
          <UmiProvider>
            <ThemeProviderWrapper>{children}</ThemeProviderWrapper>
          </UmiProvider>
        </WalletAdapterProvider>
      </body>
    </html>
  );
}
