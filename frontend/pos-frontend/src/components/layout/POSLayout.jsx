import { useState } from "react";
import BarcodeScannerIndicator from "../scanner/BarcodeScannerIndicator";
import { useBranch } from "../../context/BranchContext";
import { useFeature } from "../../context/FeatureContext";
import { changePassword } from "../../api/api";

const SHOP_NAME = import.meta.env.VITE_SHOP_NAME || "POS System";

// flag: which feature flag gates this nav item (null = always visible)
const NAV_ITEMS = [
  { key: "pos",        label: "POS",             icon: "🛒", roles: ["admin", "manager", "cashier", "superadmin"], flag: null },
  { key: "dashboard",  label: "Dashboard",       icon: "📊", roles: ["admin", "manager", "superadmin"],            flag: null },
  { key: "sales",      label: "Sales history",   icon: "🧾", roles: ["admin", "manager", "cashier", "superadmin"], flag: null },
  { key: "products",   label: "Products",        icon: "📦", roles: ["admin", "manager", "superadmin"],            flag: null },
  { key: "inventory",  label: "Inventory",       icon: "🏭", roles: ["admin", "manager", "superadmin"],            flag: "inventory" },
  { key: "reports",    label: "Reports",         icon: "📈", roles: ["admin", "manager", "superadmin"],            flag: "reports" },
  { key: "users",      label: "Users",           icon: "👥", roles: ["admin", "superadmin"],                       flag: null },
  { key: "import",     label: "Import products", icon: "⬆️", roles: ["admin", "manager", "superadmin"],            flag: "bulk_import" },
  { key: "businesses", label: "Businesses",      icon: "🏢", roles: ["superadmin"],                                flag: null },
];

const PAGE_TITLES = {
  pos: "Point of sale", dashboard: "Dashboard", sales: "Sales history",
  products: "Products", inventory: "Inventory", reports: "Reports",
  users: "Users", import: "Import products", businesses: "Businesses",
};

export default function POSLayout({ children, activePage, onNavigate, onLogout, lastScan }) {
  const [collapsed, setCollapsed] = useState(false);
  const { activeBranchId, setActiveBranchId, branches } = useBranch();
  const { isEnabled } = useFeature();

  const user  = JSON.parse(localStorage.getItem("user") || "{}");
  const role  = user.role || "cashier";
  const sideW = collapsed ? 56 : 210;

  const visible = NAV_ITEMS.filter(item => {
    if (!item.roles.includes(role)) return false;
    if (item.flag && !isEnabled(item.flag)) return false;
    return true;
  });

  const canSwitchBranch = ["admin", "superadmin"].includes(role)
    && branches.length > 1
    && isEnabled("multi_branch");

  const [showSignOut, setShowSignOut]   = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [pwdForm, setPwdForm]           = useState({ current: "", newPwd: "", confirm: "" });
  const [pwdLoading, setPwdLoading]     = useState(false);
  const [pwdError, setPwdError]         = useState(null);
  const [pwdSuccess, setPwdSuccess]     = useState(null);

  const openChangePwd = () => {
    setPwdForm({ current: "", newPwd: "", confirm: "" });
    setPwdError(null); setPwdSuccess(null);
    setShowChangePwd(true);
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
    } catch (err) {
      setPwdError(err.response?.data?.detail || "Failed to change password.");
    } finally { setPwdLoading(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", overflow: "hidden", background: "var(--color-background-tertiary)" }}>

      {/* Sidebar */}
      <div style={{ width: sideW, minWidth: sideW, maxWidth: sideW, height: "100%", background: "var(--color-background-primary)", borderRight: "1px solid var(--color-border-tertiary)", display: "flex", flexDirection: "column", transition: "width 0.18s ease", overflow: "hidden", flexShrink: 0 }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", padding: collapsed ? "0" : "0 12px", borderBottom: "1px solid var(--color-border-tertiary)", height: 52 }}>
          {!collapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🏪</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{SHOP_NAME}</span>
            </div>
          )}
          <button onClick={() => setCollapsed(c => !c)} style={iconBtn}>{collapsed ? "▶" : "◀"}</button>
        </div>

        <nav style={{ flex: 1, padding: "8px 6px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {visible.map(item => {
            const active = activePage === item.key;
            return (
              <button key={item.key} onClick={() => onNavigate(item.key)} style={{ display: "flex", alignItems: "center", gap: 9, padding: collapsed ? "10px 0" : "10px 12px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 8, border: "none", background: active ? "var(--color-primary-light)" : "transparent", color: active ? "var(--color-primary)" : "var(--color-text-secondary)", fontWeight: active ? 500 : 400, fontSize: 13, cursor: "pointer", width: "100%", transition: "all 0.15s" }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "var(--color-background-secondary)"; e.currentTarget.style.color = "var(--color-text-primary)"; }}}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}}
              >
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div style={{ borderTop: "1px solid var(--color-border-tertiary)", padding: collapsed ? "10px 0" : "10px 12px" }}>
          {!collapsed && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{user.username}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textTransform: "capitalize" }}>{role}</div>
            </div>
          )}
          <button onClick={openChangePwd} style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 6, background: "none", border: "none", color: "var(--color-text-secondary)", fontSize: 12, cursor: "pointer", padding: "4px 0", width: "100%", marginBottom: 2 }}>
            <span style={{ fontSize: 14 }}>🔒</span>
            {!collapsed && <span>Change password</span>}
          </button>
          <button onClick={() => setShowSignOut(true)} style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 6, background: "none", border: "none", color: "var(--color-danger)", fontSize: 12, cursor: "pointer", padding: "4px 0", width: "100%" }}>
            <span style={{ fontSize: 14 }}>🚪</span>
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", background: "var(--color-background-primary)", borderBottom: "1px solid var(--color-border-tertiary)", gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", flexShrink: 0 }}>{PAGE_TITLES[activePage] || ""}</span>

          {canSwitchBranch && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", flexShrink: 0 }}>{role === "superadmin" ? "Viewing:" : "Branch:"}</span>
              <select value={activeBranchId ?? ""} onChange={e => setActiveBranchId(e.target.value ? parseInt(e.target.value) : null)} style={{ padding: "4px 8px", borderRadius: 6, fontSize: 12, border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", cursor: "pointer", maxWidth: 200 }}>
                {role === "superadmin" && <option value="">All branches</option>}
                {branches.map(b => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {role === "superadmin" ? `${b.business_name} — ${b.name}` : b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
            <BarcodeScannerIndicator lastScan={lastScan} />
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{user.username} · {role}</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>{children}</div>
      </div>

      {/* Sign out modal */}
      {showSignOut && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>🚪</div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#e8ecf2", margin: "0 0 8px", textAlign: "center" }}>Sign out?</h2>
            <p style={{ fontSize: 13, color: "#8a93a6", textAlign: "center", margin: "0 0 20px", lineHeight: 1.5 }}>
              You are signed in as <strong style={{ color: "#e8ecf2" }}>{user.username}</strong>.<br />Any unsaved changes will be lost.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => { setShowSignOut(false); onLogout(); }} style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: "none", background: "#A32D2D", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Yes, sign out</button>
              <button onClick={() => setShowSignOut(false)} style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: "1px solid #3a4255", background: "none", color: "#c0c7d4", fontSize: 14, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Change password modal */}
      {showChangePwd && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "#e8ecf2", margin: 0 }}>Change password</h2>
              <button onClick={() => setShowChangePwd(false)} style={closeBtn}>×</button>
            </div>
            <div style={{ background: "#1e2535", border: "1px solid #2a3247", borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "#8a93a6", marginBottom: 18 }}>
              Changing password for <strong style={{ color: "#e8ecf2" }}>@{user.username}</strong>
            </div>
            {pwdSuccess ? (
              <>
                <div style={successBox}>{pwdSuccess}</div>
                <button onClick={() => setShowChangePwd(false)} style={{ ...actionBtn, background: "#185FA5", color: "#fff", cursor: "pointer", marginTop: 14 }}>Done</button>
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
                  <button onClick={handleChangePwd} disabled={pwdLoading} style={{ ...actionBtn, background: pwdLoading ? "#2a3247" : "#185FA5", color: pwdLoading ? "#5a6475" : "#fff", cursor: pwdLoading ? "not-allowed" : "pointer" }}>{pwdLoading ? "Changing..." : "Change password"}</button>
                  <button onClick={() => setShowChangePwd(false)} style={{ ...actionBtn, background: "none", border: "1px solid #3a4255", color: "#c0c7d4", cursor: "pointer" }}>Cancel</button>
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
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#c0c7d4", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

const iconBtn      = { background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", fontSize: 11, padding: "4px 6px", borderRadius: 4 };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 };
const modalStyle   = { background: "#151b28", borderRadius: 14, padding: 24, width: "100%", maxWidth: 380, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.6)", border: "1px solid #2a3247" };
const closeBtn     = { background: "none", border: "none", fontSize: 22, color: "#8a93a6", cursor: "pointer", padding: 0, lineHeight: 1 };
const inputStyle   = { display: "block", width: "100%", padding: "9px 11px", borderRadius: 7, border: "1.5px solid #3a4255", fontSize: 13, background: "#1e2535", color: "#e8ecf2", boxSizing: "border-box", outline: "none", fontFamily: "inherit" };
const actionBtn    = { width: "100%", padding: "11px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 500 };
const errorBox     = { background: "#FCEBEB", color: "#A32D2D", borderRadius: 8, padding: "9px 13px", fontSize: 13 };
const successBox   = { background: "#EAF3DE", color: "#3B6D11", borderRadius: 8, padding: "10px 14px", fontSize: 13 };