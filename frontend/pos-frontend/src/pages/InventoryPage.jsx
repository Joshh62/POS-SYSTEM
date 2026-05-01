import { useState, useEffect } from "react";
import {
  getInventory,
  restockProduct,
  getProducts,
  updateReorderLevel,
  getExpiringBatches,
  getProductBatches,
} from "../api/api";

const TABS = ["Stock levels", "Expiry alerts"];

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState("Stock levels");
  const [inventory, setInventory] = useState([]);
  const [products, setProducts]   = useState({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const [expiryData, setExpiryData]       = useState(null);
  const [expiryLoading, setExpiryLoading] = useState(false);

  const [restocking, setRestocking]         = useState(null);
  const [restockQty, setRestockQty]         = useState("");
  const [restockExpiry, setRestockExpiry]   = useState("");
  const [restockNotes, setRestockNotes]     = useState("");
  const [restockLoading, setRestockLoading] = useState(false);
  const [restockError, setRestockError]     = useState(null);
  const [restockSuccess, setRestockSuccess] = useState(null);

  const [editingReorder, setEditingReorder]   = useState(null);
  const [reorderLevel, setReorderLevel]       = useState("");
  const [expiryAlertDays, setExpiryAlertDays] = useState("");
  const [reorderLoading, setReorderLoading]   = useState(false);
  const [reorderError, setReorderError]       = useState(null);
  const [reorderSuccess, setReorderSuccess]   = useState(null);

  const [viewingBatches, setViewingBatches] = useState(null);
  const [batches, setBatches]               = useState([]);
  const [batchLoading, setBatchLoading]     = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [inv, prod] = await Promise.all([getInventory(), getProducts(1, 100)]);
      setInventory(Array.isArray(inv) ? inv : []);
      const map = {};
      (prod.data || []).forEach(p => { map[p.product_id] = p; });
      setProducts(map);
    } catch {
      setError("Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  };

  const fetchExpiry = async () => {
    setExpiryLoading(true);
    try {
      const data = await getExpiringBatches();
      setExpiryData(data);
    } catch {
      setExpiryData({ expired: [], expiring_soon: [], total_alerts: 0 });
    } finally {
      setExpiryLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { if (activeTab === "Expiry alerts") fetchExpiry(); }, [activeTab]);

  const openRestock = (item) => {
    setRestocking(item);
    setRestockQty("");
    setRestockExpiry("");
    setRestockNotes("");
    setRestockError(null);
    setRestockSuccess(null);
  };

  const handleRestock = async () => {
    if (!restockQty || Number(restockQty) <= 0) {
      setRestockError("Enter a valid quantity.");
      return;
    }
    setRestockLoading(true);
    setRestockError(null);
    try {
      await restockProduct({
        product_id:  restocking.product_id,
        branch_id:   restocking.branch_id,
        quantity:    Number(restockQty),
        expiry_date: restockExpiry || null,
        notes:       restockNotes  || null,
      });
      setRestockSuccess(`Added ${restockQty} units successfully.`);
      setRestockQty("");
      setRestockExpiry("");
      setRestockNotes("");
      fetchData();
    } catch (err) {
      setRestockError(err.response?.data?.detail || "Restock failed.");
    } finally {
      setRestockLoading(false);
    }
  };

  const openReorder = (item) => {
    setEditingReorder(item);
    setReorderLevel(String(item.reorder_level ?? 5));
    setExpiryAlertDays(String(item.expiry_alert_days ?? 90));
    setReorderError(null);
    setReorderSuccess(null);
  };

  const handleReorderSave = async () => {
    if (!reorderLevel || Number(reorderLevel) < 0) {
      setReorderError("Enter a valid reorder level.");
      return;
    }
    setReorderLoading(true);
    setReorderError(null);
    try {
      await updateReorderLevel({
        product_id:        editingReorder.product_id,
        branch_id:         editingReorder.branch_id,
        reorder_level:     Number(reorderLevel),
        expiry_alert_days: expiryAlertDays ? Number(expiryAlertDays) : undefined,
      });
      setReorderSuccess("Settings updated.");
      fetchData();
    } catch (err) {
      setReorderError(err.response?.data?.detail || "Update failed.");
    } finally {
      setReorderLoading(false);
    }
  };

  const openBatches = async (item) => {
    setViewingBatches(item);
    setBatches([]);
    setBatchLoading(true);
    try {
      const data = await getProductBatches(item.product_id);
      setBatches(Array.isArray(data) ? data : []);
    } catch {
      setBatches([]);
    } finally {
      setBatchLoading(false);
    }
  };

  const closeAll = () => {
    setRestocking(null);
    setEditingReorder(null);
    setViewingBatches(null);
    setRestockSuccess(null);
    setReorderSuccess(null);
  };

  const statusBadge = (item) => {
    if (item.stock_quantity <= 0)
      return { bg: "#FCEBEB", color: "#A32D2D", label: "Out of stock" };
    if (item.stock_quantity <= (item.reorder_level ?? 5))
      return { bg: "#FAEEDA", color: "#854F0B", label: "Low" };
    return { bg: "#EAF3DE", color: "#3B6D11", label: "OK" };
  };

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--color-border-tertiary)" }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 14px",
              border: "none",
              background: "none",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: activeTab === tab ? 500 : 400,
              color: activeTab === tab ? "#185FA5" : "var(--color-text-secondary)",
              borderBottom: activeTab === tab ? "2px solid #185FA5" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {tab}
            {tab === "Expiry alerts" && expiryData?.total_alerts > 0 && (
              <span style={{
                marginLeft: 6,
                background: "#FCEBEB",
                color: "#A32D2D",
                fontSize: 10,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 8,
              }}>
                {expiryData.total_alerts}
              </span>
            )}
          </button>
        ))}
        <button onClick={fetchData} style={refreshBtn}>↻ Refresh</button>
      </div>

      {/* Stock levels tab */}
      {activeTab === "Stock levels" && (
        <>
          {error   && <div style={errorBox}>{error}</div>}
          {loading && <div style={centreMsg}>Loading inventory...</div>}
          {!loading && !error && (
            <div style={tableWrapper}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                    {["Product", "Barcode", "Branch", "Stock", "Reorder level", "Alert (days)", "Status", ""].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventory.length === 0 ? (
                    <tr><td colSpan={8} style={emptyTd}>No inventory records found.</td></tr>
                  ) : inventory.map(item => {
                    const product = products[item.product_id];
                    const sb      = statusBadge(item);
                    return (
                      <tr key={item.inventory_id} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                        <td style={tdStyle}>{product?.product_name || `#${item.product_id}`}</td>
                        <td style={{ ...tdStyle, fontSize: 11, color: "var(--color-text-tertiary)" }}>{product?.barcode || "—"}</td>
                        <td style={tdStyle}>Branch {item.branch_id}</td>
                        <td style={{ ...tdStyle, fontWeight: 500 }}>{item.stock_quantity}</td>
                        <td style={{ ...tdStyle, color: "var(--color-text-secondary)" }}>{item.reorder_level ?? 5}</td>
                        <td style={{ ...tdStyle, color: "var(--color-text-secondary)" }}>{item.expiry_alert_days ?? 90}d</td>
                        <td style={tdStyle}>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "3px 9px",
                            borderRadius: 10,
                            background: sb.bg,
                            color: sb.color,
                          }}>
                            {sb.label}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button onClick={() => openBatches(item)} style={ghostBtn}>Batches</button>
                            <button onClick={() => openReorder(item)} style={ghostBtn}>Settings</button>
                            <button onClick={() => openRestock(item)} style={restockBtnStyle}>Restock</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Expiry alerts tab */}
      {activeTab === "Expiry alerts" && (
        <>
          {expiryLoading && <div style={centreMsg}>Loading expiry data...</div>}
          {!expiryLoading && expiryData && (
            <>
              {expiryData.expired.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#A32D2D", marginBottom: 8 }}>
                    Expired — {expiryData.expired.length} batch{expiryData.expired.length !== 1 ? "es" : ""}
                  </div>
                  <ExpiryTable rows={expiryData.expired} />
                </div>
              )}
              {expiryData.expiring_soon.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#854F0B", marginBottom: 8 }}>
                    Expiring soon — {expiryData.expiring_soon.length} batch{expiryData.expiring_soon.length !== 1 ? "es" : ""}
                  </div>
                  <ExpiryTable rows={expiryData.expiring_soon} />
                </div>
              )}
              {expiryData.total_alerts === 0 && (
                <div style={{ textAlign: "center", padding: 60, color: "var(--color-text-secondary)", fontSize: 13 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                  No expiry alerts. All batches are within safe date range.
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Restock modal ── */}
      {restocking && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeader}>
              <h2 style={modalTitle}>Restock product</h2>
              <button onClick={closeAll} style={closeBtn}>×</button>
            </div>

            <div style={infoRow}>
              <span style={infoLabel}>Product</span>
              <span style={infoValue}>{products[restocking.product_id]?.product_name || `#${restocking.product_id}`}</span>
            </div>
            <div style={infoRow}>
              <span style={infoLabel}>Current stock</span>
              <span style={infoValue}>{restocking.stock_quantity} units</span>
            </div>

            <div style={dividerStyle} />

            {restockSuccess ? (
              <>
                <div style={successBox}>{restockSuccess}</div>
                <button onClick={closeAll} style={{ ...primaryBtn, width: "100%", marginTop: 12 }}>Close</button>
              </>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Quantity to add <span style={starStyle}>*</span></label>
                    <input
                      type="number"
                      min="1"
                      value={restockQty}
                      onChange={e => setRestockQty(e.target.value)}
                      placeholder="e.g. 50"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Expiry date</label>
                    <input
                      type="date"
                      value={restockExpiry}
                      onChange={e => setRestockExpiry(e.target.value)}
                      style={inputStyle}
                    />
                    <span style={hintStyle}>Leave blank if product has no expiry date</span>
                  </div>
                  <div>
                    <label style={labelStyle}>Notes (optional)</label>
                    <input
                      type="text"
                      value={restockNotes}
                      onChange={e => setRestockNotes(e.target.value)}
                      placeholder="e.g. Batch from Supplier A"
                      style={inputStyle}
                    />
                  </div>
                </div>

                {restockError && <div style={{ ...errorBox, marginTop: 12 }}>{restockError}</div>}

                <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                  <button onClick={closeAll} style={{ ...cancelBtn, flex: 1 }}>Cancel</button>
                  <button
                    onClick={handleRestock}
                    disabled={restockLoading}
                    style={{ ...primaryBtn, flex: 2, opacity: restockLoading ? 0.7 : 1 }}
                  >
                    {restockLoading ? "Restocking..." : "Confirm restock"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Inventory settings modal ── */}
      {editingReorder && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeader}>
              <h2 style={modalTitle}>Inventory settings</h2>
              <button onClick={closeAll} style={closeBtn}>×</button>
            </div>

            <div style={infoRow}>
              <span style={infoLabel}>Product</span>
              <span style={infoValue}>{products[editingReorder.product_id]?.product_name || `#${editingReorder.product_id}`}</span>
            </div>
            <div style={infoRow}>
              <span style={infoLabel}>Branch</span>
              <span style={infoValue}>Branch {editingReorder.branch_id}</span>
            </div>

            <div style={dividerStyle} />

            {reorderSuccess ? (
              <>
                <div style={successBox}>{reorderSuccess}</div>
                <button onClick={closeAll} style={{ ...primaryBtn, width: "100%", marginTop: 12 }}>Close</button>
              </>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Reorder level (units)</label>
                    <input
                      type="number"
                      min="0"
                      value={reorderLevel}
                      onChange={e => setReorderLevel(e.target.value)}
                      style={inputStyle}
                    />
                    <span style={hintStyle}>System alerts when stock falls to or below this number</span>
                  </div>
                  <div>
                    <label style={labelStyle}>Expiry alert threshold (days)</label>
                    <input
                      type="number"
                      min="1"
                      value={expiryAlertDays}
                      onChange={e => setExpiryAlertDays(e.target.value)}
                      style={inputStyle}
                    />
                    <span style={hintStyle}>Alert when a batch expires within this many days (default: 90)</span>
                  </div>
                </div>

                {reorderError && <div style={{ ...errorBox, marginTop: 12 }}>{reorderError}</div>}

                <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                  <button onClick={closeAll} style={{ ...cancelBtn, flex: 1 }}>Cancel</button>
                  <button
                    onClick={handleReorderSave}
                    disabled={reorderLoading}
                    style={{ ...primaryBtn, flex: 2, opacity: reorderLoading ? 0.7 : 1 }}
                  >
                    {reorderLoading ? "Saving..." : "Save settings"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Batch modal ── */}
      {viewingBatches && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, width: 520 }}>
            <div style={modalHeader}>
              <h2 style={modalTitle}>
                Batches — {products[viewingBatches.product_id]?.product_name || `#${viewingBatches.product_id}`}
              </h2>
              <button onClick={closeAll} style={closeBtn}>×</button>
            </div>

            {batchLoading ? (
              <div style={centreMsg}>Loading batches...</div>
            ) : batches.length === 0 ? (
              <div style={{ ...centreMsg, padding: 24 }}>
                No batch records found. Batches are created when you restock.
              </div>
            ) : (
              <div style={batchTableWrapper}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #2a3247" }}>
                      {["Qty", "Received", "Expiry", "Status", "Notes"].map(h => (
                        <th key={h} style={batchThStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map(b => {
                      const eb = b.expiry_date
                        ? {
                            bg:    b.status === "expired" ? "#FCEBEB" : b.status === "expiring_soon" ? "#FAEEDA" : "#EAF3DE",
                            color: b.status === "expired" ? "#A32D2D" : b.status === "expiring_soon" ? "#854F0B" : "#3B6D11",
                            label: b.status === "expired" ? "Expired" : b.status === "expiring_soon" ? `${b.days_left}d left` : "OK",
                          }
                        : { bg: "#252e40", color: "#8a93a6", label: "No expiry" };
                      return (
                        <tr key={b.batch_id} style={{ borderBottom: "1px solid #2a3247" }}>
                          <td style={batchTdStyle}>{b.quantity}</td>
                          <td style={batchTdStyle}>{b.received_date}</td>
                          <td style={{ ...batchTdStyle, color: "#8a93a6" }}>{b.expiry_date || "—"}</td>
                          <td style={batchTdStyle}>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 500,
                              padding: "3px 10px",
                              borderRadius: 10,
                              background: eb.bg,
                              color: eb.color,
                            }}>
                              {eb.label}
                            </span>
                          </td>
                          <td style={{ ...batchTdStyle, color: "#8a93a6", fontSize: 12 }}>
                            {b.notes || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <button onClick={closeAll} style={cancelBtn}>Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Expiry table sub-component ─────────────────────────────────────────────────

function ExpiryTable({ rows }) {
  return (
    <div style={tableWrapper}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
            {["Product", "Branch", "Qty", "Expiry date", "Status"].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const isExp = r.status === "expired";
            return (
              <tr key={r.batch_id} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                <td style={tdStyle}>{r.product_name}</td>
                <td style={tdStyle}>Branch {r.branch_id}</td>
                <td style={tdStyle}>{r.quantity}</td>
                <td style={tdStyle}>{r.expiry_date}</td>
                <td style={tdStyle}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "2px 8px",
                    borderRadius: 8,
                    background: isExp ? "#FCEBEB" : "#FAEEDA",
                    color:      isExp ? "#A32D2D" : "#854F0B",
                  }}>
                    {isExp ? "Expired" : `${r.days_left}d left`}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const inputStyle = {
  display: "block",
  width: "100%",
  padding: "9px 11px",
  borderRadius: 7,
  border: "1.5px solid #3a4255",
  fontSize: 13,
  background: "#1e2535",
  color: "#e8ecf2",
  boxSizing: "border-box",
  marginTop: 5,
  outline: "none",
  fontFamily: "inherit",
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 500,
  color: "#c0c7d4",
  display: "block",
};

const starStyle = {
  color: "#E24B4A",
  marginLeft: 2,
};

const hintStyle = {
  fontSize: 11,
  color: "#5a6475",
  marginTop: 4,
  display: "block",
};

const dividerStyle = {
  borderTop: "1px solid #2a3247",
  margin: "14px 0",
};

const primaryBtn = {
  padding: "10px 0",
  borderRadius: 8,
  border: "none",
  background: "#185FA5",
  color: "#fff",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const cancelBtn = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid #3a4255",
  background: "none",
  color: "#c0c7d4",
  fontSize: 13,
  cursor: "pointer",
};

const ghostBtn = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid var(--color-border-tertiary)",
  background: "none",
  fontSize: 11,
  cursor: "pointer",
  color: "var(--color-text-secondary)",
};

const restockBtnStyle = {
  padding: "4px 12px",
  borderRadius: 6,
  border: "1px solid #185FA5",
  background: "transparent",
  color: "#185FA5",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 500,
};

const refreshBtn = {
  marginLeft: "auto",
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border-tertiary)",
  background: "none",
  color: "var(--color-text-secondary)",
  cursor: "pointer",
  fontSize: 12,
};

const errorBox = {
  background: "#FCEBEB",
  color: "#A32D2D",
  borderRadius: 8,
  padding: "9px 13px",
  fontSize: 13,
  marginBottom: 4,
};

const successBox = {
  background: "#EAF3DE",
  color: "#3B6D11",
  borderRadius: 8,
  padding: "9px 13px",
  fontSize: 13,
  marginTop: 14,
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
};

const modalStyle = {
  background: "#151b28",
  borderRadius: 14,
  padding: 24,
  width: 420,
  maxHeight: "85vh",
  overflowY: "auto",
  boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
  border: "1px solid #2a3247",
};

const modalHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 16,
};

const modalTitle = {
  fontSize: 16,
  fontWeight: 600,
  margin: 0,
  color: "#e8ecf2",
};

const closeBtn = {
  background: "none",
  border: "none",
  fontSize: 22,
  cursor: "pointer",
  color: "#8a93a6",
  lineHeight: 1,
  padding: 0,
};

const infoRow = {
  display: "flex",
  justifyContent: "space-between",
  padding: "5px 0",
};

const infoLabel = {
  fontSize: 12,
  color: "#8a93a6",
};

const infoValue = {
  fontSize: 13,
  fontWeight: 500,
  color: "#e8ecf2",
};

const tableWrapper = {
  background: "var(--color-background-primary)",
  border: "1px solid var(--color-border-tertiary)",
  borderRadius: 12,
  overflow: "hidden",
};

// Batch table uses dark theme to match the modal background
const batchTableWrapper = {
  background: "#1a2133",
  border: "1px solid #2a3247",
  borderRadius: 10,
  overflow: "hidden",
};

const thStyle = {
  padding: "9px 14px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 500,
  color: "var(--color-text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

// Batch modal column headers - muted to match the dark modal
const batchThStyle = {
  padding: "9px 14px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 500,
  color: "#5a6475",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tdStyle = {
  padding: "11px 14px",
  fontSize: 13,
  color: "var(--color-text-primary)",
};

// Batch modal rows use lighter text on dark background
const batchTdStyle = {
  padding: "11px 14px",
  fontSize: 13,
  color: "#c0c7d4",
};

const emptyTd = {
  textAlign: "center",
  padding: 32,
  color: "var(--color-text-tertiary)",
  fontSize: 13,
};

const centreMsg = {
  textAlign: "center",
  padding: 40,
  color: "var(--color-text-tertiary)",
  fontSize: 13,
};