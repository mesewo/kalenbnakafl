"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { apiFetch } from "@/lib/api";

export default function EventsPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const data = await apiFetch("/events");
        setEvents(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load events");
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  return (
    <>
      <Navbar />

      <section className="bg-primary py-16 text-center">
        <h1 className="text-4xl font-bold">Upcoming Events</h1>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-16">
        {loading ? (
          <p className="text-center">Loading events...</p>
        ) : error ? (
          <p className="text-center text-red-600">{error}</p>
        ) : events && events.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-8">
            {events.map((event: any) => (
              <div key={event.id} className="border rounded-lg p-6 shadow">
                <h2 className="text-xl font-semibold">{event.title}</h2>
                <p className="text-sm text-gray-600">{event.event_date}</p>
                <p className="mt-2">{event.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center">No events available.</p>
        )}
      </section>

      <Footer />
    </>
  );
}
