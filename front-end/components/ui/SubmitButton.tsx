import type { ReactNode } from "react";

export default function SubmitButton({
  pending,
  pendingLabel,
  children,
  className = "btn btn-primary",
}: {
  pending: boolean;
  pendingLabel: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
