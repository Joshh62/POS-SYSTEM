import { useState, useEffect } from "react";
import { getDailyDashboard, getTopProducts, getSalesByCashier, getLowStock } from "../api/api";

export default function DashboardPage() {
  const [daily, setDaily] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [cashiers, setCashiers] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        setTopProducts(tp);
        setCashiers(cs);
        setLowStock(ls.low_stock_items || []);
      } catch {
        setError("Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  if (loading) return <PageShell><LoadingState /></PageShell>;
  if (error) return <PageShell><ErrorState message={error} /></PageShell>;

  return (
    <PageShell>
      {/* KPI cards */}
      <div style={gridStyle(4)}>
        <KPICard
          label="Today's sales"
          value={`₦${Number(daily?.summary?.total_sales || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
          icon="💰"
          tone="primary"
        />
        <KPICard
          label="Transactions today"
          value={daily?.summary?.total_transactions || 0}
          icon="🧾"
          tone="success"
        />
        <KPICard
          label="Today's profit"
          value={`₦${Number(daily?.summary?.total_profit || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
          icon="📈"
          tone="success"
        />
        <KPICard
          label="Low stock items"
          value={lowStock.length}
          icon="⚠️"
          tone={lowStock.length > 0 ? "warning" : "success"}
        />
      </div>

      {/* Second row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 16 }}>

        {/* Top products */}
        <Card title="Top products today">
          {topProducts.length === 0 ? (
            <Empty text="No sales yet today" />
          ) : (
            topProducts.slice(0, 6).map((p, i) => (
              <div key={i} style={rowStyle}>
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
          {cashiers.length === 0 ? (
            <Empty text="No sales recorded yet" />
          ) : (
            cashiers.slice(0, 6).map((c, i) => (
              <div key={i} style={rowStyle}>
                <span style={rowLabel}>{c.cashier}</span>
                <div style={{ textAlign: "right" }}>
                  <div style={rowValue}>
                    ₦{Number(c.total_sales).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text)", opacity: 0.7 }}>
                    {c.transactions} txn{c.transactions !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            ))
          )}
        </Card>

        {/* Low stock */}
        <Card title="Low stock alerts">
          {lowStock.length === 0 ? (
            <Empty text="All products well stocked" icon="✅" />
          ) : (
            lowStock.slice(0, 6).map((item, i) => (
              <div key={i} style={rowStyle}>
                <span style={rowLabel}>{item.product_name}</span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: item.stock_quantity <= 5 ? "var(--error-text)" : "#854F0B",
                    background: item.stock_quantity <= 5 ? "var(--error-bg)" : "#FAEEDA",
                    padding: "2px 8px",
                    borderRadius: 10,
                  }}
                >
                  {item.stock} left
                </span>
              </div>
            ))
          )}
        </Card>
      </div>
    </PageShell>
  );
}


// ------------------------------------
// COMPONENTS
// ------------------------------------

function PageShell({ children }) {
  return (
    <div style={{
      padding: "16px 24px 24px",
      overflowY: "auto",
      height: "100%",
      boxSizing: "border-box"
    }}>
      {children}
    </div>
  );
}

function KPICard({ label, value, icon, tone = "primary" }) {
  const tones = {
    primary: {
      color: "var(--color-primary)",
      bg: "rgba(30,58,138,0.1)"
    },
    success: {
      color: "var(--success-text)",
      bg: "var(--success-bg)"
    },
    warning: {
      color: "#854F0B",
      bg: "#FAEEDA"
    }
  };

  const t = tones[tone];

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: "18px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--text)" }}>{label}</span>
        <span style={{
          fontSize: 18,
          background: t.bg,
          borderRadius: 8,
          padding: "4px 6px"
        }}>
          {icon}
        </span>
      </div>

      <div style={{ fontSize: 22, fontWeight: 600, color: t.color }}>
        {value}
      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: "16px 18px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-h)" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ text, icon = "📭" }) {
  return (
    <div style={{
      textAlign: "center",
      padding: "16px 0",
      color: "var(--text)",
      fontSize: 12,
      opacity: 0.7
    }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      {text}
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{
      textAlign: "center",
      padding: 60,
      color: "var(--text)",
      fontSize: 13
    }}>
      Loading dashboard...
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div style={{
      background: "var(--error-bg)",
      color: "var(--error-text)",
      borderRadius: 10,
      padding: "12px 16px",
      fontSize: 13
    }}>
      {message}
    </div>
  );
}


// ------------------------------------
// STYLE HELPERS
// ------------------------------------

const gridStyle = (cols) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, 1fr)`,
  gap: 16,
});

const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "6px 0",
  borderBottom: "1px solid var(--border)",
};

const rowLabel = {
  fontSize: 13,
  color: "var(--text-h)"
};

const rowValue = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--text-h)"
};

const rankBadge = {
  fontSize: 10,
  fontWeight: 600,
  background: "rgba(30,58,138,0.1)",
  color: "var(--color-primary)",
  borderRadius: 10,
  padding: "1px 6px",
  minWidth: 18,
  textAlign: "center",
};