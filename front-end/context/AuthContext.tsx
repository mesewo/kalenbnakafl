"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore auth state from localStorage on mount
  useEffect(() => {
    const t = localStorage.getItem("token");
    const u = localStorage.getItem("user");
    
    if (t && u) {
      try {
        setToken(t);
        setUser(JSON.parse(u));
      } catch (err) {
        // Invalid stored data, clear it
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      }
    }
    
    setIsLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const data = await apiFetch("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    setToken(data.token);
    setUser(data.user);
    
    // Persist to localStorage (7-day expiry in real app)
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
  }

  function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
