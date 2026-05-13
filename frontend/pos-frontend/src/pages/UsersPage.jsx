import { useState, useEffect } from "react";
import api from "../api/api";
import { getPlanInfo, changePassword } from "../api/api";

const UPGRADE_INFO = {
  solo: {
    current:  { label: "Solo",    price: "₦5,000/mo" },
    next:     { label: "Starter", price: "₦12,000/mo" },
    benefits: ["Up to 3 staff accounts","PDF invoices per sale","Expense tracking","Loyalty & credit"],
  },
  starter: {
    current:  { label: "Starter",  price: "₦12,000/mo" },
    next:     { label: "Business", price: "₦25,000/mo" },
    benefits: ["Up to 10 staff accounts","Up to 3 branch locations","Analytics dashboard","WhatsApp daily reports"],
  },
  business: {
    current:  { label: "Business",   price: "₦25,000/mo" },
    next:     { label: "Enterprise", price: "₦50,000/mo" },
    benefits: ["Unlimited branches","Unlimited staff","White-label branding","Priority support"],
  },
  enterprise: null,
};

const WHATSAPP_NUMBER = "2348154586355";

export default function UsersPage() {
  const [users,    setUsers]    = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [showForm, setShowForm] = useState(false);

  const [planInfo,    setPlanInfo]    = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const [showChangePwd, setShowChangePwd] = useState(false);
  const [pwdForm,    setPwdForm]    = useState({ current: "", newPwd: "", confirm: "" });
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError,   setPwdError]   = useState(null);
  const [pwdSuccess, setPwdSuccess] = useState(null);

  const currentUser  = JSON.parse(localStorage.getItem("user") || "{}");
  const businessName = currentUser.business_name || "";

  // New user form — no branch pre-selected, admin must choose
  const EMPTY_FORM = { full_name: "", username: "", password: "", role: "cashier", branch_id: "" };
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError,   setFormError]   = useState(null);
  const [formSuccess, setFormSuccess] = useState(null);

  // Build branch name lookup map
  const branchMap = {};
  branches.forEach(b => { branchMap[b.branch_id] = b.branch_name || b.name || `Branch ${b.branch_id}`; });

  const fetchUsers = async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get("/auth/users");
      setUsers(res.data);
    } catch { setError("Could not load users."); }
    finally { setLoading(false); }
  };

  const fetchBranches = async () => {
    try {
      const res = await api.get(`/businesses/${currentUser.business_id}/branches`);
      setBranches(Array.isArray(res.data) ? res.data : []);
    } catch {
      // Try my/branches fallback
      try {
        const res2 = await api.get("/businesses/my/branches");
        setBranches(Array.isArray(res2.data) ? res2.data : []);
      } catch { setBranches([]); }
    }
  };

  const fetchPlanInfo = async () => {
    try { setPlanInfo(await getPlanInfo()); } catch {}
  };

  useEffect(() => { fetchUsers(); fetchBranches(); fetchPlanInfo(); }, []);

  const handleCreate = async () => {
    if (!form.full_name || !form.username || !form.password) {
      setFormError("Full name, username, and password are required."); return;
    }
    if (form.password.length < 6) {
      setFormError("Password must be at least 6 characters."); return;
    }
    if (!form.branch_id) {
      setFormError("Please select a branch for this user."); return;
    }
    setFormLoading(true); setFormError(null);
    try {
      await api.post("/auth/register", {
        ...form,
        branch_id:   parseInt(form.branch_id),
        business_id: currentUser.business_id ?? null,
      });
      setFormSuccess(`User "${form.username}" created successfully.`);
      setForm(EMPTY_FORM);
      fetchUsers(); fetchPlanInfo();
    } catch (err) {
      const detail = err.response?.data?.detail || "Failed to create user.";
      if (err.response?.status === 403 && detail.toLowerCase().includes("limit")) {
        setShowForm(false); setShowUpgrade(true);
      } else { setFormError(detail); }
    } finally { setFormLoading(false); }
  };

  const handleDeactivate = async (userId, username) => {
    if (!window.confirm(`Deactivate "${username}"?`)) return;
    try { await api.patch(`/auth/users/${userId}/deactivate`); fetchUsers(); fetchPlanInfo(); }
    catch { alert("Failed to deactivate user."); }
  };

  const handleActivate = async (userId, username) => {
    if (!window.confirm(`Reactivate "${username}"?`)) return;
    try { await api.patch(`/auth/users/${userId}/activate`); fetchUsers(); fetchPlanInfo(); }
    catch { alert("Failed to activate user."); }
  };

  const closeForm = () => {
    setShowForm(false); setForm(EMPTY_FORM);
    setFormError(null); setFormSuccess(null);
  };

  const openChangePwd = () => {
    setPwdForm({ current: "", newPwd: "", confirm: "" });
    setPwdError(null); setPwdSuccess(null); setShowChangePwd(true);
  };

  const handleChangePwd = async () => {
    if (!pwdForm.current || !pwdForm.newPwd || !pwdForm.confirm) { setPwdError("All fields are required."); return; }
    if (pwdForm.newPwd.length < 6) { setPwdError("New password must be at least 6 characters."); return; }
    if (pwdForm.newPwd !== pwdForm.confirm) { setPwdError("New passwords do not match."); return; }
    setPwdLoading(true); setPwdError(null);
    try {
      await changePassword(pwdForm.current, pwdForm.newPwd);
      setPwdSuccess("Password changed successfully.");
      setPwdForm({ current: "", newPwd: "", confirm: "" });
    } catch (err) { setPwdError(err.response?.data?.detail || "Failed to change password."); }
    finally { setPwdLoading(false); }
  };

  const atLimit     = planInfo?.at_limit ?? false;
  const planLabel   = planInfo?.plan ? planInfo.plan.charAt(0).toUpperCase() + planInfo.plan.slice(1) : null;
  const maxUsers    = planInfo?.max_users  ?? null;
  const usedUsers   = planInfo?.used_users ?? null;
  const upgradeInfo = planInfo ? UPGRADE_INFO[planInfo.plan] : null;

  const buildWhatsAppLink = () => {
    const next = upgradeInfo?.next?.label || "a higher plan";
    const msg  = encodeURIComponent(
      `Hi, I'd like to upgrade my ProfitTrack POS plan to ${next}.\n\nBusiness: ${businessName || "my business"}`
    );
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
  };

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginBottom: 16 }}>
        {planInfo && maxUsers !== -1 && (
          <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, fontWeight: 500, background: atLimit ? "#FCEBEB" : "#EAF3DE", color: atLimit ? "#A32D2D" : "#3B6D11" }}>
            {planLabel} plan · {usedUsers}/{maxUsers} staff
          </span>
        )}
        {planInfo && maxUsers === -1 && (
          <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, fontWeight: 500, background: "#EAF3DE", color: "#3B6D11" }}>
            {planLabel} plan · Unlimited staff
          </span>
        )}
        <button onClick={openChangePwd} style={outlineBtn}>🔒 Change password</button>
        {atLimit
          ? <button onClick={() => setShowUpgrade(true)} style={upgradeBtn}>⚡ Upgrade to add more staff</button>
          : <button onClick={() => setShowForm(true)} style={primaryBtn}>+ New user</button>
        }
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {loading ? <div style={emptyMsg}>Loading users...</div> : (
        <div style={tableWrap}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                {["Name", "Username", "Role", "Branch", "Status", ""].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 }}>No users found.</td></tr>
              ) : users.map(user => (
                <tr key={user.user_id} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                  <td style={tdStyle}>{user.full_name}</td>
                  <td style={{ ...tdStyle, color: "var(--color-text-secondary)" }}>{user.username}</td>
                  <td style={tdStyle}><span style={roleBadge(user.role)}>{user.role}</span></td>
                  <td style={{ ...tdStyle, fontSize: 12, color: "var(--color-text-secondary)" }}>
                    {user.branch_id ? (branchMap[user.branch_id] || `Branch ${user.branch_id}`) : "—"}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 10, background: user.is_active ? "#EAF3DE" : "#FCEBEB", color: user.is_active ? "#3B6D11" : "#A32D2D" }}>
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {user.is_active
                      ? <button onClick={() => handleDeactivate(user.user_id, user.username)} style={dangerBtn}>Deactivate</button>
                      : <button onClick={() => handleActivate(user.user_id, user.username)} style={activateBtn}>Reactivate</button>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Change password modal */}
      {showChangePwd && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={modalTitle}>Change password</h2>
              <button onClick={() => setShowChangePwd(false)} style={closeBtn}>×</button>
            </div>
            <div style={{ background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 18 }}>
              Changing password for <strong style={{ color: "var(--color-text-primary)" }}>@{currentUser.username}</strong>
            </div>
            {pwdSuccess ? (
              <>
                <div style={successBox}>{pwdSuccess}</div>
                <button onClick={() => setShowChangePwd(false)} style={{ ...actionBtn, background: "var(--color-primary)", color: "#fff", cursor: "pointer", marginTop: 14 }}>Done</button>
              </>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Field label="Current password"><input type="password" style={inputStyle} value={pwdForm.current} onChange={e => setPwdForm({ ...pwdForm, current: e.target.value })} placeholder="Enter current password" /></Field>
                  <Field label="New password"><input type="password" style={inputStyle} value={pwdForm.newPwd} onChange={e => setPwdForm({ ...pwdForm, newPwd: e.target.value })} placeholder="Min. 6 characters" /></Field>
                  <Field label="Confirm new password"><input type="password" style={inputStyle} value={pwdForm.confirm} onChange={e => setPwdForm({ ...pwdForm, confirm: e.target.value })} placeholder="Repeat new password" /></Field>
                </div>
                {pwdError && <div style={{ ...errorBox, marginTop: 12 }}>{pwdError}</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
                  <button onClick={handleChangePwd} disabled={pwdLoading} style={{ ...actionBtn, background: pwdLoading ? "var(--color-background-secondary)" : "var(--color-primary)", color: pwdLoading ? "var(--color-text-tertiary)" : "#fff", cursor: pwdLoading ? "not-allowed" : "pointer" }}>
                    {pwdLoading ? "Changing..." : "Change password"}
                  </button>
                  <button onClick={() => setShowChangePwd(false)} style={{ ...actionBtn, background: "none", border: "1px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)", cursor: "pointer" }}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Upgrade modal */}
      {showUpgrade && upgradeInfo && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 440 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#854F0B", background: "#FAEEDA", padding: "3px 10px", borderRadius: 20, display: "inline-block", marginBottom: 8 }}>STAFF LIMIT REACHED</div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--color-text-primary)" }}>Upgrade to {upgradeInfo.next.label}</h2>
                <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "6px 0 0" }}>You've used all {maxUsers} staff slot{maxUsers !== 1 ? "s" : ""} on your {upgradeInfo.current.label} plan.</p>
              </div>
              <button onClick={() => setShowUpgrade(false)} style={closeBtn}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {upgradeInfo.benefits.map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#3B6D11", background: "#EAF3DE", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{b}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <a href={buildWhatsAppLink()} target="_blank" rel="noreferrer"
                style={{ display: "block", width: "100%", padding: "12px 0", borderRadius: 10, background: "#25D366", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none", textAlign: "center", boxSizing: "border-box" }}>
                💬 Upgrade via WhatsApp
              </a>
              <button onClick={() => setShowUpgrade(false)} style={{ width: "100%", padding: "9px 0", borderRadius: 10, border: "none", background: "none", color: "var(--color-text-tertiary)", fontSize: 12, cursor: "pointer" }}>Maybe later</button>
            </div>
          </div>
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
                <div style={successBox}>{formSuccess}</div>
                <button onClick={closeForm} style={{ ...actionBtn, background: "var(--color-primary)", color: "#fff", cursor: "pointer", marginTop: 14 }}>Done</button>
              </>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Field label="Full name *"><input style={inputStyle} value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Amina Yusuf" /></Field>
                  <Field label="Username *"><input style={inputStyle} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="e.g. amina_cashier" /></Field>
                  <Field label="Password *"><input type="password" style={inputStyle} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min. 6 characters" /></Field>
                  <Field label="Role">
                    <select style={inputStyle} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                      <option value="cashier">Cashier — POS and sales only</option>
                      <option value="manager">Manager — no user management</option>
                      <option value="admin">Admin — full access</option>
                    </select>
                  </Field>
                  <Field label="Branch *">
                    <select style={inputStyle} value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}>
                      <option value="">— Select branch —</option>
                      {branches.map(b => (
                        <option key={b.branch_id} value={b.branch_id}>
                          {b.branch_name || b.name || `Branch ${b.branch_id}`}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4, display: "block" }}>
                      The branch this user will work from. Add branches in Branding & Settings.
                    </span>
                  </Field>
                </div>
                {formError && <div style={{ ...errorBox, marginTop: 12 }}>{formError}</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
                  <button onClick={handleCreate} disabled={formLoading} style={{ ...actionBtn, background: formLoading ? "var(--color-background-secondary)" : "var(--color-primary)", color: formLoading ? "var(--color-text-tertiary)" : "#fff", cursor: formLoading ? "not-allowed" : "pointer" }}>
                    {formLoading ? "Creating..." : "Create user"}
                  </button>
                  <button onClick={closeForm} style={{ ...actionBtn, background: "none", border: "1px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)", cursor: "pointer" }}>Cancel</button>
                </div>
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
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle   = { display: "block", width: "100%", padding: "9px 11px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", fontSize: 13, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box", outline: "none", fontFamily: "inherit" };
const primaryBtn   = { padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const outlineBtn   = { padding: "8px 14px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", background: "none", fontSize: 12, fontWeight: 500, cursor: "pointer", color: "var(--color-text-secondary)" };
const upgradeBtn   = { padding: "8px 16px", borderRadius: 8, border: "none", background: "#854F0B", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const dangerBtn    = { padding: "5px 12px", borderRadius: 7, border: "1px solid #A32D2D", background: "none", color: "#A32D2D", fontSize: 12, cursor: "pointer" };
const activateBtn  = { padding: "5px 12px", borderRadius: 7, border: "1px solid #3B6D11", background: "none", color: "#3B6D11", fontSize: 12, cursor: "pointer" };
const actionBtn    = { width: "100%", padding: "11px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 500 };
const errorBox     = { background: "var(--error-bg)", color: "var(--error-text)", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 4 };
const successBox   = { background: "var(--success-bg)", color: "var(--success-text)", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 };
const tableWrap    = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" };
const thStyle      = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" };
const tdStyle      = { padding: "11px 14px", fontSize: 13, color: "var(--color-text-primary)" };
const emptyMsg     = { textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 };
const modalStyle   = { background: "var(--color-background-primary)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto", boxShadow: "var(--shadow)", border: "1px solid var(--color-border-tertiary)" };
const modalTitle   = { fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 };
const closeBtn     = { background: "none", border: "none", fontSize: 22, color: "var(--color-text-tertiary)", cursor: "pointer", padding: 0, lineHeight: 1 };
const roleBadge    = (role) => ({ fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 10, textTransform: "capitalize", background: role === "admin" ? "#EEEDFE" : role === "manager" ? "#E1F5EE" : "#F1EFE8", color: role === "admin" ? "#3C3489" : role === "manager" ? "#0F6E56" : "#5F5E5A" });