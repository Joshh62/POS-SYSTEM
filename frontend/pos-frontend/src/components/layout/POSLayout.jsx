import { useState } from "react";
import BarcodeScannerIndicator from "../scanner/BarcodeScannerIndicator";
import { useBranch } from "../../context/BranchContext";

const NAV_ITEMS = [
  { key: "pos",       label: "POS",           icon: "🛒", roles: ["admin", "manager", "cashier", "superadmin"] },
  { key: "dashboard", label: "Dashboard",     icon: "📊", roles: ["admin", "manager", "superadmin"] },
  { key: "sales",     label: "Sales history", icon: "🧾", roles: ["admin", "manager", "cashier", "superadmin"] },
  { key: "products",  label: "Products",      icon: "📦", roles: ["admin", "manager", "superadmin"] },
  { key: "inventory", label: "Inventory",     icon: "🏭", roles: ["admin", "manager", "superadmin"] },
  { key: "reports",   label: "Reports",       icon: "📈", roles: ["admin", "manager", "superadmin"] },
  { key: "users",     label: "Users",         icon: "👥", roles: ["admin", "superadmin"] },
  { key: "businesses",label: "Businesses",    icon: "🏢", roles: ["superadmin"] },
];

const PAGE_TITLES = {
  pos:        "Point of sale",
  dashboard:  "Dashboard",
  sales:      "Sales history",
  products:   "Products",
  inventory:  "Inventory",
  reports:    "Reports",
  users:      "Users",
  businesses: "Businesses",
};

export default function POSLayout({ children, activePage, onNavigate, onLogout, lastScan }) {
  const [collapsed, setCollapsed] = useState(false);
  const { activeBranchId, setActiveBranchId, branches, role: ctxRole } = useBranch();

  const user    = JSON.parse(localStorage.getItem("user") || "{}");
  const role    = user.role || "cashier";
  const visible = NAV_ITEMS.filter(i => i.roles.includes(role));
  const sideW   = collapsed ? 56 : 210;

  const canSwitchBranch = ["admin", "superadmin"].includes(role) && branches.length > 1;

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", overflow: "hidden", background: "var(--color-background-tertiary)" }}>

      {/* ── Sidebar ── */}
      <div style={{
        width: sideW, minWidth: sideW, maxWidth: sideW, height: "100%",
        background: "var(--color-background-primary)",
        borderRight: "1px solid var(--color-border-tertiary)",
        display: "flex", flexDirection: "column",
        transition: "width 0.18s ease", overflow: "hidden", flexShrink: 0,
      }}>

        {/* Logo */}
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          padding: collapsed ? "0" : "0 12px",
          borderBottom: "1px solid var(--color-border-tertiary)", height: 52,
        }}>
          {!collapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🏪</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                POS System
              </span>
            </div>
          )}
          <button onClick={() => setCollapsed(c => !c)} style={iconBtn}>
            {collapsed ? "▶" : "◀"}
          </button>
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

        {/* User section */}
        <div style={{ borderTop: "1px solid var(--color-border-tertiary)", padding: collapsed ? "10px 0" : "10px 12px" }}>
          {!collapsed && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{user.username}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textTransform: "capitalize" }}>{role}</div>
            </div>
          )}
          <button onClick={onLogout} style={{
            display: "flex", alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: 6, background: "none", border: "none",
            color: "var(--color-danger)", fontSize: 12, cursor: "pointer",
            padding: "4px 0", width: "100%",
          }}>
            <span style={{ fontSize: 14 }}>🚪</span>
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Topbar */}
        <div style={{
          height: 52, display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 20px",
          background: "var(--color-background-primary)",
          borderBottom: "1px solid var(--color-border-tertiary)",
          gap: 12,
        }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", flexShrink: 0 }}>
            {PAGE_TITLES[activePage] || ""}
          </span>

          {/* ── Branch switcher ── */}
          {canSwitchBranch && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                {role === "superadmin" ? "Viewing:" : "Branch:"}
              </span>
              <select
                value={activeBranchId ?? ""}
                onChange={e => setActiveBranchId(e.target.value ? parseInt(e.target.value) : null)}
                style={{
                  padding: "4px 8px", borderRadius: 6, fontSize: 12,
                  border: "1px solid var(--color-border-tertiary)",
                  background: "var(--color-background-secondary)",
                  color: "var(--color-text-primary)", cursor: "pointer",
                  maxWidth: 200,
                }}
              >
                {role === "superadmin" && (
                  <option value="">All branches</option>
                )}
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
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {user.username} · {role}
            </span>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

const iconBtn = {
  background: "none", border: "none", cursor: "pointer",
  color: "var(--color-text-tertiary)", fontSize: 11,
  padding: "4px 6px", borderRadius: 4,
};