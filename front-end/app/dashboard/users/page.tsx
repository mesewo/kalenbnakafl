"use client";

import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";

export default function UsersPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;

    const fetchUsers = async () => {
      try {
        setLoading(true);
        const data = await apiFetch("/admin/users", {}, token);
        setUsers(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load users");
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [token]);

  if (loading) return <div>Loading users...</div>;

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Users</h1>

      {error && <div className="text-red-600 mb-4">{error}</div>}

      {users && users.length > 0 ? (
        <ul className="bg-white p-4 rounded shadow">
          {users.map((u: any) => (
            <li key={u.id} className="border-b py-2">
              {u.name} — {u.role}
            </li>
          ))}
        </ul>
      ) : (
        <p>No users found.</p>
      )}
    </div>
  );
}
