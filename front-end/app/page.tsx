"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  apiFetch,
  excerpt,
  formatDate,
  type EventItem,
  type PageResponse,
  type Post,
} from "@/lib/api";
export default function HomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  useEffect(() => {
    Promise.all([
      apiFetch<PageResponse<Post>>("/posts?limit=2"),
      apiFetch<PageResponse<EventItem>>("/events?upcoming=true&limit=2"),
    ])
      .then(([p, e]) => {
        setPosts(p.items || []);
        setEvents(e.items || []);
      })
      .catch(() => undefined);
  }, []);
  return (
    <>
      <Navbar />
      <main id="main-content">
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <span className="eyebrow">Community-led action</span>
              <h1 className="display">
                Small actions. <em>Stronger neighborhoods.</em>
              </h1>
              <p className="lede">
                Kalen Benakafil is a community NGO connecting people with practical ways to serve,
                learn, and create positive change together.
              </p>
              <div className="hero-actions">
                <Link className="btn btn-primary" href="/volunteer">
                  Find your way to help
                </Link>
                <Link className="btn btn-outline" href="/events">
                  See upcoming events
                </Link>
              </div>
            </div>
            <div className="hero-card">
              <span className="eyebrow" style={{ color: "var(--sun)" }}>
                Our shared work
              </span>
              <h2
                style={{
                  fontFamily: "Fraunces, Georgia, serif",
                  fontSize: "clamp(2rem,5vw,3.8rem)",
                  lineHeight: 1,
                  marginTop: "1rem",
                }}
              >
                Make room for more people to thrive.
              </h2>
              <div className="hero-note">
                <strong>One community</strong>
                <span>People, ideas, and practical support moving in the same direction.</span>
              </div>
            </div>
          </div>
        </section>
        <section className="section">
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow">How we show up</span>
                <h2>Useful work, done together.</h2>
              </div>
              <p>
                We create welcoming ways for neighbors to contribute, learn from each other, and
                stay connected to what is happening locally.
              </p>
            </div>
            <div className="grid-3">
              <article className="card card-accent">
                <div className="icon-box">01</div>
                <h3>Connect</h3>
                <p>
                  Bring people and local ideas into the same room so support can move where it is
                  needed.
                </p>
              </article>
              <article className="card card-accent">
                <div className="icon-box">02</div>
                <h3>Learn</h3>
                <p>
                  Share practical knowledge, stories, and opportunities that help communities grow
                  stronger.
                </p>
              </article>
              <article className="card card-accent">
                <div className="icon-box">03</div>
                <h3>Act</h3>
                <p>
                  Turn good intentions into clear next steps through events, volunteering, and
                  community projects.
                </p>
              </article>
            </div>
          </div>
        </section>
        <section className="stats-band">
          <div className="container stats-grid">
            <div className="stat">
              <strong>01</strong>
              <span>People-first programs</span>
            </div>
            <div className="stat">
              <strong>03</strong>
              <span>Ways to get involved</span>
            </div>
            <div className="stat">
              <strong>∞</strong>
              <span>Ideas worth sharing</span>
            </div>
            <div className="stat">
              <strong>→</strong>
              <span>Progress through action</span>
            </div>
          </div>
        </section>
        <section className="section">
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow">Coming up</span>
                <h2>Join the next moment.</h2>
              </div>
              <Link className="btn btn-outline" href="/events">
                All events →
              </Link>
            </div>
            <div className="grid-2">
              {events.slice(0, 2).map((event) => (
                <article className="card" key={event.id}>
                  <span className="meta">{formatDate(event.event_date, true)}</span>
                  <h3>{event.title}</h3>
                  <p>{excerpt(event.description, 130)}</p>
                  <Link className="btn btn-sun btn-small" href="/contact">
                    Ask about this event
                  </Link>
                </article>
              ))}
              {events.length === 0 && (
                <div className="empty-state">
                  New events are on the way. Check back soon or{" "}
                  <Link href="/contact" style={{ textDecoration: "underline" }}>
                    send us a message
                  </Link>
                  .
                </div>
              )}
            </div>
          </div>
        </section>
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow">From the community</span>
                <h2>Stories worth passing on.</h2>
              </div>
              <Link className="btn btn-outline" href="/blog">
                Read all news →
              </Link>
            </div>
            <div className="grid-2">
              {posts.slice(0, 2).map((post) => (
                <article className="card" key={post.id}>
                  <span className="meta">Community note</span>
                  <h3>{post.title}</h3>
                  <p>{excerpt(post.content, 160)}</p>
                </article>
              ))}
              {posts.length === 0 && (
                <div className="empty-state">We are preparing the next community update.</div>
              )}
            </div>
          </div>
        </section>
        <section className="cta-band section">
          <div className="container cta-row">
            <h2>Have time, an idea, or a question? There is a place for you here.</h2>
            <Link href="/contact" className="btn btn-primary">
              Start a conversation
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
