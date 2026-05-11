import { useState, useEffect } from "react";
import BarcodeScannerIndicator from "../scanner/BarcodeScannerIndicator";
import { useBranch }  from "../../context/BranchContext";
import { useFeature } from "../../context/FeatureContext";
import { useTheme }   from "../../context/ThemeContext";
import { changePassword } from "../../api/api";
import OfflineIndicator from "../OfflineIndicator";

const SHOP_NAME = import.meta.env.VITE_SHOP_NAME || "ProfitTrack POS";

const NAV_ITEMS = [
  { key: "pos",        label: "POS",                 icon: "🛒", roles: ["admin", "manager", "cashier", "superadmin"], flag: null },
  { key: "dashboard",  label: "Dashboard",           icon: "📊", roles: ["admin", "manager", "superadmin"],            flag: null },
  { key: "sales",      label: "Sales history",       icon: "🧾", roles: ["admin", "manager", "cashier", "superadmin"], flag: null },
  { key: "products",   label: "Products",            icon: "📦", roles: ["admin", "manager", "superadmin"],            flag: null },
  { key: "inventory",  label: "Inventory",           icon: "🏭", roles: ["admin", "manager", "superadmin"],            flag: "inventory" },
  { key: "reports",    label: "Reports",             icon: "📈", roles: ["admin", "manager", "superadmin"],            flag: "reports" },
  { key: "analytics",  label: "Analytics",           icon: "🔬", roles: ["admin", "superadmin"],                       flag: null },
  { key: "users",      label: "Users",               icon: "👥", roles: ["admin", "superadmin"],                       flag: null },
  { key: "suppliers",  label: "Suppliers",           icon: "🚚", roles: ["admin", "manager", "superadmin"],            flag: null },
  { key: "businesses", label: "Businesses",          icon: "🏢", roles: ["superadmin"],                                flag: null },
  { key: "expenses",   label: "Expenses",            icon: "💸", roles: ["admin", "manager", "superadmin"],            flag: "expense_tracking" },
  { key: "customers",  label: "Customers",           icon: "👤", roles: ["admin", "manager", "superadmin"],            flag: null },
  { key: "settings",   label: "Branding & Settings", icon: "⚙️",  roles: ["admin"],                                    flag: null },
  { key: "billing",    label: "Plan & Billing",      icon: "💳", roles: ["admin"],                                     flag: null },
];

// Bottom nav shows these 4 keys + "more" button — picked by most common use
const BOTTOM_NAV_KEYS = ["pos", "sales", "products", "inventory"];

const PAGE_TITLES = {
  pos:        "Point of sale",
  dashboard:  "Dashboard",
  sales:      "Sales history",
  products:   "Products",
  inventory:  "Inventory",
  reports:    "Reports",
  analytics:  "Analytics",
  users:      "Users",
  businesses: "Businesses",
  expenses:   "Expenses",
  customers:  "Customers",
  suppliers:  "Suppliers",
  settings:   "Branding & Settings",
  billing:    "Plan & Billing",
};

const THEME_DOTS = {
  a1: { dark: "#d4a34f", light: "#c8a050", label: "Navy Gold" },
  a2: { dark: "#e8903a", light: "#b8640a", label: "Amber"     },
  a3: { dark: "#6ab87a", light: "#1a5c2a", label: "Forest"    },
};

// Detect mobile once
function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return mobile;
}

export default function POSLayout({ children, activePage, onNavigate, onLogout, lastScan }) {
  const [collapsed,   setCollapsed]   = useState(false);
  const [drawerOpen,  setDrawerOpen]  = useState(false);
  const isMobile = useIsMobile();

  const { activeBranchId, setActiveBranchId, branches } = useBranch();
  const { isEnabled } = useFeature();
  const { theme, mode, setTheme, toggleMode } = useTheme();

  const user  = JSON.parse(localStorage.getItem("user") || "{}");
  const role  = user.role || "cashier";
  const sideW = collapsed ? 56 : 210;

  const visible = NAV_ITEMS.filter(item => {
    if (!item.roles.includes(role)) return false;
    if (item.flag && !isEnabled(item.flag)) return false;
    return true;
  });

  // Bottom nav items — only show keys the user has access to
  const bottomNavItems = visible.filter(i => BOTTOM_NAV_KEYS.includes(i.key));
  // Drawer items — everything else
  const drawerItems    = visible.filter(i => !BOTTOM_NAV_KEYS.includes(i.key));

  const canSwitchBranch = ["admin", "superadmin"].includes(role)
    && branches.length > 1
    && isEnabled("multi_branch");

  const [showSignOut,   setShowSignOut]   = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [pwdForm,    setPwdForm]    = useState({ current: "", newPwd: "", confirm: "" });
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError,   setPwdError]   = useState(null);
  const [pwdSuccess, setPwdSuccess] = useState(null);

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

  const accent = THEME_DOTS[theme][mode];

  const handleNavigate = (key) => {
    onNavigate(key);
    setDrawerOpen(false);
  };

  // ── MOBILE LAYOUT ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-background-tertiary)" }}>

        {/* Mobile topbar */}
        <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", background: "var(--color-background-primary)", borderBottom: "1px solid var(--color-border-tertiary)", flexShrink: 0, zIndex: 100 }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 10, height: 7, border: "2px solid rgba(255,255,255,0.85)", borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {PAGE_TITLES[activePage] || SHOP_NAME}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Branch selector on mobile */}
            {canSwitchBranch && (
              <select
                value={activeBranchId ?? ""}
                onChange={e => setActiveBranchId(e.target.value ? parseInt(e.target.value) : null)}
                style={{ padding: "4px 6px", borderRadius: 6, fontSize: 11, border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", maxWidth: 110 }}
              >
                {role === "superadmin" && <option value="">All</option>}
                {branches.map(b => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {role === "superadmin" ? b.name : b.name}
                  </option>
                ))}
              </select>
            )}
            {/* Hamburger */}
            <button onClick={() => setDrawerOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: "6px", color: "var(--color-text-primary)", fontSize: 18, lineHeight: 1 }}>
              ☰
            </button>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", paddingBottom: 60 }}>
          {children}
        </div>

        {/* Bottom navigation bar */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 60, background: "var(--color-background-primary)", borderTop: "1px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", zIndex: 100 }}>
          {bottomNavItems.map(item => {
            const active = activePage === item.key;
            return (
              <button key={item.key} onClick={() => handleNavigate(item.key)} style={{
                flex: 1, height: "100%", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 3,
                border: "none", background: "none", cursor: "pointer",
                color: active ? "var(--color-primary)" : "var(--color-text-tertiary)",
                borderTop: active ? "2px solid var(--color-primary)" : "2px solid transparent",
                transition: "all 0.15s",
              }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <span style={{ fontSize: 9, fontWeight: active ? 600 : 400 }}>{item.label}</span>
              </button>
            );
          })}
          {/* More button */}
          <button onClick={() => setDrawerOpen(true)} style={{
            flex: 1, height: "100%", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 3,
            border: "none", background: "none", cursor: "pointer",
            color: !BOTTOM_NAV_KEYS.includes(activePage) && activePage !== undefined
              ? "var(--color-primary)" : "var(--color-text-tertiary)",
            borderTop: !BOTTOM_NAV_KEYS.includes(activePage)
              ? "2px solid var(--color-primary)" : "2px solid transparent",
          }}>
            <span style={{ fontSize: 18 }}>⋯</span>
            <span style={{ fontSize: 9 }}>More</span>
          </button>
        </div>

        {/* Drawer overlay */}
        {drawerOpen && (
          <>
            {/* Backdrop */}
            <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200 }} />

            {/* Drawer panel — slides in from left */}
            <div style={{
              position: "fixed", top: 0, left: 0, bottom: 0, width: 280,
              background: "var(--color-background-primary)",
              zIndex: 201, display: "flex", flexDirection: "column",
              boxShadow: "4px 0 24px rgba(0,0,0,0.2)",
            }}>
              {/* Drawer header */}
              <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", borderBottom: "1px solid var(--color-border-tertiary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 11, height: 7, border: "2px solid rgba(255,255,255,0.85)", borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>{SHOP_NAME}</span>
                </div>
                <button onClick={() => setDrawerOpen(false)} style={{ background: "none", border: "none", fontSize: 20, color: "var(--color-text-tertiary)", cursor: "pointer", padding: "4px" }}>✕</button>
              </div>

              {/* User info */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{user.username}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textTransform: "capitalize", marginTop: 2 }}>{role}</div>
              </div>

              {/* All nav items */}
              <nav style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
                {/* Bottom nav items first */}
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", padding: "6px 8px 4px" }}>Main</div>
                {bottomNavItems.map(item => {
                  const active = activePage === item.key;
                  return (
                    <button key={item.key} onClick={() => handleNavigate(item.key)} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "11px 12px",
                      borderRadius: 9, border: "none", width: "100%", textAlign: "left",
                      background: active ? "var(--color-primary-light)" : "transparent",
                      color: active ? "var(--color-primary)" : "var(--color-text-secondary)",
                      fontWeight: active ? 500 : 400, fontSize: 14, cursor: "pointer",
                      marginBottom: 2,
                    }}>
                      <span style={{ fontSize: 17 }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}

                {/* Rest of nav */}
                {drawerItems.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", padding: "12px 8px 4px" }}>More</div>
                    {drawerItems.map(item => {
                      const active = activePage === item.key;
                      return (
                        <button key={item.key} onClick={() => handleNavigate(item.key)} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "11px 12px",
                          borderRadius: 9, border: "none", width: "100%", textAlign: "left",
                          background: active ? "var(--color-primary-light)" : "transparent",
                          color: active ? "var(--color-primary)" : "var(--color-text-secondary)",
                          fontWeight: active ? 500 : 400, fontSize: 14, cursor: "pointer",
                          marginBottom: 2,
                        }}>
                          <span style={{ fontSize: 17 }}>{item.icon}</span>
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </>
                )}
              </nav>

              {/* Theme + actions */}
              <div style={{ borderTop: "1px solid var(--color-border-tertiary)", padding: "12px 16px" }}>
                {/* Theme dots */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Theme</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {Object.entries(THEME_DOTS).map(([t, colors]) => (
                      <button key={t} title={colors.label} onClick={() => setTheme(t)} style={{
                        width: 16, height: 16, borderRadius: "50%", border: "none",
                        background: colors[mode], cursor: "pointer", padding: 0,
                        outline: theme === t ? `2px solid ${colors[mode]}` : "none",
                        outlineOffset: 2, transform: theme === t ? "scale(1.2)" : "scale(1)",
                      }} />
                    ))}
                    {/* Dark mode toggle */}
                    <button onClick={toggleMode} style={{ width: 28, height: 16, borderRadius: 20, background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {mode === "dark" ? "🌙" : "☀️"}
                    </button>
                  </div>
                </div>
                {/* Account actions */}
                <button onClick={() => { setDrawerOpen(false); openChangePwd(); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer", padding: "8px 0", borderTop: "1px solid var(--color-border-tertiary)" }}>
                  <span>🔒</span> Change password
                </button>
                <button onClick={() => { setDrawerOpen(false); setShowSignOut(true); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", color: "var(--color-danger)", fontSize: 13, cursor: "pointer", padding: "8px 0" }}>
                  <span>🚪</span> Sign out
                </button>
              </div>
            </div>
          </>
        )}

        {/* Modals */}
        {showSignOut && <SignOutModal user={user} onConfirm={() => { setShowSignOut(false); onLogout(); }} onCancel={() => setShowSignOut(false)} />}
        {showChangePwd && <ChangePwdModal pwdForm={pwdForm} setPwdForm={setPwdForm} pwdLoading={pwdLoading} pwdError={pwdError} pwdSuccess={pwdSuccess} onSubmit={handleChangePwd} onClose={() => setShowChangePwd(false)} />}
        <OfflineIndicator />
      </div>
    );
  }

  // ── DESKTOP LAYOUT (unchanged) ─────────────────────────────────────────────
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", overflow: "hidden", background: "var(--color-background-tertiary)" }}>

      {/* Sidebar */}
      <div style={{ width: sideW, minWidth: sideW, maxWidth: sideW, height: "100%", background: "var(--color-background-primary)", borderRight: "1px solid var(--color-border-tertiary)", display: "flex", flexDirection: "column", transition: "width 0.18s ease", overflow: "hidden", flexShrink: 0 }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", padding: collapsed ? "0" : "0 12px", borderBottom: "1px solid var(--color-border-tertiary)", height: 52 }}>
          {!collapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 10, height: 7, border: "2px solid rgba(255,255,255,0.85)", borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{SHOP_NAME}</span>
            </div>
          )}
          <button onClick={() => setCollapsed(c => !c)} style={iconBtn}>{collapsed ? "▶" : "◀"}</button>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "8px 6px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {visible.map(item => {
            const active = activePage === item.key;
            return (
              <button key={item.key} onClick={() => onNavigate(item.key)} style={{
                display: "flex", alignItems: "center", gap: 9,
                padding: collapsed ? "10px 0" : "10px 12px",
                justifyContent: collapsed ? "center" : "flex-start",
                borderRadius: 8, border: "none",
                background: active ? "var(--color-primary-light)" : "transparent",
                color: active ? "var(--color-primary)" : "var(--color-text-secondary)",
                fontWeight: active ? 500 : 400, fontSize: 13, cursor: "pointer",
                width: "100%", transition: "all 0.15s",
              }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "var(--color-background-secondary)"; e.currentTarget.style.color = "var(--color-text-primary)"; }}}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}}
              >
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Theme controls */}
        <div style={{ padding: collapsed ? "8px 0" : "8px 12px", borderTop: "1px solid var(--color-border-tertiary)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", marginBottom: 8 }}>
            {!collapsed && <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>THEME</span>}
            <div style={{ display: "flex", gap: 5 }}>
              {Object.entries(THEME_DOTS).map(([t, colors]) => (
                <button key={t} title={colors.label} onClick={() => setTheme(t)} style={{ width: 14, height: 14, borderRadius: "50%", border: "none", background: colors[mode], cursor: "pointer", padding: 0, outline: theme === t ? `2px solid ${colors[mode]}` : "none", outlineOffset: 2, transform: theme === t ? "scale(1.25)" : "scale(1)", transition: "all 0.15s" }} />
              ))}
            </div>
          </div>
          <button onClick={toggleMode} style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", width: "100%", background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 8, padding: collapsed ? "6px 0" : "6px 10px", cursor: "pointer", marginBottom: 8 }}>
            {!collapsed && <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{mode === "dark" ? "Dark mode" : "Light mode"}</span>}
            <span style={{ fontSize: 14 }}>{mode === "dark" ? "🌙" : "☀️"}</span>
          </button>
        </div>

        {/* User section */}
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

      {/* Modals */}
      {showSignOut && <SignOutModal user={user} onConfirm={() => { setShowSignOut(false); onLogout(); }} onCancel={() => setShowSignOut(false)} />}
      {showChangePwd && <ChangePwdModal pwdForm={pwdForm} setPwdForm={setPwdForm} pwdLoading={pwdLoading} pwdError={pwdError} pwdSuccess={pwdSuccess} onSubmit={handleChangePwd} onClose={() => setShowChangePwd(false)} />}
      <OfflineIndicator />
    </div>
  );
}

// ── Shared modal components ───────────────────────────────────────────────────
function SignOutModal({ user, onConfirm, onCancel }) {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>🚪</div>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 8px", textAlign: "center" }}>Sign out?</h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", textAlign: "center", margin: "0 0 20px", lineHeight: 1.5 }}>
          You are signed in as <strong style={{ color: "var(--color-text-primary)" }}>{user.username}</strong>.<br />Any unsaved changes will be lost.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={onConfirm} style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: "none", background: "var(--color-danger)", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Yes, sign out</button>
          <button onClick={onCancel} style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: "1px solid var(--color-border-tertiary)", background: "none", color: "var(--color-text-secondary)", fontSize: 14, cursor: "pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ChangePwdModal({ pwdForm, setPwdForm, pwdLoading, pwdError, pwdSuccess, onSubmit, onClose }) {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>Change password</h2>
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>
        {pwdSuccess ? (
          <>
            <div style={successBox}>{pwdSuccess}</div>
            <button onClick={onClose} style={{ ...actionBtn, background: "var(--color-primary)", color: "#fff", cursor: "pointer", marginTop: 14 }}>Done</button>
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
              <button onClick={onSubmit} disabled={pwdLoading} style={{ ...actionBtn, background: pwdLoading ? "var(--color-background-secondary)" : "var(--color-primary)", color: pwdLoading ? "var(--color-text-tertiary)" : "#fff", cursor: pwdLoading ? "not-allowed" : "pointer" }}>{pwdLoading ? "Changing..." : "Change password"}</button>
              <button onClick={onClose} style={{ ...actionBtn, background: "none", border: "1px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)", cursor: "pointer" }}>Cancel</button>
            </div>
          </>
        )}
      </div>
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

const iconBtn      = { background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", fontSize: 11, padding: "4px 6px", borderRadius: 4 };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 };
const modalStyle   = { background: "var(--color-background-primary)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 380, maxHeight: "85vh", overflowY: "auto", boxShadow: "var(--shadow)", border: "1px solid var(--color-border-tertiary)" };
const closeBtn     = { background: "none", border: "none", fontSize: 22, color: "var(--color-text-tertiary)", cursor: "pointer", padding: 0, lineHeight: 1 };
const inputStyle   = { display: "block", width: "100%", padding: "9px 11px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", fontSize: 13, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box", outline: "none", fontFamily: "inherit" };
const actionBtn    = { width: "100%", padding: "11px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 500 };
const errorBox     = { background: "var(--error-bg)", color: "var(--error-text)", borderRadius: 8, padding: "9px 13px", fontSize: 13 };
const successBox   = { background: "var(--success-bg)", color: "var(--success-text)", borderRadius: 8, padding: "10px 14px", fontSize: 13 };