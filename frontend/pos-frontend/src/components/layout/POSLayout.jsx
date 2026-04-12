import { useState } from "react";

const NAV_ITEMS = [
  { key: "pos",       label: "POS",         icon: "🛒", roles: ["admin", "manager", "cashier"] },
  { key: "dashboard", label: "Dashboard",   icon: "📊", roles: ["admin", "manager"] },
  { key: "inventory", label: "Inventory",   icon: "📦", roles: ["admin", "manager"] },
  { key: "users",     label: "Users",       icon: "👥", roles: ["admin"] },
];

export default function POSLayout({ children, activePage, onNavigate, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const role = user.role || "cashier";

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

      {/* Sidebar */}
      <div
        style={{
          width: collapsed ? 56 : 200,
          flexShrink: 0,
          background: "var(--color-background-primary)",
          borderRight: "1px solid var(--color-border-tertiary)",
          display: "flex",
          flexDirection: "column",
          transition: "width 0.2s ease",
          overflow: "hidden",
        }}
      >
        {/* Logo + collapse toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "space-between",
            padding: collapsed ? "16px 0" : "16px 14px",
            borderBottom: "1px solid var(--color-border-tertiary)",
            flexShrink: 0,
          }}
        >
          {!collapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🏪</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>
                POS System
              </span>
            </div>
          )}

          <button
            onClick={() => setCollapsed((c) => !c)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-secondary)",
              fontSize: 16,
              padding: 4,
              borderRadius: 6,
              lineHeight: 1,
            }}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "→" : "←"}
          </button>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {visibleItems.map((item) => {
            const isActive = activePage === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                title={collapsed ? item.label : ""}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: collapsed ? "10px 0" : "10px 12px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  borderRadius: 8,
                  border: "none",
                  background: isActive ? "#E6F1FB" : "none",
                  color: isActive ? "#185FA5" : "var(--color-text-secondary)",
                  fontWeight: isActive ? 500 : 400,
                  fontSize: 13,
                  cursor: "pointer",
                  width: "100%",
                  transition: "background 0.12s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "var(--color-background-secondary)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "none";
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* User info + sign out */}
        <div
          style={{
            borderTop: "1px solid var(--color-border-tertiary)",
            padding: collapsed ? "12px 0" : "12px 14px",
            flexShrink: 0,
          }}
        >
          {!collapsed && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
                {user.username}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textTransform: "capitalize" }}>
                {role}
              </div>
            </div>
          )}

          <button
            onClick={onLogout}
            title={collapsed ? "Sign out" : ""}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: 6,
              background: "none",
              border: "none",
              color: "#A32D2D",
              fontSize: 12,
              cursor: "pointer",
              padding: collapsed ? "6px 0" : "6px 0",
              width: "100%",
            }}
          >
            <span style={{ fontSize: 14 }}>🚪</span>
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}