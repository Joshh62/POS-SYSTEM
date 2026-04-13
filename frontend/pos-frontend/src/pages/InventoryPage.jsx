import { useState, useEffect } from "react";
import { getInventory, restockProduct, getProducts } from "../api/api";

export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [products, setProducts]   = useState({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  // Restock modal state
  const [restocking, setRestocking]     = useState(null); // holds inventory item
  const [restockQty, setRestockQty]     = useState("");
  const [restockLoading, setRestockLoading] = useState(false);
  const [restockError, setRestockError] = useState(null);
  const [restockSuccess, setRestockSuccess] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [inv, prod] = await Promise.all([
        getInventory(),
        getProducts(1, 100),
      ]);
      setInventory(inv);

      // Build a product_id → product map for quick lookup
      const productMap = {};
      (prod.data || []).forEach((p) => { productMap[p.product_id] = p; });
      setProducts(productMap);
    } catch (err) {
      setError("Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleRestock = async () => {
    if (!restockQty || Number(restockQty) <= 0) {
      setRestockError("Enter a valid quantity.");
      return;
    }
    setRestockLoading(true);
    setRestockError(null);
    try {
      await restockProduct({
        product_id: restocking.product_id,
        branch_id: restocking.branch_id,
        quantity: Number(restockQty),
      });
      setRestockSuccess(`Added ${restockQty} units successfully.`);
      setRestockQty("");
      fetchData(); // refresh table
    } catch (err) {
      setRestockError(err.response?.data?.detail || "Restock failed.");
    } finally {
      setRestockLoading(false);
    }
  };

  const closeModal = () => {
    setRestocking(null);
    setRestockQty("");
    setRestockError(null);
    setRestockSuccess(null);
  };

  return (
    <div style={{ padding: "16px 24px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={fetchData} style={refreshBtn}>↻ Refresh</button>
      </div>

      {/* Error */}
      {error && (
        <div style={errorBox}>{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-tertiary)", fontSize: 13 }}>
          Loading inventory...
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div
          style={{
            background: "var(--color-background-primary)",
            border: "1px solid var(--color-border-tertiary)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                {["Product", "Barcode", "Branch", "Stock", "Reorder level", "Status", ""].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inventory.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 }}>
                    No inventory records found.
                  </td>
                </tr>
              ) : (
                inventory.map((item) => {
                  const product = products[item.product_id];
                  const isLow = item.reorder_level && item.stock_quantity <= item.reorder_level;
                  const isCritical = item.stock_quantity <= 5;

                  return (
                    <tr
                      key={item.inventory_id}
                      style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}
                    >
                      <td style={td}>{product?.product_name || `Product #${item.product_id}`}</td>
                      <td style={{ ...td, color: "var(--color-text-tertiary)", fontSize: 12 }}>
                        {product?.barcode || "—"}
                      </td>
                      <td style={td}>Branch {item.branch_id}</td>
                      <td style={{ ...td, fontWeight: 500 }}>{item.stock_quantity}</td>
                      <td style={{ ...td, color: "var(--color-text-secondary)" }}>
                        {item.reorder_level ?? "—"}
                      </td>
                      <td style={td}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "3px 9px",
                            borderRadius: 10,
                            background: isCritical ? "#FCEBEB" : isLow ? "#FAEEDA" : "#EAF3DE",
                            color: isCritical ? "#A32D2D" : isLow ? "#854F0B" : "#3B6D11",
                          }}
                        >
                          {isCritical ? "Critical" : isLow ? "Low" : "OK"}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <button
                          onClick={() => setRestocking(item)}
                          style={restockBtn}
                        >
                          Restock
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Restock modal */}
      {restocking && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>
                Restock product
              </h2>
              <button onClick={closeModal} style={closeBtn}>×</button>
            </div>

            <div style={infoRow}>
              <span style={infoLabel}>Product</span>
              <span style={infoValue}>
                {products[restocking.product_id]?.product_name || `#${restocking.product_id}`}
              </span>
            </div>
            <div style={infoRow}>
              <span style={infoLabel}>Current stock</span>
              <span style={infoValue}>{restocking.stock_quantity} units</span>
            </div>

            {restockSuccess ? (
              <div style={{ background: "#EAF3DE", color: "#3B6D11", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginTop: 14 }}>
                {restockSuccess}
              </div>
            ) : (
              <>
                <div style={{ marginTop: 16, marginBottom: 6 }}>
                  <label style={labelStyle}>Quantity to add</label>
                  <input
                    type="number"
                    min="1"
                    value={restockQty}
                    onChange={(e) => setRestockQty(e.target.value)}
                    placeholder="e.g. 50"
                    style={inputStyle}
                    autoFocus
                  />
                </div>

                {restockError && (
                  <div style={errorBox}>{restockError}</div>
                )}

                <button
                  onClick={handleRestock}
                  disabled={restockLoading}
                  style={{
                    ...confirmBtn,
                    background: restockLoading ? "var(--color-background-secondary)" : "#185FA5",
                    color: restockLoading ? "var(--color-text-tertiary)" : "#E6F1FB",
                    cursor: restockLoading ? "not-allowed" : "pointer",
                    marginTop: 14,
                  }}
                >
                  {restockLoading ? "Restocking..." : "Confirm restock"}
                </button>
              </>
            )}

            <button onClick={closeModal} style={{ ...confirmBtn, background: "none", border: "1px solid var(--color-border-secondary)", color: "var(--color-text-secondary)", marginTop: 8, cursor: "pointer" }}>
              {restockSuccess ? "Close" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------
// STYLES
// ------------------------------------
const h1 = { fontSize: 20, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 };
const sub = { fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 };
const th = { padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" };
const td = { padding: "12px 14px", fontSize: 13, color: "var(--color-text-primary)" };
const errorBox = { background: "#FCEBEB", color: "#A32D2D", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 };
const refreshBtn = { padding: "7px 14px", borderRadius: 8, border: "1px solid var(--color-border-secondary)", background: "none", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer" };
const restockBtn = { padding: "5px 12px", borderRadius: 7, border: "1px solid #185FA5", background: "none", color: "#185FA5", fontSize: 12, cursor: "pointer" };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modalStyle = { background: "var(--color-background-primary)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", border: "1px solid var(--color-border-secondary)" };
const closeBtn = { background: "none", border: "none", fontSize: 22, color: "var(--color-text-secondary)", cursor: "pointer", padding: 0, lineHeight: 1 };
const infoRow = { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--color-border-tertiary)" };
const infoLabel = { fontSize: 12, color: "var(--color-text-secondary)" };
const infoValue = { fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" };
const labelStyle = { display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 6 };
const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14, outline: "none", boxSizing: "border-box" };
const confirmBtn = { width: "100%", padding: "11px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 500 };