import { useState, useEffect } from "react";
import {
  getProfitReport,
  getStockValuation,
  getSalesSummary,
  getAuditLogs,
} from "../api/api";
import api from "../api/api";
import { useBranch } from "../context/BranchContext";

const ALL_TABS     = ["Profit", "Stock valuation", "Sales summary", "Credit accounts", "Audit log"];
const MANAGER_TABS = ["Profit", "Stock valuation", "Sales summary", "Credit accounts"];

export default function ReportsPage() {
  const { activeBranchId } = useBranch();

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin     = ["admin", "superadmin"].includes(currentUser.role);
  const TABS        = isAdmin ? ALL_TABS : MANAGER_TABS;

  const [activeTab,    setActiveTab]    = useState("Profit");
  const [data,         setData]         = useState(null);
  const [discountData, setDiscountData] = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

  useEffect(() => {
    if (!TABS.includes(activeTab)) setActiveTab("Profit");
  }, []);

  const fetchTab = async (tab) => {
    if (tab === "Audit log" && !isAdmin) return;
    setLoading(true); setError(null); setData(null); setDiscountData(null);
    try {
      let result;
      if (tab === "Profit")               result = await getProfitReport();
      else if (tab === "Stock valuation") result = await getStockValuation();
      else if (tab === "Sales summary") {
        const params = activeBranchId ? { branch_id: activeBranchId } : {};
        const [summary, discounts] = await Promise.all([
          getSalesSummary(),
          api.get("/sales/discount-summary", { params }).then(r => r.data).catch(() => null),
        ]);
        result = summary;
        setDiscountData(discounts);
      }
      else if (tab === "Audit log")       result = await getAuditLogs();
      else if (tab === "Credit accounts") result = await api.get("/ledger/summary").then(r => r.data);
      setData(result);
    } catch (err) {
      console.error(err);
      setError("Failed to load report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTab(activeTab); }, [activeTab, activeBranchId]);

  // ── Normalised shapes ─────────────────────────────────────────────────────
  const stockTotal     = data?.summary?.total_inventory_value ?? 0;
  const stockProducts  = data?.products ?? [];
  const auditRows      = Array.isArray(data) ? data : (data?.logs ?? data?.data ?? []);
  const summaryRevenue = data?.total_sales ?? data?.total_revenue ?? 0;
  const summaryTxns    = data?.transactions ?? data?.total_transactions ?? 0;

  const profitProducts    = data?.products ?? (Array.isArray(data) ? data : []);
  const grossProfit       = data?.gross_profit    ?? null;
  const totalExpenses     = data?.total_expenses  ?? 0;
  const netProfit         = data?.net_profit      ?? null;
  const expenseBreakdown  = data?.expense_breakdown ?? [];
  const hasNewProfitShape = data?.gross_profit !== undefined;

  const creditSummary  = activeTab === "Credit accounts" ? data : null;
  const creditAccounts = creditSummary?.accounts ?? [];

  const fmt = (v) => `₦${parseFloat(v || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--color-border-tertiary)", flexWrap: "wrap" }}>
        {TABS.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: "8px 14px", border: "none", background: "none", fontSize: 13,
            fontWeight: activeTab === tab ? 500 : 400,
            color: activeTab === tab ? "var(--color-primary)" : "var(--color-text-secondary)",
            cursor: "pointer",
            borderBottom: activeTab === tab ? `2px solid var(--color-primary)` : "2px solid transparent",
            marginBottom: -1, whiteSpace: "nowrap",
          }}>
            {tab}
          </button>
        ))}
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-tertiary)", fontSize: 13 }}>Loading...</div>}

      {/* ── Profit ── */}
      {!loading && activeTab === "Profit" && data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {hasNewProfitShape && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div style={kpiCard}>
                <div style={kpiLabel}>Gross profit</div>
                <div style={{ ...kpiValue, color: grossProfit >= 0 ? "#3B6D11" : "#A32D2D" }}>{fmt(grossProfit)}</div>
                <div style={kpiSub}>from product sales</div>
              </div>
              <div style={kpiCard}>
                <div style={kpiLabel}>Total expenses</div>
                <div style={{ ...kpiValue, color: "#A32D2D" }}>{fmt(totalExpenses)}</div>
                <div style={kpiSub}>{expenseBreakdown.length} categor{expenseBreakdown.length === 1 ? "y" : "ies"}</div>
              </div>
              <div style={{ ...kpiCard, borderColor: netProfit >= 0 ? "rgba(59,109,17,0.3)" : "rgba(163,45,45,0.3)" }}>
                <div style={kpiLabel}>Net profit</div>
                <div style={{ ...kpiValue, fontSize: 24, color: netProfit >= 0 ? "#3B6D11" : "#A32D2D" }}>{fmt(netProfit)}</div>
                <div style={kpiSub}>after expenses</div>
              </div>
            </div>
          )}
          {hasNewProfitShape && expenseBreakdown.length > 0 && (
            <div style={tableWrap}>
              <div style={sectionTitle}>Expenses by category</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {expenseBreakdown.map((e, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                      <td style={td}>{e.category}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 500, color: "#A32D2D" }}>− {fmt(e.total)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...td, fontWeight: 600 }}>Total expenses</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#A32D2D" }}>− {fmt(totalExpenses)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <div style={tableWrap}>
            <div style={sectionTitle}>Profit by product</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                  <th style={th}>Product</th>
                  <th style={{ ...th, textAlign: "right" }}>Gross profit</th>
                </tr>
              </thead>
              <tbody>
                {profitProducts.length === 0 ? (
                  <tr><td colSpan={2} style={emptyTd}>No sales data yet.</td></tr>
                ) : profitProducts.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                    <td style={td}>{row.product_name}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 500, color: row.profit >= 0 ? "#3B6D11" : "#A32D2D" }}>
                      {fmt(row.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Stock valuation ── */}
      {!loading && activeTab === "Stock valuation" && data && (
        <>
          <div style={{ ...kpiCard, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Total inventory value</span>
            <span style={{ fontSize: 22, fontWeight: 500, color: "var(--color-primary)" }}>{fmt(stockTotal)}</span>
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
                      {p.cost_price != null ? fmt(p.cost_price) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 500 }}>{fmt(p.stock_value ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Sales summary ── */}
      {!loading && activeTab === "Sales summary" && data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Revenue KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 500 }}>
            <StatCard label="Total revenue"      value={fmt(summaryRevenue)} color="var(--color-primary)" />
            <StatCard label="Total transactions" value={summaryTxns}         color="#0F6E56" />
          </div>

          {/* Loyalty discount summary */}
          {discountData && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Loyalty discount summary
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div style={kpiCard}>
                  <div style={kpiLabel}>Total discounts given</div>
                  <div style={{ ...kpiValue, color: "#854F0B" }}>{fmt(discountData.total_discounts)}</div>
                  <div style={kpiSub}>via loyalty redemptions</div>
                </div>
                <div style={kpiCard}>
                  <div style={kpiLabel}>Discounted sales</div>
                  <div style={{ ...kpiValue, color: "var(--color-text-primary)" }}>{discountData.discounted_sales}</div>
                  <div style={kpiSub}>transactions with discount</div>
                </div>
                <div style={kpiCard}>
                  <div style={kpiLabel}>Revenue after discounts</div>
                  <div style={{ ...kpiValue, color: "#3B6D11" }}>{fmt(discountData.revenue_after_discounts)}</div>
                  <div style={kpiSub}>actual cash collected</div>
                </div>
              </div>

              {/* Context row */}
              {discountData.discounted_sales > 0 && (
                <div style={{ background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "var(--color-text-secondary)", display: "flex", gap: 24, flexWrap: "wrap" }}>
                  <span>
                    Avg discount per redemption:{" "}
                    <strong style={{ color: "var(--color-text-primary)" }}>
                      {fmt(discountData.total_discounts / discountData.discounted_sales)}
                    </strong>
                  </span>
                  {summaryRevenue > 0 && (
                    <span>
                      Discount as % of revenue:{" "}
                      <strong style={{ color: "#854F0B" }}>
                        {((discountData.total_discounts / parseFloat(summaryRevenue)) * 100).toFixed(2)}%
                      </strong>
                    </span>
                  )}
                </div>
              )}

              {discountData.discounted_sales === 0 && (
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", padding: "8px 0" }}>
                  No loyalty discounts applied yet.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Credit accounts ── */}
      {!loading && activeTab === "Credit accounts" && creditSummary && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <div style={kpiCard}>
              <div style={kpiLabel}>Total outstanding</div>
              <div style={{ ...kpiValue, color: "#A32D2D" }}>{fmt(creditSummary.total_outstanding)}</div>
              <div style={kpiSub}>across all accounts</div>
            </div>
            <div style={kpiCard}>
              <div style={kpiLabel}>Active accounts</div>
              <div style={{ ...kpiValue, color: "var(--color-text-primary)" }}>{creditSummary.total_accounts}</div>
              <div style={kpiSub}>with outstanding balance</div>
            </div>
            <div style={kpiCard}>
              <div style={kpiLabel}>Overdue accounts</div>
              <div style={{ ...kpiValue, color: creditSummary.overdue_accounts > 0 ? "#A32D2D" : "#3B6D11" }}>
                {creditSummary.overdue_accounts}
              </div>
              <div style={kpiSub}>past due date</div>
            </div>
          </div>

          <div style={tableWrap}>
            <div style={sectionTitle}>Credit accounts — outstanding balances</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                  <th style={th}>Customer</th>
                  <th style={th}>Phone</th>
                  <th style={{ ...th, textAlign: "right" }}>Balance</th>
                  <th style={{ ...th, textAlign: "center" }}>Credit limit</th>
                  <th style={{ ...th, textAlign: "center" }}>Due days</th>
                  <th style={{ ...th, textAlign: "center" }}>Status</th>
                  <th style={{ ...th, textAlign: "right" }}>Last payment</th>
                </tr>
              </thead>
              <tbody>
                {creditAccounts.length === 0 ? (
                  <tr><td colSpan={7} style={emptyTd}>No outstanding credit accounts.</td></tr>
                ) : creditAccounts.map((acc, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                    <td style={td}><div style={{ fontWeight: 500 }}>{acc.full_name}</div></td>
                    <td style={{ ...td, fontSize: 12, color: "var(--color-text-secondary)" }}>{acc.phone || "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600, color: acc.balance < 0 ? "#3B6D11" : "#A32D2D" }}>
                      {acc.balance < 0 ? `${fmt(Math.abs(acc.balance))} credit` : fmt(acc.balance)}
                    </td>
                    <td style={{ ...td, textAlign: "center", fontSize: 12, color: "var(--color-text-secondary)" }}>
                      {acc.credit_limit ? fmt(acc.credit_limit) : "No limit"}
                    </td>
                    <td style={{ ...td, textAlign: "center", fontSize: 12, color: "var(--color-text-secondary)" }}>{acc.credit_due_days}d</td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {acc.is_overdue ? (
                        <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: "#FCEBEB", color: "#A32D2D" }}>⚠️ Overdue</span>
                      ) : acc.balance > 0 ? (
                        <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: "#FAEEDA", color: "#854F0B" }}>Owing</span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: "#EAF3DE", color: "#3B6D11" }}>Credit</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontSize: 12, color: "var(--color-text-tertiary)" }}>
                      {acc.last_payment
                        ? new Date(acc.last_payment).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
                        : "No payments yet"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Audit log ── */}
      {!loading && activeTab === "Audit log" && isAdmin && data && (
        <div style={tableWrap}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                <th style={th}>Time</th>
                <th style={th}>User</th>
                <th style={th}>Action</th>
                <th style={th}>Table</th>
                <th style={th}>Description</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.length === 0 ? (
                <tr><td colSpan={5} style={emptyTd}>No audit logs yet.</td></tr>
              ) : auditRows.map((log, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                  <td style={{ ...td, fontSize: 11, color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
                    {new Date(log.created_at ?? log.timestamp ?? log.log_date).toLocaleString()}
                  </td>
                  <td style={td}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{log.performed_by || "System"}</div>
                    {log.username && log.username !== "—" && (
                      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>@{log.username}</div>
                    )}
                  </td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: actionBadgeColor(log.action).bg, color: actionBadgeColor(log.action).color }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ ...td, color: "var(--color-text-secondary)", fontSize: 12 }}>{log.table_name}</td>
                  <td style={{ ...td, fontSize: 12, color: "var(--color-text-secondary)", maxWidth: 400 }}>{log.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function actionBadgeColor(action) {
  const a = (action || "").toUpperCase();
  if (a === "SALE")    return { bg: "#EAF3DE", color: "#3B6D11" };
  if (a === "REFUND")  return { bg: "#FCEBEB", color: "#A32D2D" };
  if (a === "RESTOCK") return { bg: "#E6F1FB", color: "#185FA5" };
  if (a === "UPDATE")  return { bg: "#FAEEDA", color: "#854F0B" };
  if (a === "DELETE")  return { bg: "#FCEBEB", color: "#A32D2D" };
  if (a === "CREATE")  return { bg: "#EAF3DE", color: "#3B6D11" };
  return { bg: "#F1EFE8", color: "#5F5E5A" };
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color }}>{value}</div>
    </div>
  );
}

const errorBox     = { background: "var(--error-bg)", color: "var(--error-text)", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 14 };
const tableWrap    = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" };
const sectionTitle = { padding: "12px 14px", borderBottom: "1px solid var(--color-border-tertiary)", fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.05em" };
const th           = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" };
const td           = { padding: "11px 14px", fontSize: 13, color: "var(--color-text-primary)" };
const emptyTd      = { textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 };
const kpiCard      = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 18px" };
const kpiLabel     = { fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 };
const kpiValue     = { fontSize: 22, fontWeight: 600, marginBottom: 3 };
const kpiSub       = { fontSize: 11, color: "var(--color-text-tertiary)" };