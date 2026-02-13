import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";
import "./globals.css";

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
      <body>
        <Providers>
          <div className="min-h-screen bg-black text-white pt-24 pb-12 selection:bg-gray-700 selection:text-white">
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
