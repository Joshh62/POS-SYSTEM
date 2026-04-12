import { useState } from "react";

const NAV_ITEMS = [
  { key: "pos",       label: "POS",           icon: "🛒", roles: ["admin", "manager", "cashier"] },
  { key: "dashboard", label: "Dashboard",     icon: "📊", roles: ["admin", "manager"] },
  { key: "sales",     label: "Sales history", icon: "🧾", roles: ["admin", "manager", "cashier"] },
  { key: "products",  label: "Products",      icon: "📦", roles: ["admin", "manager"] },
  { key: "inventory", label: "Inventory",     icon: "🏭", roles: ["admin", "manager"] },
  { key: "reports",   label: "Reports",       icon: "📈", roles: ["admin", "manager"] },
  { key: "users",     label: "Users",         icon: "👥", roles: ["admin"] },
];

const PAGE_TITLES = {
  pos:       "Point of sale",
  dashboard: "Dashboard",
  sales:     "Sales history",
  products:  "Products",
  inventory: "Inventory",
  reports:   "Reports",
  users:     "Users",
};

export default function POSLayout({ children, activePage, onNavigate, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);

  const user    = JSON.parse(localStorage.getItem("user") || "{}");
  const role    = user.role || "cashier";
  const visible = NAV_ITEMS.filter((i) => i.roles.includes(role));
  const sideW   = collapsed ? 56 : 210;

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", overflow: "hidden", background: "var(--color-background-tertiary)" }}>

      {/* ── Sidebar ── */}
      <div style={{
        width: sideW, minWidth: sideW, maxWidth: sideW,
        height: "100%",
        background: "var(--color-background-primary)",
        borderRight: "1px solid var(--color-border-tertiary)",
        display: "flex", flexDirection: "column",
        transition: "width 0.18s ease, min-width 0.18s ease, max-width 0.18s ease",
        overflow: "hidden", flexShrink: 0,
      }}>

        {/* Logo row */}
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          padding: collapsed ? "0" : "0 12px",
          borderBottom: "1px solid var(--color-border-tertiary)",
          height: 52, flexShrink: 0,
        }}>
          {!collapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>🏪</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>
                POS System
              </span>
            </div>
          )}
          <button onClick={() => setCollapsed(c => !c)} style={iconBtn} title={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? "▶" : "◀"}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "8px 6px", display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
          {visible.map((item) => {
            const active = activePage === item.key;
            return (
              <button key={item.key} onClick={() => onNavigate(item.key)}
                title={collapsed ? item.label : ""}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  padding: collapsed ? "9px 0" : "9px 10px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  borderRadius: 8, border: "none",
                  background: active ? "#E6F1FB" : "transparent",
                  color: active ? "#185FA5" : "var(--color-text-secondary)",
                  fontWeight: active ? 500 : 400,
                  fontSize: 13, cursor: "pointer", width: "100%",
                  whiteSpace: "nowrap", overflow: "hidden",
                }}
              >
                <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* User + sign out */}
        <div style={{ borderTop: "1px solid var(--color-border-tertiary)", padding: collapsed ? "10px 0" : "10px 12px", flexShrink: 0 }}>
          {!collapsed && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user.username}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textTransform: "capitalize" }}>{role}</div>
            </div>
          )}
          <button onClick={onLogout} title={collapsed ? "Sign out" : ""}
            style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 6, background: "none", border: "none", color: "#A32D2D", fontSize: 12, cursor: "pointer", padding: "4px 0", width: "100%" }}
          >
            <span style={{ fontSize: 14 }}>🚪</span>
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </div>

      {/* ── Right: topbar + content ── */}
      <div style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Topbar */}
        <div style={{
          height: 52, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 24px",
          background: "var(--color-background-primary)",
          borderBottom: "1px solid var(--color-border-tertiary)",
        }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)" }}>
            {PAGE_TITLES[activePage] || ""}
          </span>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
            {user.username} · {role}
          </span>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

const iconBtn = { background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", fontSize: 11, padding: "4px 6px", borderRadius: 4, lineHeight: 1, flexShrink: 0 };