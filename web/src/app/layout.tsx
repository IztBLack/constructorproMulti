import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui";
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
  title: {
    default: "ConstructorPro",
    template: "%s · ConstructorPro",
  },
  description:
    "Gestión de obras: nómina, asistencia, cotizaciones y pagos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* ToastProvider es un Client Component; el layout sigue siendo Server
            Component (ver "Context providers" en la guía de Next). */}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
