import { useState, useEffect } from "react";
import api from "../api/api";

export default function UsersPage() {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm]           = useState({ full_name: "", username: "", password: "", role: "cashier" });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError]     = useState(null);
  const [formSuccess, setFormSuccess] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/auth/users");
      setUsers(res.data);
    } catch {
      setError("Could not load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async () => {
    if (!form.full_name || !form.username || !form.password) {
      setFormError("All fields are required.");
      return;
    }
    if (form.password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    setFormLoading(true);
    setFormError(null);
    try {
      await api.post("/auth/register", form);
      setFormSuccess(`User "${form.username}" created successfully.`);
      setForm({ full_name: "", username: "", password: "", role: "cashier" });
      fetchUsers();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Failed to create user.");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeactivate = async (userId, username) => {
    if (!window.confirm(`Deactivate "${username}"?`)) return;
    try {
      await api.patch(`/auth/users/${userId}/deactivate`);
      fetchUsers();
    } catch {
      alert("Failed to deactivate user.");
    }
  };

  const handleActivate = async (userId, username) => {
    if (!window.confirm(`Reactivate "${username}"?`)) return;
    try {
      await api.patch(`/auth/users/${userId}/activate`);
      fetchUsers();
    } catch {
      alert("Failed to activate user.");
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setForm({ full_name: "", username: "", password: "", role: "cashier" });
    setFormError(null);
    setFormSuccess(null);
  };

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => setShowForm(true)} style={primaryBtn}>+ New user</button>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {loading ? (
        <div style={emptyTd}>Loading users...</div>
      ) : (
        <div style={tableWrap}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                {["Name", "Username", "Role", "Status", ""].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 }}>No users found.</td></tr>
              ) : users.map((user) => (
                <tr key={user.user_id} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                  <td style={td}>{user.full_name}</td>
                  <td style={{ ...td, color: "var(--color-text-secondary)" }}>{user.username}</td>
                  <td style={td}><span style={roleBadge(user.role)}>{user.role}</span></td>
                  <td style={td}>
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 10,
                      background: user.is_active ? "#EAF3DE" : "#FCEBEB",
                      color: user.is_active ? "#3B6D11" : "#A32D2D",
                    }}>
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {user.is_active ? (
                      <button onClick={() => handleDeactivate(user.user_id, user.username)} style={dangerBtn}>
                        Deactivate
                      </button>
                    ) : (
                      <button onClick={() => handleActivate(user.user_id, user.username)} style={activateBtn}>
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New user modal */}
      {showForm && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={modalTitle}>New user</h2>
              <button onClick={closeForm} style={closeBtn}>×</button>
            </div>

            {formSuccess ? (
              <>
                <div style={{ background: "#EAF3DE", color: "#3B6D11", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
                  {formSuccess}
                </div>
                <button onClick={closeForm} style={{ ...actionBtn, background: "#185FA5", color: "#E6F1FB", cursor: "pointer" }}>Done</button>
              </>
            ) : (
              <>
                <Field label="Full name">
                  <input style={inputStyle} value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. John Doe" />
                </Field>
                <Field label="Username">
                  <input style={inputStyle} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="e.g. johndoe" />
                </Field>
                <Field label="Password">
                  <input type="password" style={inputStyle} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min. 6 characters" />
                </Field>
                <Field label="Role">
                  <select style={inputStyle} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                    <option value="cashier">Cashier</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </Field>

                {formError && <div style={{ ...errorBox, marginTop: 4, marginBottom: 10 }}>{formError}</div>}

                <button
                  onClick={handleCreate}
                  disabled={formLoading}
                  style={{ ...actionBtn, background: formLoading ? "var(--color-background-secondary)" : "#185FA5", color: formLoading ? "var(--color-text-tertiary)" : "#E6F1FB", cursor: formLoading ? "not-allowed" : "pointer", marginTop: 16 }}
                >
                  {formLoading ? "Creating..." : "Create user"}
                </button>
                <button onClick={closeForm} style={{ ...actionBtn, background: "none", border: "1px solid var(--color-border-secondary)", color: "var(--color-text-secondary)", marginTop: 8, cursor: "pointer" }}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

const th          = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" };
const td          = { padding: "11px 14px", fontSize: 13, color: "var(--color-text-primary)" };
const emptyTd     = { textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 };
const errorBox    = { background: "#FCEBEB", color: "#A32D2D", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 14 };
const tableWrap   = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" };
const primaryBtn  = { padding: "8px 16px", borderRadius: 8, border: "none", background: "#185FA5", color: "#E6F1FB", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const dangerBtn   = { padding: "5px 12px", borderRadius: 7, border: "1px solid #A32D2D", background: "none", color: "#A32D2D", fontSize: 12, cursor: "pointer" };
const activateBtn = { padding: "5px 12px", borderRadius: 7, border: "1px solid #3B6D11", background: "none", color: "#3B6D11", fontSize: 12, cursor: "pointer" };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modalStyle  = { background: "var(--color-background-primary)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", border: "1px solid var(--color-border-secondary)" };
const modalTitle  = { fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 };
const closeBtn    = { background: "none", border: "none", fontSize: 22, color: "var(--color-text-secondary)", cursor: "pointer", padding: 0, lineHeight: 1 };
const inputStyle  = { width: "100%", padding: "8px 11px", borderRadius: 8, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none", boxSizing: "border-box" };
const actionBtn   = { width: "100%", padding: "11px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 500 };
const roleBadge   = (role) => ({ fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 10, textTransform: "capitalize", background: role === "admin" ? "#EEEDFE" : role === "manager" ? "#E1F5EE" : "#F1EFE8", color: role === "admin" ? "#3C3489" : role === "manager" ? "#0F6E56" : "#5F5E5A" });