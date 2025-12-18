"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

export default function MediaAdminPage() {
  const { token } = useAuth();
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchMedia = async () => {
      try {
        setLoading(true);
        const data = await apiFetch("/admin/media", {}, token);
        setMedia(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load media");
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchMedia();
    }
  }, [token]);

  if (loading) return <div>Loading media...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Manage Media</h2>
      <button className="bg-primaryDark px-4 py-2 rounded mb-4">
        Add Media
      </button>

      {error && <div className="text-red-600 mb-4">{error}</div>}

      <div className="bg-white p-4 rounded shadow">
        {media && media.length > 0 ? (
          <div>
            {media.map((item: any) => (
              <div key={item.id} className="border-b pb-4 mb-4">
                <h3 className="font-bold">{item.title}</h3>
                <p className="text-sm text-gray-600">
                  <a href={item.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                    View File
                  </a>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p>No media yet.</p>
        )}
      </div>
    </div>
  );
}
