import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
export const metadata: Metadata = {
  title: "Kalen Benakafil | Community NGO",
  description:
    "A community NGO connecting people with practical ways to serve, learn, and make a difference.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
