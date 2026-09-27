import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cosmos Explorer — imagens da NASA por dia e por assunto",
  description:
    "Pesquise a Astronomy Picture of the Day por qualquer data desde 16/06/1995 e explore o acervo completo da NASA por palavra-chave.",
};

/* Barra de status do celular acompanha o fundo escuro; sem isso o topo fica branco. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05060c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
