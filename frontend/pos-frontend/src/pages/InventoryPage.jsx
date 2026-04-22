import { useState, useEffect } from "react";
import { getInventory, restockProduct, getProducts } from "../api/api";

export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Restock modal state
  const [restocking, setRestocking] = useState(null);
  const [restockQty, setRestockQty] = useState("");
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

      const productMap = {};
      (prod.data || []).forEach((p) => {
        productMap[p.product_id] = p;
      });
      setProducts(productMap);

    } catch {
      setError("Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
      fetchData();

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
    <div style={pageShell}>

      {/* Header */}
      <div style={headerRow}>
        <button onClick={fetchData} style={refreshBtn}>
          ↻ Refresh
        </button>
      </div>

      {/* Error */}
      {error && <div style={errorBox}>{error}</div>}

      {/* Loading */}
      {loading && <div style={loadingState}>Loading inventory...</div>}

      {/* Table */}
      {!loading && !error && (
        <div style={tableWrapper}>
          <table style={table}>
            <thead>
              <tr style={theadRow}>
                {["Product", "Barcode", "Branch", "Stock", "Reorder level", "Status", ""].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {inventory.length === 0 ? (
                <tr>
                  <td colSpan={7} style={emptyState}>
                    No inventory records found.
                  </td>
                </tr>
              ) : (
                inventory.map((item) => {
                  const product = products[item.product_id];

                  const isLow = item.reorder_level && item.stock_quantity <= item.reorder_level;
                  const isCritical = item.stock_quantity <= 5;

                  return (
                    <tr key={item.inventory_id} style={row}>
                      <td style={td}>
                        {product?.product_name || `Product #${item.product_id}`}
                      </td>

                      <td style={barcodeCell}>
                        {product?.barcode || "—"}
                      </td>

                      <td style={td}>Branch {item.branch_id}</td>

                      <td style={{ ...td, fontWeight: 500 }}>
                        {item.stock_quantity}
                      </td>

                      <td style={secondaryText}>
                        {item.reorder_level ?? "—"}
                      </td>

                      <td style={td}>
                        <span
                          style={{
                            ...statusBadge,
                            background: isCritical
                              ? "var(--color-error-bg)"
                              : isLow
                              ? "var(--color-warning-bg)"
                              : "var(--color-success-bg)",
                            color: isCritical
                              ? "var(--color-error-text)"
                              : isLow
                              ? "var(--color-warning-text)"
                              : "var(--color-success-text)",
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

      {/* Modal */}
      {restocking && (
        <div style={overlayStyle}>
          <div style={modalStyle}>

            <div style={modalHeader}>
              <h2 style={modalTitle}>Restock product</h2>
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
              <span style={infoValue}>
                {restocking.stock_quantity} units
              </span>
            </div>

            {restockSuccess ? (
              <div style={successBox}>{restockSuccess}</div>
            ) : (
              <>
                <div style={{ marginTop: 16 }}>
                  <label style={labelStyle}>Quantity to add</label>
                  <input
                    type="number"
                    min="1"
                    value={restockQty}
                    onChange={(e) => setRestockQty(e.target.value)}
                    placeholder="e.g. 50"
                    style={inputStyle}
                  />
                </div>

                {restockError && <div style={errorBox}>{restockError}</div>}

                <button
                  onClick={handleRestock}
                  disabled={restockLoading}
                  style={{
                    ...confirmBtn,
                    background: "var(--color-primary)",
                    color: "#fff",
                    opacity: restockLoading ? 0.6 : 1,
                    cursor: restockLoading ? "not-allowed" : "pointer",
                    marginTop: 14,
                  }}
                >
                  {restockLoading ? "Restocking..." : "Confirm restock"}
                </button>
              </>
            )}

            <button onClick={closeModal} style={secondaryBtn}>
              {restockSuccess ? "Close" : "Cancel"}
            </button>

          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- STYLES ---------------- */

const pageShell = {
  padding: "16px 24px",
  height: "100%",
  overflowY: "auto",
};

const headerRow = {
  display: "flex",
  justifyContent: "flex-end",
  marginBottom: 16,
};

const tableWrapper = {
  background: "var(--color-background-primary)",
  border: "1px solid var(--color-border-tertiary)",
  borderRadius: 12,
  overflow: "hidden",
};

const table = { width: "100%", borderCollapse: "collapse" };

const theadRow = { borderBottom: "1px solid var(--color-border-tertiary)" };

const row = { borderBottom: "1px solid var(--color-border-tertiary)" };

const th = {
  padding: "10px 14px",
  fontSize: 11,
  textTransform: "uppercase",
  color: "var(--color-text-secondary)",
  textAlign: "left",
};

const td = {
  padding: "12px 14px",
  fontSize: 13,
  color: "var(--color-text-primary)",
};

const barcodeCell = {
  ...td,
  fontSize: 12,
  color: "var(--color-text-tertiary)",
};

const secondaryText = {
  ...td,
  color: "var(--color-text-secondary)",
};

const emptyState = {
  textAlign: "center",
  padding: 32,
  color: "var(--color-text-tertiary)",
};

const loadingState = {
  textAlign: "center",
  padding: 40,
  color: "var(--color-text-tertiary)",
};

const errorBox = {
  background: "var(--color-error-bg)",
  color: "var(--color-error-text)",
  padding: "10px 14px",
  borderRadius: 8,
  marginBottom: 14,
};

const successBox = {
  background: "var(--color-success-bg)",
  color: "var(--color-success-text)",
  padding: "10px 14px",
  borderRadius: 8,
  marginTop: 14,
};

const statusBadge = {
  fontSize: 11,
  padding: "3px 9px",
  borderRadius: 10,
  fontWeight: 500,
};

const refreshBtn = {
  padding: "7px 14px",
  borderRadius: 8,
  border: "1px solid var(--color-border-secondary)",
  background: "none",
  color: "var(--color-text-secondary)",
  cursor: "pointer",
};

const restockBtn = {
  padding: "5px 12px",
  borderRadius: 7,
  border: "1px solid var(--color-primary)",
  background: "transparent",
  color: "var(--color-primary)",
  cursor: "pointer",
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const modalStyle = {
  background: "var(--color-background-primary)",
  borderRadius: 14,
  padding: 24,
  width: "100%",
  maxWidth: 380,
};

const modalHeader = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 16,
};

const modalTitle = {
  fontSize: 16,
  color: "var(--color-text-primary)",
};

const closeBtn = {
  border: "none",
  background: "none",
  fontSize: 22,
  cursor: "pointer",
};

const infoRow = {
  display: "flex",
  justifyContent: "space-between",
  padding: "6px 0",
};

const infoLabel = {
  fontSize: 12,
  color: "var(--color-text-secondary)",
};

const infoValue = {
  fontSize: 13,
  fontWeight: 500,
};

const labelStyle = {
  fontSize: 12,
  color: "var(--color-text-secondary)",
};

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border-secondary)",
  marginTop: 6,
};

const confirmBtn = {
  width: "100%",
  padding: "11px 0",
  borderRadius: 10,
  border: "none",
  fontWeight: 500,
};

const secondaryBtn = {
  width: "100%",
  marginTop: 8,
  padding: "11px 0",
  borderRadius: 10,
  border: "1px solid var(--color-border-secondary)",
  background: "none",
  color: "var(--color-text-secondary)",
  cursor: "pointer",
};