import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";
import { DM_Sans, Syne } from "next/font/google";
import "./globals.css";

const bodyFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

const displayFont = Syne({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata = {
  title: "Anypay Legend",
  description: "Privacy-preserving peer-to-peer crypto trading",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <Providers>
          <div className="min-h-screen text-white pt-24 pb-12 selection:bg-cyan-900 selection:text-cyan-100 relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 z-0">
              <div className="absolute -top-56 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[130px]" />
              <div className="absolute bottom-[-14rem] right-[-8rem] h-[28rem] w-[28rem] rounded-full bg-emerald-500/10 blur-[120px]" />
            </div>
            <Navbar />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col items-center">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
