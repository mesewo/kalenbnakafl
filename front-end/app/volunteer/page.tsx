"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

type Application = {
  id: number;
  skills: string;
  availability: string;
  message: string;
  status: string;
  created_at: string;
};

export default function VolunteerPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [application, setApplication] = useState<Application | null>(null);
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({ skills: "", availability: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadApplication = useCallback(async () => {
    if (!user) return;
    setChecking(true);
    try {
      setApplication(await apiFetch<Application>("/me/volunteer-application"));
    } catch (err) {
      if (err instanceof Error && "status" in err && err.status === 404) setApplication(null);
      else setError(err instanceof Error ? err.message : "Could not check your application.");
    } finally {
      setChecking(false);
    }
  }, [user]);

  useEffect(() => {
    void loadApplication();
  }, [loadApplication]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await apiFetch("/me/volunteer-application", { method: "POST", body: JSON.stringify(form) });
      setNotice("Your application has been submitted.");
      await loadApplication();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your application.");
    } finally {
      setLoading(false);
    }
  }

  const canApply = user?.role === "user" && !application;
  return (
    <>
      <Navbar />
      <main id="main-content">
        <section className="page-hero">
          <div className="container">
            <span className="eyebrow">Make a difference</span>
            <h1>Bring your time, skills, and curiosity.</h1>
            <p>Tell us how you would like to contribute to the community.</p>
          </div>
        </section>
        <section className="section">
          <div className="container grid-2">
            <div>
              <span className="eyebrow">Ways to participate</span>
              <h2 className="display" style={{ fontSize: "clamp(2.3rem,5vw,4.2rem)" }}>
                There is no single way to <em>help.</em>
              </h2>
              <p className="lede">
                Support events, welcome participants, share a skill, help with communication, or
                bring an idea we can shape together.
              </p>
              {!authLoading && !user && (
                <div className="form-actions">
                  <Link className="btn btn-primary" href="/auth/login?next=%2Fvolunteer">
                    Log in to apply
                  </Link>
                  <Link className="btn btn-outline" href="/auth/register">
                    Create an account
                  </Link>
                </div>
              )}
              {user && checking ? (
                <div className="empty-state" role="status">
                  Checking your application…
                </div>
              ) : null}
              {user && application && (
                <div className="card card-accent" aria-live="polite">
                  <h3>Application status: {application.status}</h3>
                  <p>
                    We have your volunteer application. You cannot submit another unless an
                    administrator takes action.
                  </p>
                </div>
              )}
              {user && !checking && user.role !== "user" && !application && (
                <div className="status" role="status">
                  Your account already has the {user.role} role and cannot submit a volunteer
                  application.
                </div>
              )}
              {error && (
                <div className="status status-error" role="alert">
                  {error}
                </div>
              )}
              {notice && (
                <div className="status" role="status">
                  {notice}
                </div>
              )}
              {canApply && (
                <form onSubmit={submit}>
                  <div className="field">
                    <label htmlFor="volunteer-skills">Skills and interests</label>
                    <textarea
                      id="volunteer-skills"
                      value={form.skills}
                      onChange={(e) => setForm((prev) => ({ ...prev, skills: e.target.value }))}
                      maxLength={2000}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="volunteer-availability">Availability</label>
                    <textarea
                      id="volunteer-availability"
                      value={form.availability}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, availability: e.target.value }))
                      }
                      maxLength={1000}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="volunteer-message">
                      Anything else you would like us to know (optional)
                    </label>
                    <textarea
                      id="volunteer-message"
                      value={form.message}
                      onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                      maxLength={5000}
                    />
                  </div>
                  <button className="btn btn-primary" disabled={loading}>
                    {loading ? "Submitting…" : "Submit application"}
                  </button>
                </form>
              )}
            </div>
            <div className="grid-3" style={{ gridTemplateColumns: "1fr" }}>
              <article className="card card-accent">
                <h3>Show up</h3>
                <p>Help make community events warm, organized, and easy to join.</p>
              </article>
              <article className="card card-accent">
                <h3>Share a skill</h3>
                <p>
                  Offer practical knowledge that helps others feel more confident and connected.
                </p>
              </article>
              <article className="card card-accent">
                <h3>Start a conversation</h3>
                <p>Tell us what you care about and we will help find a meaningful next step.</p>
              </article>
            </div>
          </div>
        </section>
        <section className="cta-band section">
          <div className="container cta-row">
            <h2>Not ready to apply? Ask a question first.</h2>
            <Link href="/contact" className="btn btn-primary">
              Contact the team
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
