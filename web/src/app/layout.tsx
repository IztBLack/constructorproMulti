import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui";
import { RegistrarSW } from "@/components/pwa/registrar-sw";
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
  // El manifest lo genera `src/app/manifest.ts` (convención de metadata de
  // Next 16); Next inserta el <link rel="manifest"> automáticamente.
  icons: {
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    title: "ConstructorPro",
    statusBarStyle: "default",
  },
};

// `theme-color` de la barra de estado en la PWA instalada. Es el Primary del
// design system (`web/design-system/constructorpro/MASTER.md`). Debe coincidir
// con `theme_color` de `app/manifest.ts`: si difieren, iOS y Android pueden
// tomar valores distintos y la barra cambia de color entre pantallas.
export const viewport: Viewport = {
  themeColor: "#1E293B",
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
        <RegistrarSW />
      </body>
    </html>
  );
}
