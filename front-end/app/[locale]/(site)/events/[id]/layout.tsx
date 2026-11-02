import { connection } from "next/server";

export default async function EventDetailLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return children;
}
