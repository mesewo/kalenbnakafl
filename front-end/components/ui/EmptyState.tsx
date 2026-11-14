import type { ReactNode } from "react";

export default function EmptyState({
  children,
  role,
  className = "",
}: {
  children: ReactNode;
  role?: "status" | "alert";
  className?: string;
}) {
  return (
    <div className={`empty-state ${className}`.trim()} role={role}>
      {children}
    </div>
  );
}
