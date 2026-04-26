import { useState, useEffect } from "react";
import { getDailyDashboard, getTopProducts, getSalesByCashier, getLowStock } from "../api/api";

export default function DashboardPage() {
  const [daily, setDaily]         = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [cashiers, setCashiers]   = useState([]);
  const [lowStock, setLowStock]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const [d, tp, cs, ls] = await Promise.all([
          getDailyDashboard(),
          getTopProducts(),
          getSalesByCashier(),
          getLowStock(10),
        ]);
        setDaily(d);
        setTopProducts(Array.isArray(tp) ? tp : tp?.data ?? []);
        setCashiers(Array.isArray(cs) ? cs : cs?.data ?? []);
        setLowStock(ls?.low_stock_items ?? ls?.data ?? []);
      } catch {
        setError("Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  if (loading) return <PageShell><div style={centreMsg}>Loading dashboard...</div></PageShell>;
  if (error)   return <PageShell><div style={errorBox}>{error}</div></PageShell>;

  // ── Chart data from daily dashboard ────────────────────────────────────────
  const chartLabels = daily?.chart?.labels   ?? [];
  const chartData   = daily?.chart?.datasets?.[0]?.data ?? [];
  const chartMax    = Math.max(...chartData, 1);

  return (
    <PageShell>
      {/* ── KPI row ── */}
      <div style={grid(4)}>
        <KPICard label="Today's sales"
          value={`₦${Number(daily?.summary?.total_sales || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
          icon="💰" tone="primary" />
        <KPICard label="Transactions today"
          value={daily?.summary?.total_transactions || 0}
          icon="🧾" tone="success" />
        <KPICard label="Today's profit"
          value={`₦${Number(daily?.summary?.total_profit || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
          icon="📈" tone="success" />
        <KPICard label="Low stock items"
          value={lowStock.length}
          icon="⚠️" tone={lowStock.length > 0 ? "warning" : "success"} />
      </div>

      {/* ── Sales trend chart ── */}
      {chartLabels.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={cardTitle}>Sales trend (₦)</div>
          <SalesChart labels={chartLabels} data={chartData} max={chartMax} />
        </div>
      )}

      {/* ── Bottom row ── */}
      <div style={{ ...grid(3), marginTop: 16 }}>

        {/* Top products */}
        <Card title="Top products today">
          {topProducts.length === 0 ? <Empty text="No sales yet today" /> : (
            topProducts.slice(0, 6).map((p, i) => (
              <div key={i} style={row}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={rankBadge}>{i + 1}</span>
                  <span style={rowLabel}>{p.product_name}</span>
                </div>
                <span style={rowValue}>{p.total_sold} sold</span>
              </div>
            ))
          )}
        </Card>

        {/* Sales by cashier */}
        <Card title="Sales by cashier">
          {cashiers.length === 0 ? <Empty text="No sales recorded yet" /> : (
            cashiers.slice(0, 6).map((c, i) => (
              <div key={i} style={row}>
                <span style={rowLabel}>{c.cashier}</span>
                <div style={{ textAlign: "right" }}>
                  <div style={rowValue}>
                    ₦{Number(c.total_sales).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                    {c.transactions} txn{c.transactions !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            ))
          )}
        </Card>

        {/* Low stock */}
        <Card title="Low stock alerts">
          {lowStock.length === 0 ? <Empty text="All products well stocked" icon="✅" /> : (
            lowStock.slice(0, 6).map((item, i) => (
              <div key={i} style={row}>
                <span style={rowLabel}>{item.product_name}</span>
                {/* ✅ Fixed: was item.stock, correct key is item.stock_quantity */}
                <span style={{
                  fontSize: 12, fontWeight: 500,
                  color:      item.stock_quantity <= 5 ? "#A32D2D" : "#854F0B",
                  background: item.stock_quantity <= 5 ? "#FCEBEB" : "#FAEEDA",
                  padding: "2px 8px", borderRadius: 10,
                }}>
                  {item.stock_quantity} left
                </span>
              </div>
            ))
          )}
        </Card>
      </div>
    </PageShell>
  );
}

// ── Sales bar chart (pure CSS/div — no library needed) ────────────────────────
function SalesChart({ labels, data, max }) {
  // Shorten date labels: "2026-04-20" → "Apr 20"
  const shortLabel = (raw) => {
    try {
      return new Date(raw).toLocaleDateString("en-NG", { month: "short", day: "numeric" });
    } catch { return raw; }
  };

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, paddingTop: 8 }}>
      {labels.map((lbl, i) => {
        const val    = data[i] ?? 0;
        const pct    = max > 0 ? (val / max) * 100 : 0;
        const isLast = i === labels.length - 1; // highlight today
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            {/* Value tooltip on hover via title */}
            <div title={`₦${Number(val).toLocaleString("en-NG")}`}
              style={{
                width: "100%",
                height: `${Math.max(pct, 3)}%`,
                background: isLast ? "#185FA5" : "rgba(24,95,165,0.35)",
                borderRadius: "4px 4px 0 0",
                transition: "height 0.3s ease",
                cursor: "default",
                minHeight: 4,
              }}
            />
            <span style={{ fontSize: 10, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
              {shortLabel(lbl)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function PageShell({ children }) {
  return (
    <div style={{ padding: "16px 24px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      {children}
    </div>
  );
}

function KPICard({ label, value, icon, tone = "primary" }) {
  const tones = {
    primary: { color: "#185FA5",  bg: "rgba(24,95,165,0.10)" },
    success: { color: "#3B6D11",  bg: "#EAF3DE" },
    warning: { color: "#854F0B",  bg: "#FAEEDA" },
  };
  const t = tones[tone];
  return (
    <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</span>
        <span style={{ fontSize: 18, background: t.bg, borderRadius: 8, padding: "4px 6px" }}>{icon}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: t.color }}>{value}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={card}>
      <div style={cardTitle}>{title}</div>
      {children}
    </div>
  );
}

function Empty({ text, icon = "📭" }) {
  return (
    <div style={{ textAlign: "center", padding: "16px 0", color: "var(--color-text-secondary)", fontSize: 12 }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      {text}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const grid = (cols) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 });

const card = {
  background: "var(--color-background-primary)",
  border: "1px solid var(--color-border-tertiary)",
  borderRadius: 12,
  padding: "16px 18px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const cardTitle = { fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 };

const row = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "6px 0", borderBottom: "1px solid var(--color-border-tertiary)",
};

const rowLabel = { fontSize: 13, color: "var(--color-text-primary)" };
const rowValue = { fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" };

const rankBadge = {
  fontSize: 10, fontWeight: 600,
  background: "rgba(24,95,165,0.1)", color: "#185FA5",
  borderRadius: 10, padding: "1px 6px", minWidth: 18, textAlign: "center",
};

const centreMsg = { textAlign: "center", padding: 60, color: "var(--color-text-secondary)", fontSize: 13 };
const errorBox  = { background: "#FCEBEB", color: "#A32D2D", borderRadius: 10, padding: "12px 16px", fontSize: 13 };