"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { apiFetch, formatDate, type EventItem, type PageResponse } from "@/lib/api";

export default function EventsPage() {
  const [result, setResult] = useState<PageResponse<EventItem>>({
    items: [],
    page: 1,
    limit: 10,
    total: 0,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<PageResponse<EventItem>>(`/events?upcoming=true&page=${page}&limit=10`)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load events");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page]);

  const hasNext = page * result.limit < result.total;
  return (
    <>
      <Navbar />
      <main id="main-content">
        <section className="page-hero">
          <div className="container">
            <span className="eyebrow">Gather with us</span>
            <h1>There is always a next step to join.</h1>
            <p>
              From workshops to community projects, events are a simple way to meet people and move
              an idea forward.
            </p>
          </div>
        </section>
        <section className="section">
          <div className="container">
            {loading ? (
              <div className="empty-state">Loading upcoming events…</div>
            ) : error ? (
              <div className="status status-error" role="alert">
                {error}
              </div>
            ) : result.items.length === 0 ? (
              <div className="empty-state">
                No upcoming events are listed right now.{" "}
                <Link href="/contact" style={{ textDecoration: "underline" }}>
                  Ask us what is being planned.
                </Link>
              </div>
            ) : (
              <div className="grid-2">
                {result.items.map((event) => (
                  <article className="card" key={event.id}>
                    <span className="eyebrow">{formatDate(event.event_date, true)}</span>
                    <h2>{event.title}</h2>
                    <p>{event.description}</p>
                    {event.location && <p className="meta">{event.location}</p>}
                    <Link className="btn btn-sun btn-small" href="/contact">
                      Ask about this event
                    </Link>
                  </article>
                ))}
              </div>
            )}
            <nav
              className="form-actions"
              aria-label="Event pages"
              style={{ justifyContent: "space-between", marginTop: "1.5rem" }}
            >
              <button
                className="btn btn-outline"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
              >
                Previous
              </button>
              <span className="meta">
                Page {page} of {Math.max(1, Math.ceil(result.total / result.limit))}
              </span>
              <button
                className="btn btn-outline"
                onClick={() => setPage((current) => current + 1)}
                disabled={!hasNext || loading}
              >
                Next
              </button>
            </nav>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
