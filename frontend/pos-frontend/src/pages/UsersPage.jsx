import { useState, useEffect } from "react";
import api from "../api/api";
import { getPlanInfo } from "../api/api";

// ── Plan upgrade details ───────────────────────────────────────────────────────
const UPGRADE_INFO = {
  solo: {
    current:     { label: "Solo", price: "₦5,000/mo" },
    next:        { label: "Starter", price: "₦10,000/mo" },
    benefits: [
      "Up to 3 staff accounts",
      "PDF invoices per sale",
      "WhatsApp daily report",
      "Expiry batch tracking",
    ],
  },
  starter: {
    current:     { label: "Starter", price: "₦10,000/mo" },
    next:        { label: "Business", price: "₦18,000/mo" },
    benefits: [
      "Unlimited staff accounts",
      "Up to 3 branch locations",
      "Full audit log history",
      "Branch-level reporting",
      "Priority support",
    ],
  },
  business: {
    current:     { label: "Business", price: "₦18,000/mo" },
    next:        { label: "Enterprise", price: "₦35,000/mo" },
    benefits: [
      "Unlimited branches",
      "Dedicated onboarding",
      "Custom shop branding",
      "24/7 priority support",
    ],
  },
  enterprise: null,  // already on highest plan
};

const WHATSAPP_NUMBER = "2348154586355";  // international format, no +

const buildWhatsAppLink = (currentPlan, businessName) => {
  const next = UPGRADE_INFO[currentPlan]?.next?.label || "a higher plan";
  const msg  = encodeURIComponent(
    `Hi, I'd like to upgrade my ProfitTrack POS plan from ${UPGRADE_INFO[currentPlan]?.current?.label || currentPlan} to ${next}.\n\nBusiness: ${businessName || "my business"}`
  );
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
};

export default function UsersPage() {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [showForm, setShowForm] = useState(false);

  const [planInfo, setPlanInfo]       = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);  // upgrade modal

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  const [form, setForm]               = useState({ full_name: "", username: "", password: "", role: "cashier" });
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

  const fetchPlanInfo = async () => {
    try {
      const info = await getPlanInfo();
      setPlanInfo(info);
    } catch {
      // non-critical
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchPlanInfo();
  }, []);

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
      await api.post("/auth/register", {
        ...form,
        branch_id:   currentUser.branch_id   ?? null,
        business_id: currentUser.business_id ?? null,
      });
      setFormSuccess(`User "${form.username}" created successfully.`);
      setForm({ full_name: "", username: "", password: "", role: "cashier" });
      fetchUsers();
      fetchPlanInfo();
    } catch (err) {
      const detail = err.response?.data?.detail || "Failed to create user.";
      // If the backend returns a limit error, show upgrade modal instead
      if (err.response?.status === 403 && detail.toLowerCase().includes("limit")) {
        setShowForm(false);
        setShowUpgrade(true);
      } else {
        setFormError(detail);
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeactivate = async (userId, username) => {
    if (!window.confirm(`Deactivate "${username}"?`)) return;
    try {
      await api.patch(`/auth/users/${userId}/deactivate`);
      fetchUsers();
      fetchPlanInfo();
    } catch {
      alert("Failed to deactivate user.");
    }
  };

  const handleActivate = async (userId, username) => {
    if (!window.confirm(`Reactivate "${username}"?`)) return;
    try {
      await api.patch(`/auth/users/${userId}/activate`);
      fetchUsers();
      fetchPlanInfo();
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

  const atLimit   = planInfo?.at_limit ?? false;
  const planLabel = planInfo?.plan
    ? planInfo.plan.charAt(0).toUpperCase() + planInfo.plan.slice(1)
    : null;
  const maxUsers  = planInfo?.max_users  ?? null;
  const usedUsers = planInfo?.used_users ?? null;
  const upgradeInfo = planInfo ? UPGRADE_INFO[planInfo.plan] : null;

  // Business name from localStorage for WhatsApp message
  const businessName = currentUser.business_name || "";

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginBottom: 16 }}>

        {/* Plan usage pill */}
        {planInfo && maxUsers !== -1 && (
          <span style={{
            fontSize: 12, padding: "4px 10px", borderRadius: 20, fontWeight: 500,
            background: atLimit ? "#FCEBEB" : "#EAF3DE",
            color:      atLimit ? "#A32D2D" : "#3B6D11",
          }}>
            {planLabel} plan · {usedUsers}/{maxUsers} staff used
          </span>
        )}

        {/* Unlimited plan pill */}
        {planInfo && maxUsers === -1 && (
          <span style={{
            fontSize: 12, padding: "4px 10px", borderRadius: 20, fontWeight: 500,
            background: "#EAF3DE", color: "#3B6D11",
          }}>
            {planLabel} plan · Unlimited staff
          </span>
        )}

        {/* Button or limit message */}
        {atLimit ? (
          <button onClick={() => setShowUpgrade(true)} style={upgradeBtn}>
            ⚡ Upgrade to add more staff
          </button>
        ) : (
          <button onClick={() => setShowForm(true)} style={primaryBtn}>+ New user</button>
        )}

      </div>

      {error && <div style={errorBox}>{error}</div>}

      {loading ? (
        <div style={emptyMsg}>Loading users...</div>
      ) : (
        <div style={tableWrap}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                {["Name", "Username", "Role", "Status", ""].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 }}>
                    No users found.
                  </td>
                </tr>
              ) : users.map(user => (
                <tr key={user.user_id} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                  <td style={tdStyle}>{user.full_name}</td>
                  <td style={{ ...tdStyle, color: "var(--color-text-secondary)" }}>{user.username}</td>
                  <td style={tdStyle}>
                    <span style={roleBadge(user.role)}>{user.role}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 10,
                      background: user.is_active ? "#EAF3DE" : "#FCEBEB",
                      color:      user.is_active ? "#3B6D11" : "#A32D2D",
                    }}>
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
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

      {/* ── Upgrade modal ── */}
      {showUpgrade && upgradeInfo && (
        <div style={overlayStyle}>
          <div style={upgradeModal}>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#854F0B", background: "#FAEEDA", padding: "3px 10px", borderRadius: 20, display: "inline-block", marginBottom: 8 }}>
                  STAFF LIMIT REACHED
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#e8ecf2" }}>
                  Upgrade to {upgradeInfo.next.label}
                </h2>
                <p style={{ fontSize: 13, color: "#8a93a6", margin: "6px 0 0" }}>
                  You've used all {maxUsers} staff slot{maxUsers !== 1 ? "s" : ""} on your {upgradeInfo.current.label} plan.
                </p>
              </div>
              <button onClick={() => setShowUpgrade(false)} style={closeBtn}>×</button>
            </div>

            {/* Current vs next plan */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              <div style={{
                background: "#1a2133", border: "1px solid #2a3247",
                borderRadius: 10, padding: "12px 14px",
              }}>
                <div style={{ fontSize: 10, color: "#5a6475", fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>Current</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#e8ecf2" }}>{upgradeInfo.current.label}</div>
                <div style={{ fontSize: 12, color: "#8a93a6", marginTop: 2 }}>{upgradeInfo.current.price}</div>
                <div style={{ fontSize: 11, color: "#5a6475", marginTop: 6 }}>
                  {maxUsers} staff · 1 branch
                </div>
              </div>
              <div style={{
                background: "linear-gradient(135deg, #0f2744, #1a3a5c)",
                border: "1px solid #185FA5",
                borderRadius: 10, padding: "12px 14px",
                position: "relative", overflow: "hidden",
              }}>
                <div style={{ fontSize: 10, color: "#5BA8F5", fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>Upgrade to</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#e8ecf2" }}>{upgradeInfo.next.label}</div>
                <div style={{ fontSize: 12, color: "#8a93a6", marginTop: 2 }}>{upgradeInfo.next.price}</div>
                <div style={{ fontSize: 10, color: "#5BA8F5", marginTop: 6, fontWeight: 500 }}>
                  Annual plan saves 2 months
                </div>
              </div>
            </div>

            {/* Benefits */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#c0c7d4", marginBottom: 10 }}>
                What you get with {upgradeInfo.next.label}:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {upgradeInfo.benefits.map((b, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: "#3B6D11", background: "#EAF3DE",
                      borderRadius: "50%", width: 18, height: 18,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>✓</span>
                    <span style={{ fontSize: 13, color: "#c0c7d4" }}>{b}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Guarantee */}
            <div style={{
              background: "#1a2133", border: "1px solid #2a3247",
              borderRadius: 8, padding: "10px 14px", marginBottom: 20,
              fontSize: 12, color: "#8a93a6", lineHeight: 1.6,
            }}>
              🛡️ <strong style={{ color: "#c0c7d4" }}>7-day satisfaction guarantee.</strong> If you don't feel more in control within 7 days, we refund your setup fee. No questions.
            </div>

            {/* CTA buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <a
                href={buildWhatsAppLink(planInfo?.plan, businessName)}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "block", width: "100%", padding: "12px 0",
                  borderRadius: 10, border: "none",
                  background: "#25D366", color: "#fff",
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                  textDecoration: "none", textAlign: "center",
                  boxSizing: "border-box",
                }}
              >
                💬 Contact us on WhatsApp to upgrade
              </a>
              <a
                href="tel:08154586355"
                style={{
                  display: "block", width: "100%", padding: "10px 0",
                  borderRadius: 10, border: "1px solid #3a4255",
                  background: "none", color: "#c0c7d4",
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                  textDecoration: "none", textAlign: "center",
                  boxSizing: "border-box",
                }}
              >
                📞 Call us: 08154586355
              </a>
              <button
                onClick={() => setShowUpgrade(false)}
                style={{
                  width: "100%", padding: "9px 0", borderRadius: 10,
                  border: "none", background: "none",
                  color: "#5a6475", fontSize: 12, cursor: "pointer",
                }}
              >
                Maybe later
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── New user modal ── */}
      {showForm && (
        <div style={overlayStyle}>
          <div style={modalStyle}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={modalTitle}>New user</h2>
              <button onClick={closeForm} style={closeBtn}>×</button>
            </div>

            <div style={{
              background: "#1e2535", border: "1px solid #2a3247",
              borderRadius: 8, padding: "9px 12px",
              fontSize: 12, color: "#8a93a6", marginBottom: 18,
            }}>
              User will be assigned to{" "}
              <strong style={{ color: "#e8ecf2" }}>Branch {currentUser.branch_id}</strong>{" "}
              automatically
            </div>

            {formSuccess ? (
              <>
                <div style={successBox}>{formSuccess}</div>
                <button
                  onClick={closeForm}
                  style={{ ...actionBtn, background: "#185FA5", color: "#fff", cursor: "pointer", marginTop: 14 }}
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                  <Field label="Full name">
                    <input
                      style={inputStyle}
                      value={form.full_name}
                      onChange={e => setForm({ ...form, full_name: e.target.value })}
                      placeholder="e.g. John Doe"
                    />
                  </Field>

                  <Field label="Username">
                    <input
                      style={inputStyle}
                      value={form.username}
                      onChange={e => setForm({ ...form, username: e.target.value })}
                      placeholder="e.g. johndoe"
                    />
                  </Field>

                  <Field label="Password">
                    <input
                      type="password"
                      style={inputStyle}
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      placeholder="Min. 6 characters"
                    />
                  </Field>

                  <Field label="Role">
                    <select
                      style={inputStyle}
                      value={form.role}
                      onChange={e => setForm({ ...form, role: e.target.value })}
                    >
                      <option value="cashier">Cashier — POS and sales only</option>
                      <option value="manager">Manager — no user management</option>
                      <option value="admin">Admin — full access</option>
                    </select>
                  </Field>

                </div>

                {formError && <div style={{ ...errorBox, marginTop: 12 }}>{formError}</div>}

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
                  <button
                    onClick={handleCreate}
                    disabled={formLoading}
                    style={{
                      ...actionBtn,
                      background: formLoading ? "#2a3247" : "#185FA5",
                      color: formLoading ? "#5a6475" : "#fff",
                      cursor: formLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {formLoading ? "Creating..." : "Create user"}
                  </button>
                  <button
                    onClick={closeForm}
                    style={{
                      ...actionBtn,
                      background: "none",
                      border: "1px solid #3a4255",
                      color: "#c0c7d4",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
}

// ── Field wrapper component ────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div>
      <label style={{
        display: "block", fontSize: 12, fontWeight: 500,
        color: "#c0c7d4", marginBottom: 5,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const inputStyle = {
  display: "block", width: "100%", padding: "9px 11px",
  borderRadius: 7, border: "1.5px solid #3a4255",
  fontSize: 13, background: "#1e2535", color: "#e8ecf2",
  boxSizing: "border-box", outline: "none", fontFamily: "inherit",
};

const primaryBtn = {
  padding: "8px 16px", borderRadius: 8, border: "none",
  background: "#185FA5", color: "#fff",
  fontSize: 13, fontWeight: 500, cursor: "pointer",
};

const upgradeBtn = {
  padding: "8px 16px", borderRadius: 8, border: "none",
  background: "#854F0B", color: "#fff",
  fontSize: 13, fontWeight: 500, cursor: "pointer",
};

const dangerBtn = {
  padding: "5px 12px", borderRadius: 7,
  border: "1px solid #A32D2D", background: "none",
  color: "#A32D2D", fontSize: 12, cursor: "pointer",
};

const activateBtn = {
  padding: "5px 12px", borderRadius: 7,
  border: "1px solid #3B6D11", background: "none",
  color: "#3B6D11", fontSize: 12, cursor: "pointer",
};

const actionBtn = {
  width: "100%", padding: "11px 0",
  borderRadius: 10, border: "none",
  fontSize: 14, fontWeight: 500,
};

const errorBox = {
  background: "#FCEBEB", color: "#A32D2D",
  borderRadius: 8, padding: "9px 13px",
  fontSize: 13, marginBottom: 4,
};

const successBox = {
  background: "#EAF3DE", color: "#3B6D11",
  borderRadius: 8, padding: "10px 14px",
  fontSize: 13, marginBottom: 14,
};

const tableWrap = {
  background: "var(--color-background-primary)",
  border: "1px solid var(--color-border-tertiary)",
  borderRadius: 12, overflow: "hidden",
};

const thStyle = {
  padding: "9px 14px", textAlign: "left",
  fontSize: 11, fontWeight: 500,
  color: "var(--color-text-secondary)",
  textTransform: "uppercase", letterSpacing: "0.05em",
};

const tdStyle = {
  padding: "11px 14px", fontSize: 13,
  color: "var(--color-text-primary)",
};

const emptyMsg = {
  textAlign: "center", padding: 32,
  color: "var(--color-text-tertiary)", fontSize: 13,
};

const overlayStyle = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.65)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 9999,
};

const upgradeModal = {
  background: "#151b28",
  borderRadius: 16,
  padding: 28,
  width: "100%",
  maxWidth: 440,
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
  border: "1px solid #2a3247",
};

const modalStyle = {
  background: "#151b28",
  borderRadius: 14, padding: 24,
  width: "100%", maxWidth: 400,
  maxHeight: "85vh", overflowY: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
  border: "1px solid #2a3247",
};

const modalTitle = {
  fontSize: 16, fontWeight: 600,
  color: "#e8ecf2", margin: 0,
};

const closeBtn = {
  background: "none", border: "none",
  fontSize: 22, color: "#8a93a6",
  cursor: "pointer", padding: 0, lineHeight: 1,
};

const roleBadge = (role) => ({
  fontSize: 11, fontWeight: 500,
  padding: "3px 9px", borderRadius: 10,
  textTransform: "capitalize",
  background: role === "admin" ? "#EEEDFE" : role === "manager" ? "#E1F5EE" : "#F1EFE8",
  color:      role === "admin" ? "#3C3489" : role === "manager" ? "#0F6E56" : "#5F5E5A",
});