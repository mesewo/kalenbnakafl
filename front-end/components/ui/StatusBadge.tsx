import type { ReactNode } from "react";

export default function StatusBadge({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`badge ${className}`.trim()}>{children}</span>;
}
