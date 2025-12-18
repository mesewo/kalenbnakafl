const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";

export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null
) {
  if (!API_URL || API_URL === "undefined") {
    throw new Error("API URL is not configured. Check NEXT_PUBLIC_API_URL in .env.local");
  }

  const url = `${API_URL}${endpoint}`;
  
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "API Error");
  }

  return res.json();
}
