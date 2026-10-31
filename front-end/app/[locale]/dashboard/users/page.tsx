"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/DashboardProviders";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, type User, type UserRole } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

type UserForm = { name: string; email: string; password: string; role: UserRole };

export default function UsersPage() {
  const t = useTranslations("dashboard");
  const showToast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState<User | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>({
    name: "",
    email: "",
    password: "",
    role: "user",
  });
  const [error, setError] = useState("");

  const usersQuery = useQuery({
    queryKey: queryKeys.users,
    queryFn: () => apiFetch<User[]>("/admin/users"),
    enabled: Boolean(user),
  });
  const users = usersQuery.data ?? [];

  const saveUser = useMutation({
    mutationFn: ({ userID, values }: { userID: number | null; values: UserForm }) =>
      apiFetch(userID ? `/admin/users/${userID}` : "/admin/users", {
        method: userID ? "PATCH" : "POST",
        body: JSON.stringify(values),
      }),
    onMutate: async ({ userID, values }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.users });
      const previous = queryClient.getQueryData<User[]>(queryKeys.users);
      queryClient.setQueryData<User[]>(queryKeys.users, (current = []) => {
        if (userID === null) {
          return [
            {
              id: -Date.now(),
              name: values.name,
              email: values.email,
              role: values.role,
              created_at: new Date().toISOString(),
            },
            ...current,
          ];
        }
        return current.map((item) =>
          item.id === userID
            ? { ...item, name: values.name, email: values.email, role: values.role }
            : item,
        );
      });
      return { previous };
    },
    onError: (cause, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.users, context.previous);
      const message = cause instanceof Error ? cause.message : t("saveUserFailed");
      setError(message);
      showToast(message, "error");
    },
    onSuccess: (_result, variables) => {
      setError("");
      showToast(t(variables.userID ? "userUpdated" : "userCreated"));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.users }),
  });

  const deleteUser = useMutation({
    mutationFn: (userToRemove: User) =>
      apiFetch(`/admin/users/${userToRemove.id}`, { method: "DELETE" }),
    onMutate: async (userToRemove) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.users });
      const previous = queryClient.getQueryData<User[]>(queryKeys.users);
      queryClient.setQueryData<User[]>(queryKeys.users, (current = []) =>
        current.filter((item) => item.id !== userToRemove.id),
      );
      return { previous };
    },
    onError: (cause, _userToRemove, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.users, context.previous);
      const message = cause instanceof Error ? cause.message : t("deleteUserFailed");
      setError(message);
      showToast(message, "error");
    },
    onSuccess: () => {
      setError("");
      showToast(t("userDeleted"));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.users }),
  });

  const roleLabels: Record<UserRole, string> = {
    user: t("roleUser"),
    volunteer: t("roleVolunteer"),
    editor: t("roleEditor"),
    admin: t("roleAdmin"),
  };

  function start(userToEdit?: User) {
    setEditing(userToEdit ?? null);
    setForm({
      name: userToEdit?.name ?? "",
      email: userToEdit?.email ?? "",
      password: "",
      role: userToEdit?.role ?? "user",
    });
    setError("");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setForm({ name: "", email: "", password: "", role: "user" });
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const passwordBytes = new TextEncoder().encode(form.password).length;
    if (
      (!editing && !form.password) ||
      (form.password && (Array.from(form.password).length < 12 || passwordBytes > 72))
    ) {
      setError(t("managedPasswordHint"));
      return;
    }
    try {
      await saveUser.mutateAsync({ userID: editing?.id ?? null, values: form });
      closeForm();
    } catch {
      // Mutation error is rendered beside the form and announced as a toast.
    }
  }

  function requestDelete(userToRemove: User) {
    if (userToRemove.id === user?.id) {
      const message = t("cannotDeleteSelf");
      setError(message);
      showToast(message, "error");
      return;
    }
    setPendingDelete(userToRemove);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteUser.mutateAsync(pendingDelete);
      setPendingDelete(null);
    } catch {
      setPendingDelete(null);
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
      {formOpen && (
        <div className="form-card" style={{ marginBottom: "1.5rem" }}>
          <h2>{editing ? t("editUser") : t("createUser")}</h2>
          <form onSubmit={submit}>
            {error && (
              <div className="status status-error" role="alert" style={{ marginBottom: "1rem" }}>
                {error}
              </div>
            )}
            <div className="grid-2">
              <div className="field">
                <label htmlFor="user-name">{t("name")}</label>
                <input
                  id="user-name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="user-email">{t("email")}</label>
                <input
                  id="user-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="user-role">{t("role")}</label>
                <select
                  id="user-role"
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
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
                  minLength={12}
                  maxLength={72}
                  required={!editing}
                  value={form.password}
                  onChange={(event) => {
                    if (new TextEncoder().encode(event.target.value).length <= 72) {
                      setForm({ ...form, password: event.target.value });
                      setError("");
                    }
                  }}
                  aria-describedby="managed-password-hint"
                />
                <small id="managed-password-hint">{t("managedPasswordHint")}</small>
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={saveUser.isPending}>
                {saveUser.isPending ? t("saving") : editing ? t("saveChanges") : t("createUser")}
              </button>
              <button type="button" className="btn btn-outline" onClick={closeForm}>
                {t("cancel")}
              </button>
            </div>
          </form>
        </div>
      )}
      {!formOpen && error && (
        <div className="status status-error" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      {usersQuery.isPending ? (
        <div className="table-wrap" aria-label={t("loadingUsers")} role="status">
          <table className="data-table">
            <tbody>
              {Array.from({ length: 5 }, (_, index) => (
                <tr className="skeleton-row" key={index}>
                  <td colSpan={4}> </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : usersQuery.isError ? (
        <div className="status status-error" role="alert">
          {usersQuery.error instanceof Error ? usersQuery.error.message : t("loadUsersFailed")}
        </div>
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
                      <button
                        className="btn btn-danger btn-small"
                        onClick={() => requestDelete(item)}
                      >
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
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("confirmActionTitle")}
        message={pendingDelete ? t("confirmDeleteUser", { name: pendingDelete.name }) : ""}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
