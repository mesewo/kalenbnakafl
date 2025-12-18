"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

export default function EventsAdminPage() {
  const { token, user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        // Use role-specific endpoint
        const endpoint = user?.role === "admin" ? "/admin/events" : "/editor/events";
        const data = await apiFetch(endpoint, {}, token);
        setEvents(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load events");
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchEvents();
    }
  }, [token, user?.role]);

  if (loading) return <div>Loading events...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Manage Events</h2>
      <button className="bg-primaryDark px-4 py-2 rounded mb-4">
        Add Event
      </button>

      {error && <div className="text-red-600 mb-4">{error}</div>}

      <div className="bg-white p-4 rounded shadow">
        {events && events.length > 0 ? (
          <div>
            {events.map((event: any) => (
              <div key={event.id} className="border-b pb-4 mb-4">
                <h3 className="font-bold">{event.title}</h3>
                <p>{event.description}</p>
                <p className="text-sm text-gray-600">Date: {event.date}</p>
              </div>
            ))}
          </div>
        ) : (
          <p>No events yet.</p>
        )}
      </div>
    </div>
  );
}
