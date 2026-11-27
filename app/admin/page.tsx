"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserPlus, ShieldAlert, Pencil, X } from "lucide-react";
import TopNav from "@/components/TopNav";
import type { Role, SafeUser } from "@/lib/types";

interface AuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  target: string;
  timestamp: string;
}

type AdminSection = "all" | "users" | "audit";

export default function AdminPage() {
  const [me, setMe] = useState<SafeUser | null>(null);
  const [section, setSection] = useState<AdminSection>("all");
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("candidate");
  const [password, setPassword] = useState("demo1234");

  const [editingUser, setEditingUser] = useState<SafeUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>("candidate");
  const [editPassword, setEditPassword] = useState("");

  async function loadAll() {
    setLoading(true);
    setError(null);
    const meRes = await fetch("/api/auth/me");
    const meData = (await meRes.json()) as { user: SafeUser | null };
    setMe(meData.user);

    const res = await fetch("/api/admin/users");
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      setError(err.error ?? "Administrator access required");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as {
      users: SafeUser[];
      auditLogs: AuditEntry[];
    };
    setUsers(data.users);
    setAuditLogs(data.auditLogs);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!editingUser) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditingUser(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingUser]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setError(null);
    if (name.trim().length < 2 || !email.includes("@") || password.length < 6) {
      setError("Provide valid name (2+ chars), email, and password (6+ chars)");
      return;
    }
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role, password }),
    });
    const data = (await res.json()) as { user?: SafeUser; error?: string };
    if (!res.ok) {
      setError(data.error ?? "Failed to create user");
      return;
    }
    setName("");
    setEmail("");
    setNotice(`Created ${data.user?.email}`);
    await loadAll();
  }

  async function handleUpdateUser(
    userId: string,
    patch: { name?: string; role?: Role; active?: boolean; password?: string }
  ) {
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...patch }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Update failed");
      return false;
    }
    setNotice("Account updated");
    await loadAll();
    return true;
  }

  function openEditModal(u: SafeUser) {
    setEditingUser(u);
    setEditName(u.name);
    setEditRole(u.role);
    setEditPassword("");
  }

  async function handleSaveEditModal(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    if (editName.trim().length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }
    if (editPassword && editPassword.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }
    const ok = await handleUpdateUser(editingUser.id, {
      name: editName.trim(),
      role: editRole,
      ...(editPassword ? { password: editPassword } : {}),
    });
    if (ok) setEditingUser(null);
  }

  const activeUsersCount = users.filter((u) => u.active).length;

  return (
    <div className="min-h-screen bg-[#F6F8FA]">
      <TopNav user={me} />

      <main
        id="main-content"
        className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#1D4ED8]">Administration</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#0F172A]">
              User accounts, roles, and audit log
            </h1>
          </div>
          <Link
            href="/login"
            className="inline-flex min-h-[40px] cursor-pointer items-center rounded-lg border border-[rgba(15,23,42,0.12)] bg-white px-3.5 py-2 text-sm font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
          >
            Switch account
          </Link>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]"
          >
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="mt-4 rounded-lg border border-[#0F766E]/30 bg-[#F0FDFA] p-3 text-sm text-[#0F766E]">
            {notice}
          </div>
        )}

        {loading && (
          <div className="mt-6 rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6 text-sm text-[#475569]">
            Loading directory and audit records...
          </div>
        )}

        {!loading && (!error || users.length > 0) && (
          <div className="mt-6 flex flex-col gap-6 lg:flex-row">
            {/* Responsive left navigation rail (240px on lg+) */}
            <aside className="shrink-0 space-y-4 lg:w-[240px]">
              <nav
                role="tablist"
                aria-label="Administration sections"
                className="flex flex-row gap-1.5 overflow-x-auto rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-2 lg:flex-col"
              >
                {(
                  [
                    ["all", "All sections"],
                    ["users", "User accounts"],
                    ["audit", "Audit log"],
                  ] as [AdminSection, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={section === id}
                    type="button"
                    onClick={() => setSection(id)}
                    className={`min-h-[40px] shrink-0 cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                      section === id
                        ? "bg-[#1D4ED8] text-white"
                        : "text-[#475569] hover:bg-[#EEF2F6] hover:text-[#0F172A]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              <dl className="hidden space-y-3 rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-4 text-xs lg:block">
                <div className="flex items-center justify-between">
                  <dt className="text-[#64748B]">Total accounts</dt>
                  <dd className="font-mono font-semibold tabular-nums text-[#0F172A]">
                    {users.length}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[#64748B]">Active accounts</dt>
                  <dd className="font-mono font-semibold tabular-nums text-[#0F766E]">
                    {activeUsersCount}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[#64748B]">Audit events</dt>
                  <dd className="font-mono font-semibold tabular-nums text-[#0F172A]">
                    {auditLogs.length}
                  </dd>
                </div>
              </dl>
            </aside>

            <div className="min-w-0 flex-1 space-y-6">
              {(section === "all" || section === "users") && (
                <div className="grid gap-6 xl:grid-cols-12">
                  <section className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6 xl:col-span-4">
                    <div className="flex items-center gap-2 text-base font-semibold text-[#0F172A]">
                      <UserPlus
                        className="h-4 w-4 text-[#1D4ED8]"
                        aria-hidden="true"
                      />
                      <h2>Create account</h2>
                    </div>
                    <form
                      onSubmit={handleCreateUser}
                      className="mt-4 space-y-3"
                      noValidate
                    >
                      <div>
                        <label
                          htmlFor="adm-name"
                          className="block text-xs font-medium text-[#0F172A]"
                        >
                          Full name
                        </label>
                        <input
                          id="adm-name"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="adm-email"
                          className="block text-xs font-medium text-[#0F172A]"
                        >
                          Email
                        </label>
                        <input
                          id="adm-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="adm-role"
                          className="block text-xs font-medium text-[#0F172A]"
                        >
                          Role
                        </label>
                        <select
                          id="adm-role"
                          value={role}
                          onChange={(e) => setRole(e.target.value as Role)}
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] bg-white px-3 py-2 text-sm"
                        >
                          <option value="candidate">Candidate</option>
                          <option value="examiner">Examiner</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="adm-pwd"
                          className="block text-xs font-medium text-[#0F172A]"
                        >
                          Initial password
                        </label>
                        <input
                          id="adm-pwd"
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-3 py-2 text-sm"
                        />
                      </div>
                      <button
                        type="submit"
                        className="min-h-[40px] w-full cursor-pointer rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
                      >
                        Create user
                      </button>
                    </form>
                  </section>

                  <section className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6 xl:col-span-8">
                    <h2 className="text-base font-semibold text-[#0F172A]">
                      Platform users{" "}
                      <span className="font-mono text-sm font-medium tabular-nums text-[#64748B]">
                        ({users.length})
                      </span>
                    </h2>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-[rgba(15,23,42,0.12)] text-xs text-[#64748B]">
                            <th className="py-2 pr-3 font-medium">Name</th>
                            <th className="py-2 pr-3 font-medium">Email</th>
                            <th className="py-2 pr-3 font-medium">Role</th>
                            <th className="py-2 pr-3 font-medium">Status</th>
                            <th className="py-2 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((u) => (
                            <tr
                              key={u.id}
                              className="border-b border-[rgba(15,23,42,0.08)] last:border-0"
                            >
                              <td className="py-2.5 pr-3 font-medium text-[#0F172A]">
                                {u.name}
                              </td>
                              <td className="py-2.5 pr-3 text-xs text-[#475569]">
                                {u.email}
                              </td>
                              <td className="py-2.5 pr-3">
                                <select
                                  aria-label={`Role for ${u.name}`}
                                  value={u.role}
                                  onChange={(e) =>
                                    handleUpdateUser(u.id, {
                                      role: e.target.value as Role,
                                    })
                                  }
                                  className="min-h-[36px] rounded-md border border-[rgba(15,23,42,0.16)] bg-white px-2.5 py-1 text-xs"
                                >
                                  <option value="candidate">Candidate</option>
                                  <option value="examiner">Examiner</option>
                                  <option value="admin">Administrator</option>
                                </select>
                              </td>
                              <td className="py-2.5 pr-3">
                                <span
                                  className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${
                                    u.active
                                      ? "bg-[#F0FDFA] text-[#0F766E]"
                                      : "bg-[#FEF2F2] text-[#B91C1C]"
                                  }`}
                                >
                                  {u.active ? "Active" : "Disabled"}
                                </span>
                              </td>
                              <td className="py-2.5">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(u)}
                                    className="inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-md border border-[rgba(15,23,42,0.14)] px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[#EEF2F6]"
                                  >
                                    <Pencil
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateUser(u.id, {
                                        active: !u.active,
                                      })
                                    }
                                    className="min-h-[36px] cursor-pointer rounded-md border border-[rgba(15,23,42,0.14)] px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[#EEF2F6]"
                                  >
                                    {u.active ? "Disable" : "Enable"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}

              {(section === "all" || section === "audit") && (
                <section className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6">
                  <h2 className="text-base font-semibold text-[#0F172A]">
                    Recent audit events
                  </h2>
                  {auditLogs.length === 0 ? (
                    <p className="mt-3 text-sm text-[#64748B]">
                      No audit events recorded yet.
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-[rgba(15,23,42,0.08)] text-xs">
                      {auditLogs.slice(0, 20).map((log) => (
                        <li
                          key={log.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-[#EFF6FF] px-2 py-0.5 font-mono font-medium text-[#1D4ED8]">
                              {log.action}
                            </span>
                            <span className="font-medium text-[#0F172A]">
                              {log.target}
                            </span>
                            <span className="text-[#64748B]">
                              by {log.actorEmail}
                            </span>
                          </div>
                          <span className="font-mono tabular-nums text-[#64748B]">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {editingUser && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-user-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-4"
          >
            <div className="w-full max-w-md rounded-2xl border border-[rgba(15,23,42,0.14)] bg-white p-6">
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="edit-user-title"
                  className="text-base font-semibold text-[#0F172A]"
                >
                  Edit account: {editingUser.email}
                </h2>
                <button
                  type="button"
                  aria-label="Close modal"
                  onClick={() => setEditingUser(null)}
                  className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#EEF2F6]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <form onSubmit={handleSaveEditModal} className="mt-4 space-y-3">
                <div>
                  <label
                    htmlFor="edit-u-name"
                    className="block text-xs font-medium text-[#0F172A]"
                  >
                    Full name
                  </label>
                  <input
                    id="edit-u-name"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-u-role"
                    className="block text-xs font-medium text-[#0F172A]"
                  >
                    Role
                  </label>
                  <select
                    id="edit-u-role"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as Role)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] bg-white px-3 py-2 text-sm"
                  >
                    <option value="candidate">Candidate</option>
                    <option value="examiner">Examiner</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="edit-u-pwd"
                    className="block text-xs font-medium text-[#0F172A]"
                  >
                    Reset password (leave blank to keep current)
                  </label>
                  <input
                    id="edit-u-pwd"
                    type="password"
                    minLength={6}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="min-h-[40px] cursor-pointer rounded-lg border border-[rgba(15,23,42,0.14)] px-4 py-2 text-sm font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="min-h-[40px] cursor-pointer rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
                  >
                    Save changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
