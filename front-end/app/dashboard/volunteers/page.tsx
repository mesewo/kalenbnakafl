"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

export default function VolunteerAdminPage() {
  const { token } = useAuth();
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchVolunteers = async () => {
      try {
        setLoading(true);
        const data = await apiFetch("/admin/users", {}, token);
        // Filter for volunteer role
        const volunteerUsers = data?.filter((user: any) => user.role === "volunteer") || [];
        setVolunteers(volunteerUsers);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load volunteers");
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchVolunteers();
    }
  }, [token]);

  if (loading) return <div>Loading volunteers...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Manage Volunteers</h2>
      <button className="bg-primaryDark px-4 py-2 rounded mb-4">
        Add Volunteer
      </button>

      {error && <div className="text-red-600 mb-4">{error}</div>}

      <div className="bg-white p-4 rounded shadow">
        {volunteers && volunteers.length > 0 ? (
          <div>
            {volunteers.map((volunteer: any) => (
              <div key={volunteer.id} className="border-b pb-4 mb-4">
                <h3 className="font-bold">{volunteer.name}</h3>
                <p className="text-sm text-gray-600">{volunteer.email}</p>
              </div>
            ))}
          </div>
        ) : (
          <p>No volunteers yet.</p>
        )}
      </div>
    </div>
  );
}
