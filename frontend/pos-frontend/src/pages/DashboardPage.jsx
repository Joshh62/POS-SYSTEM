import { useState, useEffect } from "react";
import { getDailyDashboard, getTopProducts, getSalesByCashier, getLowStock } from "../api/api";
import { useBranch } from "../context/BranchContext";

export default function DashboardPage() {
  const { activeBranchId } = useBranch();

  const [daily, setDaily]             = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [cashiers, setCashiers]       = useState([]);
  const [lowStock, setLowStock]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true); setError(null);
      try {
        const [d, tp, cs, ls] = await Promise.all([
          getDailyDashboard(),
          getTopProducts(),
          getSalesByCashier(),
          getLowStock(5),
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
  }, [activeBranchId]); // ✅ re-fetch when branch changes

  if (loading) return <PageShell><div style={centreMsg}>Loading dashboard...</div></PageShell>;
  if (error)   return <PageShell><div style={errorBox}>{error}</div></PageShell>;

  const chartLabels = daily?.chart?.labels ?? [];
  const chartData   = daily?.chart?.datasets?.[0]?.data ?? [];

  return (
    <PageShell>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <KPICard
          label="Today's sales"
          value={`₦${Number(daily?.summary?.total_sales || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
          icon="💰" tone="primary"
        />
        <KPICard
          label="Transactions today"
          value={daily?.summary?.total_transactions || 0}
          icon="🧾" tone="success"
        />
        <KPICard
          label="Today's profit"
          value={`₦${Number(daily?.summary?.total_profit || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
          icon="📈" tone="success"
        />
        <KPICard
          label="Low stock items"
          value={lowStock.length}
          icon="⚠️" tone={lowStock.length > 0 ? "warning" : "success"}
        />
      </div>

      {/* Sales trend chart */}
      {chartLabels.length > 0 && (
        <div style={{ ...card, marginTop: 14 }}>
          <div style={cardTitle}>7-day sales trend (₦)</div>
          <SalesChart labels={chartLabels} data={chartData} />
        </div>
      )}

      {/* Bottom row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          <Card title="Top products today">
            {topProducts.length === 0 ? <Empty text="No sales yet today" /> : (
              topProducts.slice(0, 5).map((p, i) => (
                <div key={i} style={row}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={rankBadge}>{i + 1}</span>
                    <span style={{ ...rowLabel, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.product_name}
                    </span>
                  </div>
                  <span style={{ ...rowValue, flexShrink: 0, marginLeft: 8 }}>{p.total_sold} sold</span>
                </div>
              ))
            )}
          </Card>

          <Card title="Sales by cashier">
            {cashiers.length === 0 ? <Empty text="No sales recorded yet" /> : (
              cashiers.slice(0, 5).map((c, i) => (
                <div key={i} style={row}>
                  <span style={{ ...rowLabel, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>
                    {c.cashier}
                  </span>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
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

        </div>

        <Card title={`Low stock alerts ${lowStock.length > 0 ? `(${lowStock.length})` : ""}`}>
          {lowStock.length === 0 ? (
            <Empty text="All products well stocked" icon="✅" />
          ) : (
            lowStock.map((item, i) => {
              const critical = item.stock_quantity <= 3;
              return (
                <div key={i} style={row}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={rankBadge}>{i + 1}</span>
                    <span style={{ ...rowLabel, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.product_name}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 10, flexShrink: 0, marginLeft: 8,
                    background: critical ? "#FCEBEB" : "#FAEEDA",
                    color:      critical ? "#A32D2D" : "#854F0B",
                  }}>
                    {item.stock_quantity} left
                  </span>
                </div>
              );
            })
          )}
        </Card>

      </div>
    </PageShell>
  );
}

// ── Sales bar chart ────────────────────────────────────────────────────────────
function SalesChart({ labels, data }) {
  const max = Math.max(...data, 1);

  const shortLabel = (raw) => {
    try {
      return new Date(raw).toLocaleDateString("en-NG", { month: "short", day: "numeric" });
    } catch { return raw; }
  };

  const fmt = (v) => {
    if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `₦${(v / 1_000).toFixed(0)}k`;
    return v > 0 ? `₦${v}` : "";
  };

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 160, paddingTop: 24, position: "relative" }}>
      {labels.map((lbl, i) => {
        const val    = data[i] ?? 0;
        const pct    = max > 0 ? (val / max) * 100 : 0;
        const isLast = i === labels.length - 1;
        const barH   = Math.max(pct * 1.2, val > 0 ? 8 : 3);

        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
            {val > 0 && (
              <span style={{ fontSize: 9, color: isLast ? "#185FA5" : "var(--color-text-secondary)", fontWeight: isLast ? 600 : 400, whiteSpace: "nowrap" }}>
                {fmt(val)}
              </span>
            )}
            <div
              title={val > 0 ? `₦${Number(val).toLocaleString("en-NG")}` : "No sales"}
              style={{
                width: "100%", height: `${barH}%`,
                background: isLast ? "#185FA5" : val > 0 ? "rgba(24,95,165,0.45)" : "rgba(24,95,165,0.1)",
                borderRadius: "4px 4px 0 0", transition: "height 0.4s ease", cursor: "default", minHeight: 3,
              }}
            />
            <span style={{ fontSize: 10, color: isLast ? "#185FA5" : "var(--color-text-secondary)", fontWeight: isLast ? 600 : 400, whiteSpace: "nowrap" }}>
              {shortLabel(lbl)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function PageShell({ children }) {
  return (
    <div style={{ padding: "16px 24px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      {children}
    </div>
  );
}

function KPICard({ label, value, icon, tone = "primary" }) {
  const tones = {
    primary: { color: "#185FA5", bg: "rgba(24,95,165,0.10)" },
    success: { color: "#3B6D11", bg: "#EAF3DE" },
    warning: { color: "#854F0B", bg: "#FAEEDA" },
  };
  const t = tones[tone];
  return (
    <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</span>
        <span style={{ fontSize: 16, background: t.bg, borderRadius: 8, padding: "4px 6px" }}>{icon}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: t.color }}>{value}</div>
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
    <div style={{ textAlign: "center", padding: "20px 0", color: "var(--color-text-secondary)", fontSize: 12 }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      {text}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const card      = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 };
const cardTitle = { fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 };
const row       = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--color-border-tertiary)" };
const rowLabel  = { fontSize: 13, color: "var(--color-text-primary)" };
const rowValue  = { fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" };
const rankBadge = { fontSize: 10, fontWeight: 600, background: "rgba(24,95,165,0.1)", color: "#185FA5", borderRadius: 10, padding: "2px 7px", minWidth: 20, textAlign: "center", flexShrink: 0 };
const centreMsg = { textAlign: "center", padding: 60, color: "var(--color-text-secondary)", fontSize: 13 };
const errorBox  = { background: "#FCEBEB", color: "#A32D2D", borderRadius: 10, padding: "12px 16px", fontSize: 13 };