import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import api from "../api/api";
import { getActiveBranchParam } from "../api/api";
import { useBranch } from "../context/BranchContext";

const TABS = ["Overview", "Sales trends", "Products", "Customers", "Inventory", "Cashiers"];

const COLORS = ["#185FA5", "#3B6D11", "#854F0B", "#A32D2D", "#0F6E56", "#5C3D9E", "#B85C00"];

const fmt = (v) => `₦${parseFloat(v || 0).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
const fmtFull = (v) => `₦${parseFloat(v || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
const pct = (v) => `${v}%`;

function KpiCard({ label, value, sub, color, change }) {
  const up = change > 0;
  return (
    <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "var(--color-text-primary)", marginBottom: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{sub}</div>}
      {change !== undefined && change !== null && (
        <div style={{ fontSize: 11, marginTop: 4, color: up ? "#3B6D11" : "#A32D2D", fontWeight: 500 }}>
          {up ? "▲" : "▼"} {Math.abs(change)}% vs prev period
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function ChartBox({ title, children, height = 260 }) {
  return (
    <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
      {title && <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 14 }}>{title}</div>}
      <div style={{ height }}>{children}</div>
    </div>
  );
}

function DataTable({ columns, rows, emptyText = "No data" }) {
  if (!rows || rows.length === 0) {
    return <div style={{ textAlign: "center", padding: "24px 0", fontSize: 13, color: "var(--color-text-tertiary)" }}>{emptyText}</div>;
  }
  return (
    <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
            {columns.map(c => (
              <th key={c.key} style={{ padding: "9px 14px", textAlign: c.align || "left", fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--color-border-tertiary)" : "none" }}>
              {columns.map(c => (
                <td key={c.key} style={{ padding: "11px 14px", fontSize: 13, color: "var(--color-text-primary)", textAlign: c.align || "left", fontWeight: c.bold ? 500 : 400 }}>
                  {c.render ? c.render(row) : row[c.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Loading() {
  return <div style={{ textAlign: "center", padding: 60, color: "var(--color-text-tertiary)", fontSize: 13 }}>Loading...</div>;
}

function ErrorMsg({ msg }) {
  return <div style={{ background: "var(--error-bg)", color: "var(--error-text)", borderRadius: 8, padding: "9px 13px", fontSize: 13, margin: "12px 0" }}>{msg}</div>;
}

export default function AnalyticsPage() {
  const { activeBranchId } = useBranch();
  const [activeTab, setActiveTab] = useState("Overview");

  // Date range
  const [period,    setPeriod]    = useState("30d");
  const [dateFrom,  setDateFrom]  = useState("");
  const [dateTo,    setDateTo]    = useState("");

  // Data
  const [overview,   setOverview]   = useState(null);
  const [trend,      setTrend]      = useState(null);
  const [peakTimes,  setPeakTimes]  = useState(null);
  const [products,   setProducts]   = useState(null);
  const [payments,   setPayments]   = useState(null);
  const [customers,  setCustomers]  = useState(null);
  const [inventory,  setInventory]  = useState(null);
  const [cashiers,   setCashiers]   = useState(null);

  const [loading, setLoading] = useState({});
  const [errors,  setErrors]  = useState({});

  const branchParam = getActiveBranchParam();

  const dateParams = () => {
    const p = { ...branchParam };
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo)   p.date_to   = dateTo;
    return p;
  };

  const load = async (key, fn) => {
    setLoading(l => ({ ...l, [key]: true }));
    setErrors(e => ({ ...e, [key]: null }));
    try {
      const result = await fn();
      return result;
    } catch (err) {
      setErrors(e => ({ ...e, [key]: err.response?.data?.detail || "Failed to load" }));
      return null;
    } finally {
      setLoading(l => ({ ...l, [key]: false }));
    }
  };

  // Load data per tab
  useEffect(() => {
    if (activeTab === "Overview") {
      load("overview", () => api.get("/analytics/overview", { params: dateParams() }).then(r => r.data)).then(setOverview);
      load("payments", () => api.get("/analytics/payment-methods", { params: dateParams() }).then(r => r.data)).then(setPayments);
    }
    if (activeTab === "Sales trends") {
      load("trend", () => api.get("/analytics/revenue-trend", { params: { period, ...branchParam } }).then(r => r.data)).then(setTrend);
      load("peak", () => api.get("/analytics/peak-times", { params: branchParam }).then(r => r.data)).then(setPeakTimes);
    }
    if (activeTab === "Products") {
      load("products", () => api.get("/analytics/products", { params: dateParams() }).then(r => r.data)).then(setProducts);
    }
    if (activeTab === "Customers") {
      load("customers", () => api.get("/analytics/customers", { params: dateParams() }).then(r => r.data)).then(setCustomers);
    }
    if (activeTab === "Inventory") {
      load("inventory", () => api.get("/analytics/inventory-health", { params: branchParam }).then(r => r.data)).then(setInventory);
    }
    if (activeTab === "Cashiers") {
      load("cashiers", () => api.get("/analytics/cashiers", { params: dateParams() }).then(r => r.data)).then(setCashiers);
    }
  }, [activeTab, period, dateFrom, dateTo, activeBranchId]);

  // Re-fetch trend when period changes
  useEffect(() => {
    if (activeTab === "Sales trends") {
      load("trend", () => api.get("/analytics/revenue-trend", { params: { period, ...branchParam } }).then(r => r.data)).then(setTrend);
    }
  }, [period]);

  const customTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
        <div style={{ color: "var(--color-text-secondary)", marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color, fontWeight: 500 }}>
            {p.name}: {p.name === "revenue" || p.name === "Revenue" ? fmt(p.value) : p.value}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Tabs + date filters */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid var(--color-border-tertiary)", flexWrap: "wrap", alignItems: "flex-end" }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: "8px 14px", border: "none", background: "none", fontSize: 13, cursor: "pointer",
            fontWeight: activeTab === tab ? 500 : 400,
            color: activeTab === tab ? "var(--color-primary)" : "var(--color-text-secondary)",
            borderBottom: activeTab === tab ? "2px solid var(--color-primary)" : "2px solid transparent",
            marginBottom: -1, whiteSpace: "nowrap",
          }}>
            {tab}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", paddingBottom: 8 }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={dateInputS} />
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={dateInputS} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }}
              style={{ fontSize: 11, background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer" }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Overview ── */}
      {activeTab === "Overview" && (
        <>
          {loading.overview ? <Loading /> : errors.overview ? <ErrorMsg msg={errors.overview} /> : overview && (
            <>
              <Section title="Key metrics">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
                  <KpiCard label="Total revenue"       value={fmtFull(overview.total_revenue)}        color="var(--color-primary)"  change={overview.revenue_change_pct} />
                  <KpiCard label="Transactions"         value={overview.total_transactions}             color="#0F6E56"               change={overview.txn_change_pct} />
                  <KpiCard label="Avg transaction"      value={fmtFull(overview.avg_transaction_value)} color="var(--color-text-primary)" />
                  <KpiCard label="Active customers"     value={overview.active_customers}               color="#185FA5" sub="with purchases in period" />
                  <KpiCard label="Gross margin"         value={pct(overview.gross_margin_pct)}          color={overview.gross_margin_pct > 20 ? "#3B6D11" : "#A32D2D"} sub="revenue minus cost of goods" />
                  <KpiCard label="Loyalty discounts"    value={fmtFull(overview.total_discounts)}       color="#854F0B" sub="given via points redemption" />
                </div>
              </Section>

              {payments && !loading.payments && (
                <Section title="Payment method breakdown">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <ChartBox title="Revenue by payment method" height={220}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={payments.data} dataKey="revenue" nameKey="method" cx="50%" cy="50%" outerRadius={80} label={({ method, revenue_pct }) => `${method} ${revenue_pct}%`} labelLine={false}>
                            {payments.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v) => fmtFull(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </ChartBox>
                    <DataTable
                      columns={[
                        { key: "method", label: "Method", render: r => r.method.charAt(0).toUpperCase() + r.method.slice(1) },
                        { key: "transactions", label: "Txns", align: "right" },
                        { key: "revenue", label: "Revenue", align: "right", render: r => fmtFull(r.revenue), bold: true },
                        { key: "revenue_pct", label: "% of total", align: "right", render: r => `${r.revenue_pct}%` },
                      ]}
                      rows={payments.data}
                    />
                  </div>
                </Section>
              )}
            </>
          )}
        </>
      )}

      {/* ── Sales trends ── */}
      {activeTab === "Sales trends" && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {["7d", "30d", "90d", "12m"].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: "6px 14px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)",
                background: period === p ? "var(--color-primary)" : "var(--color-background-secondary)",
                color: period === p ? "#fff" : "var(--color-text-secondary)",
                fontSize: 12, fontWeight: period === p ? 500 : 400, cursor: "pointer",
              }}>
                {p === "7d" ? "7 days" : p === "30d" ? "30 days" : p === "90d" ? "90 days" : "12 months"}
              </button>
            ))}
          </div>

          {loading.trend ? <Loading /> : errors.trend ? <ErrorMsg msg={errors.trend} /> : trend && (
            <>
              <ChartBox title="Revenue over time">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend.data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} tickFormatter={v => `₦${(v/1000).toFixed(0)}k`} />
                    <Tooltip content={customTooltip} />
                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#185FA5" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartBox>

              <ChartBox title="Transactions over time" height={200}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend.data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} allowDecimals={false} />
                    <Tooltip content={customTooltip} />
                    <Bar dataKey="transactions" name="Transactions" fill="#3B6D11" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>
            </>
          )}

          {loading.peak ? <Loading /> : peakTimes && (
            <>
              <ChartBox title="Sales by hour of day — identify peak trading hours" height={200}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={peakTimes.by_hour} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} allowDecimals={false} />
                    <Tooltip content={customTooltip} />
                    <Bar dataKey="transactions" name="Transactions" fill="#854F0B" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>

              <ChartBox title="Sales by day of week" height={200}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={peakTimes.by_day} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} allowDecimals={false} />
                    <Tooltip content={customTooltip} />
                    <Bar dataKey="transactions" name="Transactions" fill="#185FA5" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>
            </>
          )}
        </>
      )}

      {/* ── Products ── */}
      {activeTab === "Products" && (
        <>
          {loading.products ? <Loading /> : errors.products ? <ErrorMsg msg={errors.products} /> : products && (
            <>
              <Section title="Best selling products">
                <DataTable
                  columns={[
                    { key: "rank",         label: "#",          render: (_, i) => i + 1 },
                    { key: "product_name", label: "Product",    bold: true },
                    { key: "units_sold",   label: "Units sold", align: "right" },
                    { key: "revenue",      label: "Revenue",    align: "right", render: r => fmtFull(r.revenue), bold: true },
                    { key: "gross_profit", label: "Gross profit", align: "right", render: r => (
                      <span style={{ color: r.gross_profit >= 0 ? "#3B6D11" : "#A32D2D" }}>{fmtFull(r.gross_profit)}</span>
                    )},
                    { key: "margin_pct",   label: "Margin",     align: "right", render: r => (
                      <span style={{ color: r.margin_pct > 20 ? "#3B6D11" : "#854F0B" }}>{r.margin_pct}%</span>
                    )},
                  ]}
                  rows={products.best_sellers.map((r, i) => ({ ...r, rank: i + 1 }))}
                  emptyText="No sales data in this period"
                />
              </Section>

              {products.dead_stock?.length > 0 && (
                <Section title={`Dead stock — ${products.dead_stock.length} products with no sales in period`}>
                  <div style={{ background: "#FAEEDA", border: "1px solid rgba(133,79,11,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#854F0B" }}>
                    These products have stock but no sales in the selected period. Consider running a promotion or returning to supplier.
                  </div>
                  <DataTable
                    columns={[
                      { key: "product_name", label: "Product", bold: true },
                      { key: "stock",        label: "In stock", align: "right" },
                      { key: "stock_value",  label: "Stock value", align: "right", render: r => fmtFull(r.stock_value) },
                    ]}
                    rows={products.dead_stock}
                  />
                </Section>
              )}

              <Section title="Slow movers">
                <DataTable
                  columns={[
                    { key: "product_name", label: "Product", bold: true },
                    { key: "units_sold",   label: "Units sold", align: "right" },
                    { key: "revenue",      label: "Revenue",    align: "right", render: r => fmtFull(r.revenue) },
                    { key: "margin_pct",   label: "Margin",     align: "right", render: r => `${r.margin_pct}%` },
                  ]}
                  rows={products.worst_sellers}
                  emptyText="No data"
                />
              </Section>
            </>
          )}
        </>
      )}

      {/* ── Customers ── */}
      {activeTab === "Customers" && (
        <>
          {loading.customers ? <Loading /> : errors.customers ? <ErrorMsg msg={errors.customers} /> : customers && (
            <>
              <Section title="Customer summary">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
                  <KpiCard label="Customers with purchases"  value={customers.total_customers}  color="var(--color-primary)" />
                  <KpiCard label="Repeat customers"          value={customers.repeat_customers}  color="#3B6D11" sub="bought more than once" />
                  <KpiCard label="Retention rate"            value={pct(customers.retention_rate)} color={customers.retention_rate > 30 ? "#3B6D11" : "#854F0B"} sub="% who returned" />
                </div>
              </Section>

              <Section title="Top customers by spend">
                <DataTable
                  columns={[
                    { key: "rank",          label: "#", render: (_, i) => i + 1 },
                    { key: "customer_name", label: "Customer", bold: true },
                    { key: "phone",         label: "Phone", render: r => r.phone || "—" },
                    { key: "transactions",  label: "Transactions", align: "right" },
                    { key: "total_spend",   label: "Total spend", align: "right", render: r => fmtFull(r.total_spend), bold: true },
                  ]}
                  rows={customers.top_spenders.map((r, i) => ({ ...r, rank: i + 1 }))}
                  emptyText="No customer purchase data in this period"
                />
              </Section>

              <Section title="Loyalty programme">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  <KpiCard label="Customers with points"    value={customers.loyalty.customers_with_points}    color="#185FA5" />
                  <KpiCard label="Points outstanding"        value={customers.loyalty.total_points_outstanding.toLocaleString()} color="#854F0B" sub="unredeemed loyalty points" />
                  <KpiCard label="Points liability"          value={fmtFull(customers.loyalty.points_liability)} color="#A32D2D" sub={`at ₦${customers.loyalty.redeem_rate}/point`} />
                </div>
              </Section>
            </>
          )}
        </>
      )}

      {/* ── Inventory ── */}
      {activeTab === "Inventory" && (
        <>
          {loading.inventory ? <Loading /> : errors.inventory ? <ErrorMsg msg={errors.inventory} /> : inventory && (
            <>
              <Section title="Stock health overview">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                  <KpiCard label="Total SKUs"       value={inventory.summary.total_sku}         color="var(--color-text-primary)" />
                  <KpiCard label="OK"               value={inventory.summary.ok}                color="#3B6D11" />
                  <KpiCard label="Low stock"        value={inventory.summary.low}               color="#854F0B" />
                  <KpiCard label="Out of stock"     value={inventory.summary.out_of_stock}      color="#A32D2D" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  <KpiCard label="Total stock value" value={fmtFull(inventory.summary.total_stock_value)}  color="var(--color-primary)" sub="at cost price" />
                  <KpiCard label="Expiry risk"        value={fmtFull(inventory.summary.expiry_risk_value)} color="#854F0B" sub="expiring within 90 days" />
                  <KpiCard label="Expired stock"      value={fmtFull(inventory.summary.expired_value)}     color="#A32D2D" sub="already expired — write off" />
                </div>
              </Section>

              {inventory.reorder_urgency?.length > 0 && (
                <Section title="Reorder urgency — ranked by days of stock remaining">
                  <DataTable
                    columns={[
                      { key: "product_name",  label: "Product",      bold: true },
                      { key: "current_stock", label: "In stock",     align: "right" },
                      { key: "reorder_level", label: "Reorder at",   align: "right" },
                      { key: "units_sold_30d",label: "Sold (30d)",   align: "right" },
                      { key: "days_left",     label: "Days left",    align: "right", render: r => (
                        <span style={{ color: r.days_left === null ? "#854F0B" : r.days_left <= 7 ? "#A32D2D" : r.days_left <= 14 ? "#854F0B" : "#3B6D11", fontWeight: 500 }}>
                          {r.status === "out" ? "Out of stock" : r.days_left !== null ? `~${r.days_left}d` : "No recent sales"}
                        </span>
                      )},
                      { key: "supplier",      label: "Supplier",     render: r => r.supplier || "—" },
                    ]}
                    rows={inventory.reorder_urgency}
                    emptyText="No products need reordering"
                  />
                </Section>
              )}
            </>
          )}
        </>
      )}

      {/* ── Cashiers ── */}
      {activeTab === "Cashiers" && (
        <>
          {loading.cashiers ? <Loading /> : errors.cashiers ? <ErrorMsg msg={errors.cashiers} /> : cashiers && (
            <Section title="Cashier performance">
              <DataTable
                columns={[
                  { key: "rank",         label: "#",           render: (_, i) => i + 1 },
                  { key: "cashier_name", label: "Cashier",     bold: true },
                  { key: "role",         label: "Role",        render: r => <span style={{ fontSize: 11, textTransform: "capitalize", color: "var(--color-text-secondary)" }}>{r.role}</span> },
                  { key: "transactions", label: "Transactions", align: "right" },
                  { key: "revenue",      label: "Revenue",     align: "right", render: r => fmtFull(r.revenue), bold: true },
                  { key: "avg_txn",      label: "Avg basket",  align: "right", render: r => fmtFull(r.avg_txn) },
                  { key: "discounts",    label: "Discounts given", align: "right", render: r => fmtFull(r.discounts) },
                ]}
                rows={cashiers.data.map((r, i) => ({ ...r, rank: i + 1 }))}
                emptyText="No sales data in this period"
              />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

const dateInputS = { padding: "5px 8px", borderRadius: 6, border: "1px solid var(--color-border-tertiary)", fontSize: 12, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", outline: "none" };