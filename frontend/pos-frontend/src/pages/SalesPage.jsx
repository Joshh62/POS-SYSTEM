import { useState, useEffect } from "react";
import api from "../api/api";

export default function SalesPage() {
  const [sales, setSales]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");

  // Receipt drawer
  const [receipt, setReceipt]   = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  const LIMIT = 20;

  const fetchSales = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: LIMIT };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;

      const res = await api.get("/sales/", { params });
      setSales(res.data.data);
      setTotal(res.data.total);
    } catch {
      setError("Failed to load sales.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSales(); }, [page, dateFrom, dateTo]);

  const viewReceipt = async (saleId) => {
    setReceiptLoading(true);
    try {
      const res = await api.get(`/sales/${saleId}/receipt`);
      setReceipt(res.data);
    } catch {
      alert("Could not load receipt.");
    } finally {
      setReceiptLoading(false);
    }
  };

  const handleRefund = async (saleId) => {
    const reason = window.prompt("Enter refund reason:");
    if (!reason) return;
    try {
      await api.post(`/sales/${saleId}/refund`, null, { params: { reason } });
      alert("Refund processed successfully.");
      fetchSales();
    } catch (err) {
      alert(err.response?.data?.detail || "Refund failed.");
    }
  };

  const statusColor = (status) => {
    if (status === "completed") return { bg: "#EAF3DE", color: "#3B6D11" };
    if (status === "refunded")  return { bg: "#FAEEDA", color: "#854F0B" };
    return { bg: "#F1EFE8", color: "#5F5E5A" };
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={labelStyle}>From</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} style={dateInput} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={labelStyle}>To</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} style={dateInput} />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }} style={clearBtn}>
            Clear filters
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-text-secondary)" }}>
          {total} transaction{total !== 1 ? "s" : ""}
        </span>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {/* Table */}
      <div style={tableWrap}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
              {["Sale #", "Date & time", "Cashier", "Items", "Total", "Payment", "Status", ""].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={emptyTd}>Loading sales...</td></tr>
            ) : sales.length === 0 ? (
              <tr><td colSpan={8} style={emptyTd}>No sales found.</td></tr>
            ) : sales.map((sale) => {
              const sc = statusColor(sale.status);
              return (
                <tr key={sale.sale_id} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                  <td style={{ ...td, fontWeight: 500 }}>#{sale.sale_id}</td>
                  <td style={{ ...td, fontSize: 12 }}>
                    {new Date(sale.sale_date).toLocaleString("en-NG", {
                      day: "2-digit", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit"
                    })}
                  </td>
                  <td style={td}>{sale.cashier}</td>
                  <td style={{ ...td, color: "var(--color-text-secondary)" }}>{sale.item_count}</td>
                  <td style={{ ...td, fontWeight: 500 }}>
                    ₦{sale.total_amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ ...td, textTransform: "capitalize", color: "var(--color-text-secondary)" }}>
                    {sale.payment_method}
                  </td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 10, background: sc.bg, color: sc.color }}>
                      {sale.status}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={() => viewReceipt(sale.sale_id)} style={actionBtn("#185FA5", "#E6F1FB")}>
                        Receipt
                      </button>
                      <a
                        href={`http://127.0.0.1:8000/sales/${sale.sale_id}/invoice`}
                        target="_blank" rel="noreferrer"
                        style={{ ...actionBtn("#3B6D11", "#EAF3DE"), textDecoration: "none" }}
                      >
                        PDF
                      </a>
                      {sale.status === "completed" && (
                        <button onClick={() => handleRefund(sale.sale_id)} style={actionBtn("#A32D2D", "#FCEBEB")}>
                          Refund
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 14 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pageBtn(page === 1)}>← Prev</button>
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pageBtn(page === totalPages)}>Next →</button>
        </div>
      )}

      {/* Receipt drawer */}
      {receipt && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>
                Receipt — Sale #{receipt.sale_id}
              </h2>
              <button onClick={() => setReceipt(null)} style={closeBtn}>×</button>
            </div>

            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 14 }}>
              {new Date(receipt.date).toLocaleString()}
            </div>

            <div style={{ marginBottom: 14 }}>
              {receipt.items.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--color-border-tertiary)", fontSize: 13 }}>
                  <span style={{ color: "var(--color-text-primary)" }}>{item.product} × {item.quantity}</span>
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    ₦{parseFloat(item.subtotal).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 500, fontSize: 15, paddingTop: 8 }}>
              <span style={{ color: "var(--color-text-primary)" }}>Total</span>
              <span style={{ color: "#185FA5" }}>
                ₦{parseFloat(receipt.total_amount).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <button onClick={() => setReceipt(null)} style={{ ...cancelBtn, width: "100%", marginTop: 16 }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle  = { fontSize: 12, color: "var(--color-text-secondary)", whiteSpace: "nowrap" };
const dateInput   = { padding: "7px 10px", borderRadius: 7, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none" };
const clearBtn    = { padding: "7px 12px", borderRadius: 7, border: "1px solid var(--color-border-secondary)", background: "none", color: "var(--color-text-secondary)", fontSize: 12, cursor: "pointer" };
const errorBox    = { background: "#FCEBEB", color: "#A32D2D", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 14 };
const tableWrap   = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" };
const th          = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" };
const td          = { padding: "11px 14px", fontSize: 13, color: "var(--color-text-primary)" };
const emptyTd     = { textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 };
const pageBtn     = (d) => ({ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--color-border-secondary)", background: d ? "var(--color-background-secondary)" : "var(--color-background-primary)", color: d ? "var(--color-text-tertiary)" : "var(--color-text-primary)", fontSize: 12, cursor: d ? "not-allowed" : "pointer" });
const actionBtn   = (color, bg) => ({ padding: "4px 10px", borderRadius: 6, border: "none", background: bg, color, fontSize: 11, fontWeight: 500, cursor: "pointer" });
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modalStyle  = { background: "var(--color-background-primary)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 400, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", border: "1px solid var(--color-border-secondary)" };
const cancelBtn   = { padding: "9px 0", borderRadius: 8, border: "1px solid var(--color-border-secondary)", background: "none", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer" };
const closeBtn    = { background: "none", border: "none", fontSize: 22, color: "var(--color-text-secondary)", cursor: "pointer", padding: 0, lineHeight: 1 };