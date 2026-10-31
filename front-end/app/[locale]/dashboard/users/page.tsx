"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/DashboardProviders";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, type User, type UserRole } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import FormDialog from "@/components/ui/FormDialog";
import SubmitButton from "@/components/ui/SubmitButton";
import StatusBadge from "@/components/ui/StatusBadge";
import { useCrud } from "@/lib/use-crud";

type UserForm = { name: string; email: string; password: string; role: UserRole };

export default function UsersPage() {
  const t = useTranslations("dashboard");
  const showToast = useToast();
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
  const [initialForm, setInitialForm] = useState<UserForm>({
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
  const crud = useCrud<User, UserForm>({
    queryKey: queryKeys.users,
    create: (values) => apiFetch("/admin/users", { method: "POST", body: JSON.stringify(values) }),
    update: (id, values) =>
      apiFetch(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(values) }),
    remove: (id) => apiFetch(`/admin/users/${id}`, { method: "DELETE" }),
    optimisticCreate: (values) => ({
      id: -Date.now(),
      name: values.name,
      email: values.email,
      role: values.role,
      created_at: new Date().toISOString(),
    }),
    optimisticUpdate: (item, values) => ({
      ...item,
      name: values.name,
      email: values.email,
      role: values.role,
    }),
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
    setInitialForm({
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
      await crud.save.mutateAsync({ id: editing?.id ?? null, input: form });
      showToast(t(editing ? "userUpdated" : "userCreated"));
      closeForm();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("saveUserFailed");
      setError(message);
      showToast(message, "error");
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
      await crud.destroy.mutateAsync(pendingDelete.id);
      showToast(t("userDeleted"));
      setPendingDelete(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("deleteUserFailed");
      setError(message);
      showToast(message, "error");
      setPendingDelete(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t("usersEyebrow")}
        title={t("users")}
        action={
          <button className="btn btn-primary" onClick={() => start()}>
            {t("newUser")}
          </button>
        }
      />
      {error && !formOpen && (
        <div className="status status-error dashboard-status" role="alert">
          {error}
        </div>
      )}
      <FormDialog
        open={formOpen}
        title={editing ? t("editUser") : t("createUser")}
        onClose={closeForm}
        dirty={JSON.stringify(form) !== JSON.stringify(initialForm)}
        discardTitle={t("confirmActionTitle")}
        discardMessage={t("discardFormChanges")}
        discardLabel={t("discardChanges")}
        cancelLabel={t("cancel")}
        closeLabel={t("closeDialog")}
      >
        {(requestClose) => (
          <div className="form-card">
            <h2>{editing ? t("editUser") : t("createUser")}</h2>
            <form onSubmit={submit}>
              {error && (
                <div className="status status-error dashboard-status" role="alert">
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
                <SubmitButton pending={crud.save.isPending} pendingLabel={t("saving")}>
                  {editing ? t("saveChanges") : t("createUser")}
                </SubmitButton>
                <button type="button" className="btn btn-outline" onClick={requestClose}>
                  {t("cancel")}
                </button>
              </div>
            </form>
          </div>
        )}
      </FormDialog>
      <DataTable
        rows={users}
        rowKey={(item) => item.id}
        loading={usersQuery.isPending}
        loadingLabel={t("loadingUsers")}
        error={
          usersQuery.isError
            ? usersQuery.error instanceof Error
              ? usersQuery.error.message
              : t("loadUsersFailed")
            : undefined
        }
        emptyState={t("noUsers")}
        searchable
        searchPlaceholder={t("usersSearch")}
        columns={[
          {
            id: "name",
            label: t("name"),
            header: t("name"),
            cell: (item) => item.name,
            searchText: (item) => item.name,
            sortValue: (item) => item.name,
          },
          {
            id: "email",
            label: t("email"),
            header: t("email"),
            cell: (item) => item.email,
            searchText: (item) => item.email,
            sortValue: (item) => item.email,
          },
          {
            id: "role",
            label: t("role"),
            header: t("role"),
            cell: (item) => <StatusBadge>{roleLabels[item.role]}</StatusBadge>,
            sortValue: (item) => roleLabels[item.role],
          },
          {
            id: "actions",
            label: t("actions"),
            header: t("actions"),
            cell: (item) => (
              <div className="form-actions">
                <button className="btn btn-outline btn-small" onClick={() => start(item)}>
                  {t("edit")}
                </button>
                <button className="btn btn-danger btn-small" onClick={() => requestDelete(item)}>
                  {t("delete")}
                </button>
              </div>
            ),
          },
        ]}
      />
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
