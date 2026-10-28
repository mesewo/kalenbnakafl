"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, type User, type UserRole } from "@/lib/api";
export default function UsersPage() {
  const t = useTranslations("dashboard");
  const roleLabels: Record<UserRole, string> = {
    user: t("roleUser"),
    volunteer: t("roleVolunteer"),
    editor: t("roleEditor"),
    admin: t("roleAdmin"),
  };
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" as UserRole });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setUsers((await apiFetch<User[]>("/admin/users", {})) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadUsersFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, user]);
  useEffect(() => {
    void load();
  }, [load]);
  function start(userToEdit?: User) {
    setEditing(userToEdit || null);
    setForm({
      name: userToEdit?.name || "",
      email: userToEdit?.email || "",
      password: "",
      role: userToEdit?.role || "user",
    });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch(editing ? `/admin/users/${editing.id}` : "/admin/users", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(form),
      });
      start();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveUserFailed"));
    }
  }
  async function remove(userToRemove: User) {
    if (userToRemove.id === user?.id) {
      setError(t("cannotDeleteSelf"));
      return;
    }
    if (!window.confirm(t("confirmDeleteUser", { name: userToRemove.name }))) return;
    try {
      await apiFetch(`/admin/users/${userToRemove.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("deleteUserFailed"));
    }
  }
  return (
    <div>
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">{t("usersEyebrow")}</span>
          <h1>{t("users")}</h1>
        </div>
        <button className="btn btn-primary" onClick={() => start()}>
          {t("newUser")}
        </button>
      </div>
      {(editing !== null || form.name || form.email || form.password) && (
        <div className="form-card" style={{ marginBottom: "1.5rem" }}>
          <h2>{editing ? t("editUser") : t("createUser")}</h2>
          <form onSubmit={submit}>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="user-name">{t("name")}</label>
                <input
                  id="user-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="user-email">{t("email")}</label>
                <input
                  id="user-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="user-role">{t("role")}</label>
                <select
                  id="user-role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                >
                  <option value="user">{roleLabels.user}</option>
                  <option value="volunteer">{roleLabels.volunteer}</option>
                  <option value="editor">{roleLabels.editor}</option>
                  <option value="admin">{roleLabels.admin}</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="user-password">
                  {editing ? t("resetPassword") : t("password")}
                </label>
                <input
                  id="user-password"
                  type="password"
                  minLength={8}
                  required={!editing}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary">
                {editing ? t("saveChanges") : t("createUser")}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => start()}>
                {t("cancel")}
              </button>
            </div>
          </form>
        </div>
      )}
      {error && (
        <div className="status status-error" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      {loading ? (
        <div className="empty-state">{t("loadingUsers")}</div>
      ) : users.length === 0 ? (
        <div className="empty-state">{t("noUsers")}</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("name")}</th>
                <th>{t("email")}</th>
                <th>{t("role")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.email}</td>
                  <td>
                    <span className="badge">{roleLabels[item.role]}</span>
                  </td>
                  <td>
                    <div className="form-actions">
                      <button className="btn btn-outline btn-small" onClick={() => start(item)}>
                        {t("edit")}
                      </button>
                      <button className="btn btn-danger btn-small" onClick={() => remove(item)}>
                        {t("delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
