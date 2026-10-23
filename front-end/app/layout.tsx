import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
});

const fraunces = Fraunces({
  axes: ["opsz"],
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: "variable",
});

export const metadata: Metadata = {
  title: "Kalen Benakafil | Community NGO",
  description:
    "A community NGO connecting people with practical ways to serve, learn, and make a difference.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${fraunces.variable}`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
