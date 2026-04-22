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

      if (tab === "Profit") result = await getProfitReport();
      else if (tab === "Stock valuation") result = await getStockValuation();
      else if (tab === "Sales summary") result = await getSalesSummary();
      else if (tab === "Audit log") result = await getAuditLogs();

      setData(result);
    } catch {
      setError("Failed to load report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTab(activeTab);
  }, [activeTab]);

  return (
    <div
      style={{
        padding: "16px 24px",
        overflowY: "auto",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 20,
          borderBottom: "1px solid var(--color-border-tertiary)",
        }}
      >
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
              color:
                activeTab === tab
                  ? "#185FA5"
                  : "var(--color-text-secondary)",
              cursor: "pointer",
              borderBottom:
                activeTab === tab
                  ? "2px solid #185FA5"
                  : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            color: "var(--color-text-tertiary)",
            fontSize: 13,
          }}
        >
          Loading...
        </div>
      )}

      {/* ---- Profit tab ---- */}
      {!loading && activeTab === "Profit" && data && (
        <div style={tableWrap}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--color-border-tertiary)",
                }}
              >
                <th style={th}>Product</th>
                <th style={{ ...th, textAlign: "right" }}>Profit</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={2} style={emptyTd}>
                    No sales data yet.
                  </td>
                </tr>
              ) : (
                data.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: "1px solid var(--color-border-tertiary)",
                    }}
                  >
                    <td style={td}>{row.product_name}</td>
                    <td
                      style={{
                        ...td,
                        textAlign: "right",
                        fontWeight: 500,
                        color:
                          row.profit >= 0 ? "#3B6D11" : "#A32D2D",
                      }}
                    >
                      ₦
                      {parseFloat(row.profit || 0).toLocaleString("en-NG", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Stock valuation tab ---- */}
      {!loading && activeTab === "Stock valuation" && data && (
        <>
          <div style={{ ...kpiCard, marginBottom: 16 }}>
            <span
              style={{
                fontSize: 13,
                color: "var(--color-text-secondary)",
              }}
            >
              Total inventory value
            </span>
            <span
              style={{
                fontSize: 22,
                fontWeight: 500,
                color: "#185FA5",
              }}
            >
              ₦
              {parseFloat(
                data.total_inventory_value || 0
              ).toLocaleString("en-NG", {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>

          <div style={tableWrap}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--color-border-tertiary)",
                  }}
                >
                  <th style={th}>Product</th>
                  <th style={{ ...th, textAlign: "right" }}>Stock</th>
                  <th style={{ ...th, textAlign: "right" }}>Cost price</th>
                  <th style={{ ...th, textAlign: "right" }}>
                    Stock value
                  </th>
                </tr>
              </thead>
              <tbody>
                {(data.products || []).map((p, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom:
                        "1px solid var(--color-border-tertiary)",
                    }}
                  >
                    <td style={td}>{p.product_name}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {p.stock_quantity}
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: "right",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      ₦
                      {parseFloat(p.cost_price || 0).toLocaleString(
                        "en-NG",
                        { minimumFractionDigits: 2 }
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: "right",
                        fontWeight: 500,
                      }}
                    >
                      ₦
                      {parseFloat(p.stock_value || 0).toLocaleString(
                        "en-NG",
                        { minimumFractionDigits: 2 }
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ---- Sales summary tab ---- */}
      {!loading && activeTab === "Sales summary" && data && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            maxWidth: 500,
          }}
        >
          <StatCard
            label="Total revenue"
            value={`₦${parseFloat(data.total_sales || 0).toLocaleString(
              "en-NG",
              { minimumFractionDigits: 2 }
            )}`}
            color="#185FA5"
          />
          <StatCard
            label="Total transactions"
            value={data.transactions || 0}
            color="#0F6E56"
          />
        </div>
      )}

      {/* ---- Audit log tab ---- */}
      {!loading && activeTab === "Audit log" && data && (
        <div style={tableWrap}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--color-border-tertiary)",
                }}
              >
                <th style={th}>Time</th>
                <th style={th}>Action</th>
                <th style={th}>Table</th>
                <th style={th}>Description</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={4} style={emptyTd}>
                    No audit logs yet.
                  </td>
                </tr>
              ) : (
                data.map((log, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom:
                        "1px solid var(--color-border-tertiary)",
                    }}
                  >
                    <td
                      style={{
                        ...td,
                        fontSize: 11,
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: "2px 8px",
                          borderRadius: 8,
                          background: "#E6F1FB",
                          color: "#185FA5",
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td
                      style={{
                        ...td,
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {log.table_name}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontSize: 12,
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {log.description}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        background: "var(--color-background-primary)",
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: 12,
        padding: "18px 20px",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "var(--color-text-secondary)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, color }}>
        {value}
      </div>
    </div>
  );
}

// Styles
const errorBox = {
  background: "#FCEBEB",
  color: "#A32D2D",
  borderRadius: 8,
  padding: "9px 13px",
  fontSize: 13,
  marginBottom: 14,
};

const tableWrap = {
  background: "var(--color-background-primary)",
  border: "1px solid var(--color-border-tertiary)",
  borderRadius: 12,
  overflow: "hidden",
};

const th = {
  padding: "9px 14px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 500,
  color: "var(--color-text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const td = {
  padding: "11px 14px",
  fontSize: 13,
  color: "var(--color-text-primary)",
};

const emptyTd = {
  textAlign: "center",
  padding: 32,
  color: "var(--color-text-tertiary)",
  fontSize: 13,
};

const kpiCard = {
  background: "var(--color-background-primary)",
  border: "1px solid var(--color-border-tertiary)",
  borderRadius: 12,
  padding: "16px 20px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};