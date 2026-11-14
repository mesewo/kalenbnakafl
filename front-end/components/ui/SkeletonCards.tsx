"use client";

export default function SkeletonCards({
  label,
  className = "grid-2",
  count = 4,
}: {
  label: string;
  className?: string;
  count?: number;
}) {
  return (
    <div className={className} role="status" aria-label={label} aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <article className="card dashboard-skeleton-card" aria-hidden="true" key={index}>
          <span />
          <span />
          <span />
        </article>
      ))}
    </div>
  );
}
