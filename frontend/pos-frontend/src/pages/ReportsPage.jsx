import { useState, useEffect } from "react";
import {
  getProfitReport,
  getStockValuation,
  getSalesSummary,
  getAuditLogs,
} from "../api/api";

const TABS = ["Profit", "Stock valuation", "Sales summary", "Audit log"];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("Profit");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTab = async (tab) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      let result;
      if (tab === "Profit")          result = await getProfitReport();
      else if (tab === "Stock valuation") result = await getStockValuation();
      else if (tab === "Sales summary")   result = await getSalesSummary();
      else if (tab === "Audit log")       result = await getAuditLogs();
      setData(result);
    } catch (err) {
      console.error(err);
      setError("Failed to load report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTab(activeTab); }, [activeTab]);

  // ── helpers to normalise API shapes ──────────────────────────────────────
  // Stock valuation: backend returns { summary:{total_inventory_value}, chart:{labels, datasets} }
  // Labels & data arrays may have duplicate product names — merge them by summing values.
  const stockTotal = data?.summary?.total_inventory_value ?? 0;

  const stockProducts = (() => {
    const labels  = data?.chart?.labels   ?? [];
    const values  = data?.chart?.datasets?.[0]?.data ?? [];
    const merged  = {};
    labels.forEach((name, i) => {
      merged[name] = (merged[name] ?? 0) + (values[i] ?? 0);
    });
    return Object.entries(merged).map(([product_name, stock_value]) => ({
      product_name,
      stock_value,
      stock_quantity: "—",   // not in this response shape
      cost_price: null,
    }));
  })();

  // Audit logs: backend may return { logs:[...] } or plain array
  const auditRows = Array.isArray(data)
    ? data
    : (data?.logs ?? data?.data ?? []);

  // Sales summary: handle both snake_case key variants
  const summaryRevenue = data?.total_sales ?? data?.total_revenue ?? 0;
  const summaryTxns    = data?.transactions ?? data?.total_transactions ?? 0;

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--color-border-tertiary)" }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 14px",
              border: "none",
              background: "none",
              fontSize: 13,
              fontWeight: activeTab === tab ? 500 : 400,
              color: activeTab === tab ? "#185FA5" : "var(--color-text-secondary)",
              cursor: "pointer",
              borderBottom: activeTab === tab ? "2px solid #185FA5" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-tertiary)", fontSize: 13 }}>
          Loading...
        </div>
      )}

      {/* ── Profit ── */}
      {!loading && activeTab === "Profit" && data && (
        <div style={tableWrap}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                <th style={th}>Product</th>
                <th style={{ ...th, textAlign: "right" }}>Profit</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(data) ? data : []).length === 0 ? (
                <tr><td colSpan={2} style={emptyTd}>No sales data yet.</td></tr>
              ) : (Array.isArray(data) ? data : []).map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                  <td style={td}>{row.product_name}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 500, color: row.profit >= 0 ? "#3B6D11" : "#A32D2D" }}>
                    ₦{parseFloat(row.profit || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Stock valuation ── */}
      {!loading && activeTab === "Stock valuation" && data && (
        <>
          <div style={{ ...kpiCard, marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Total inventory value</span>
            <span style={{ fontSize: 22, fontWeight: 500, color: "#185FA5" }}>
              ₦{parseFloat(stockTotal).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div style={tableWrap}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                  <th style={th}>Product</th>
                  <th style={{ ...th, textAlign: "right" }}>Stock</th>
                  <th style={{ ...th, textAlign: "right" }}>Cost price</th>
                  <th style={{ ...th, textAlign: "right" }}>Stock value</th>
                </tr>
              </thead>
              <tbody>
                {stockProducts.length === 0 ? (
                  <tr><td colSpan={4} style={emptyTd}>No inventory data.</td></tr>
                ) : stockProducts.map((p, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                    <td style={td}>{p.product_name}</td>
                    <td style={{ ...td, textAlign: "right" }}>{p.stock_quantity}</td>
                    <td style={{ ...td, textAlign: "right", color: "var(--color-text-secondary)" }}>
                      {p.cost_price != null
                        ? `₦${parseFloat(p.cost_price).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 500 }}>
                      ₦{parseFloat(p.stock_value ?? p.value ?? 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Sales summary ── */}
      {!loading && activeTab === "Sales summary" && data && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 500 }}>
          <StatCard
            label="Total revenue"
            value={`₦${parseFloat(summaryRevenue).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
            color="#185FA5"
          />
          <StatCard label="Total transactions" value={summaryTxns} color="#0F6E56" />
        </div>
      )}

      {/* ── Audit log ── */}
      {!loading && activeTab === "Audit log" && data && (
        <div style={tableWrap}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                <th style={th}>Time</th>
                <th style={th}>Action</th>
                <th style={th}>Table</th>
                <th style={th}>Description</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.length === 0 ? (
                <tr><td colSpan={4} style={emptyTd}>No audit logs yet.</td></tr>
              ) : auditRows.map((log, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                  <td style={{ ...td, fontSize: 11, color: "var(--color-text-tertiary)" }}>
                    {new Date(log.created_at ?? log.timestamp ?? log.log_date).toLocaleString()}
                  </td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 8, background: "#E6F1FB", color: "#185FA5" }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ ...td, color: "var(--color-text-secondary)" }}>{log.table_name}</td>
                  <td style={{ ...td, fontSize: 12, color: "var(--color-text-secondary)" }}>{log.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color }}>{value}</div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const errorBox  = { background: "#FCEBEB", color: "#A32D2D", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 14 };
const tableWrap = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" };
const th        = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" };
const td        = { padding: "11px 14px", fontSize: 13, color: "var(--color-text-primary)" };
const emptyTd   = { textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 };
const kpiCard   = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" };