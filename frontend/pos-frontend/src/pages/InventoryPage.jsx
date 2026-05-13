import { useState, useEffect, useRef } from "react";
import {
  getInventory,
  restockProduct,
  getProducts,
  updateReorderLevel,
  getExpiringBatches,
  getProductBatches,
} from "../api/api";
import api from "../api/api";
import { getActiveBranchParam } from "../api/api";
import { useBranch } from "../context/BranchContext";

const TABS = ["Stock levels", "Receive stock", "Expiry alerts", "Bulk restock"];

export default function InventoryPage() {
  const { activeBranchId } = useBranch();

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin     = ["admin", "superadmin"].includes(currentUser.role);

  const [activeTab, setActiveTab] = useState("Stock levels");
  const [inventory, setInventory] = useState([]);
  const [products,  setProducts]  = useState({});
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const [expiryData,    setExpiryData]    = useState(null);
  const [expiryLoading, setExpiryLoading] = useState(false);

  const [restocking,     setRestocking]     = useState(null);
  const [restockQty,     setRestockQty]     = useState("");
  const [restockExpiry,  setRestockExpiry]  = useState("");
  const [restockNotes,   setRestockNotes]   = useState("");
  const [restockLoading, setRestockLoading] = useState(false);
  const [restockError,   setRestockError]   = useState(null);
  const [restockSuccess, setRestockSuccess] = useState(null);

  const [editingReorder,   setEditingReorder]   = useState(null);
  const [reorderLevel,     setReorderLevel]     = useState("");
  const [expiryAlertDays,  setExpiryAlertDays]  = useState("");
  const [reorderLoading,   setReorderLoading]   = useState(false);
  const [reorderError,     setReorderError]     = useState(null);
  const [reorderSuccess,   setReorderSuccess]   = useState(null);

  const [viewingBatches, setViewingBatches] = useState(null);
  const [batches,        setBatches]        = useState([]);
  const [batchLoading,   setBatchLoading]   = useState(false);

  // ── Bulk restock ──────────────────────────────────────────────────────────
  const [bulkFile,     setBulkFile]     = useState(null);
  const [bulkDragging, setBulkDragging] = useState(false);
  const [bulkLoading,  setBulkLoading]  = useState(false);
  const [bulkResult,   setBulkResult]   = useState(null);
  const [bulkError,    setBulkError]    = useState(null);
  const bulkInputRef = useRef();

  // ── Receive stock state ───────────────────────────────────────────────────
  const [branches,       setBranches]       = useState([]);
  const [receiveBranch,  setReceiveBranch]  = useState(activeBranchId || currentUser.branch_id || "");
  const [suppliers,      setSuppliers]      = useState([]);
  const [barcodeInput,   setBarcodeInput]   = useState("");
  const [scannedProduct, setScannedProduct] = useState(null);
  const [scanError,      setScanError]      = useState(null);
  const [scanLoading,    setScanLoading]    = useState(false);
  const [receiveQty,     setReceiveQty]     = useState("");
  const [receiveExpiry,  setReceiveExpiry]  = useState("");
  const [receiveNotes,   setReceiveNotes]   = useState("");
  const [receiveSupplierId, setReceiveSupplierId] = useState("");
  const [receiveLoading, setReceiveLoading] = useState(false);
  const [receiveError,   setReceiveError]   = useState(null);
  const [receiveHistory, setReceiveHistory] = useState([]);  // last 5 received in this session
  const barcodeInputRef = useRef();

  // ── Sync receiveBranch when activeBranchId changes ────────────────────────
  useEffect(() => {
    if (!isAdmin) setReceiveBranch(activeBranchId || currentUser.branch_id || "");
  }, [activeBranchId]);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const [inv, prod] = await Promise.all([getInventory(), getProducts(1, 500)]);
      setInventory(Array.isArray(inv) ? inv : []);
      const map = {};
      (prod.data || []).forEach(p => { map[p.product_id] = p; });
      setProducts(map);
    } catch { setError("Failed to load inventory."); }
    finally { setLoading(false); }
  };

  const fetchExpiry = async () => {
    setExpiryLoading(true);
    try { setExpiryData(await getExpiringBatches()); }
    catch { setExpiryData({ expired: [], expiring_soon: [], total_alerts: 0 }); }
    finally { setExpiryLoading(false); }
  };

  // Fetch branches and suppliers for Receive stock tab
  const fetchReceiveData = async () => {
    try {
      const [bRes, sRes] = await Promise.all([
        api.get(`/businesses/${currentUser.business_id}/branches`).then(r => r.data).catch(() => []),
        api.get("/suppliers/").then(r => r.data).catch(() => []),
      ]);
      setBranches(Array.isArray(bRes) ? bRes : []);
      setSuppliers(Array.isArray(sRes) ? sRes : []);

      // Default to active branch for admin if not set
      if (isAdmin && !receiveBranch && bRes.length > 0) {
        setReceiveBranch(bRes[0].branch_id);
      }
    } catch { /* silent */ }
  };

  useEffect(() => { fetchData(); }, [activeBranchId]);
  useEffect(() => { if (activeTab === "Expiry alerts") fetchExpiry(); }, [activeTab, activeBranchId]);
  useEffect(() => { if (activeTab === "Receive stock") { fetchReceiveData(); setTimeout(() => barcodeInputRef.current?.focus(), 100); } }, [activeTab]);

  // ── Barcode scan / lookup ─────────────────────────────────────────────────
  const lookupBarcode = async (barcode) => {
    if (!barcode.trim()) return;
    setScanLoading(true); setScanError(null); setScannedProduct(null);
    setReceiveQty(""); setReceiveExpiry(""); setReceiveNotes("");
    try {
      const res = await api.get(`/products/barcode/${barcode.trim()}`);
      setScannedProduct(res.data);
      // Pre-fill supplier if product has one
      setReceiveSupplierId(res.data.supplier_id ? String(res.data.supplier_id) : "");
      // Focus qty input
      setTimeout(() => document.getElementById("receive-qty-input")?.focus(), 100);
    } catch {
      setScanError(`No product found for barcode: ${barcode.trim()}`);
    } finally { setScanLoading(false); }
  };

  const handleBarcodeKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      lookupBarcode(barcodeInput);
      setBarcodeInput("");
    }
  };

  const handleConfirmReceive = async () => {
    if (!scannedProduct) return;
    if (!receiveQty || parseInt(receiveQty) <= 0) { setReceiveError("Enter a valid quantity."); return; }
    if (!receiveBranch) { setReceiveError("Select a branch."); return; }

    setReceiveLoading(true); setReceiveError(null);
    try {
      await restockProduct({
        product_id:  scannedProduct.product_id,
        branch_id:   parseInt(receiveBranch),
        quantity:    parseInt(receiveQty),
        expiry_date: receiveExpiry || null,
        notes:       receiveNotes
          ? `${receiveNotes}${receiveSupplierId ? ` (Supplier: ${suppliers.find(s => s.supplier_id == receiveSupplierId)?.supplier_name || ""})` : ""}`
          : receiveSupplierId
            ? `From: ${suppliers.find(s => s.supplier_id == receiveSupplierId)?.supplier_name || "supplier"}`
            : null,
      });

      // Add to session history
      setReceiveHistory(h => [{
        product_name: scannedProduct.product_name,
        barcode:      scannedProduct.barcode,
        quantity:     parseInt(receiveQty),
        supplier:     suppliers.find(s => s.supplier_id == receiveSupplierId)?.supplier_name || null,
        time:         new Date().toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" }),
      }, ...h].slice(0, 10));

      // Reset for next scan
      setScannedProduct(null); setBarcodeInput("");
      setReceiveQty(""); setReceiveExpiry(""); setReceiveNotes("");
      setReceiveSupplierId("");
      fetchData();

      // Refocus barcode input for rapid scanning
      setTimeout(() => barcodeInputRef.current?.focus(), 100);

    } catch (err) {
      setReceiveError(err.response?.data?.detail || "Restock failed.");
    } finally { setReceiveLoading(false); }
  };

  // ── Existing modal handlers ───────────────────────────────────────────────
  const openRestock = (item) => {
    setRestocking(item);
    setRestockQty(""); setRestockExpiry(""); setRestockNotes("");
    setRestockError(null); setRestockSuccess(null);
  };

  const handleRestock = async () => {
    if (!restockQty || Number(restockQty) <= 0) { setRestockError("Enter a valid quantity."); return; }
    setRestockLoading(true); setRestockError(null);
    try {
      await restockProduct({
        product_id:  restocking.product_id,
        branch_id:   restocking.branch_id,
        quantity:    Number(restockQty),
        expiry_date: restockExpiry || null,
        notes:       restockNotes  || null,
      });
      setRestockSuccess(`Added ${restockQty} units successfully.`);
      setRestockQty(""); setRestockExpiry(""); setRestockNotes("");
      fetchData();
    } catch (err) { setRestockError(err.response?.data?.detail || "Restock failed."); }
    finally { setRestockLoading(false); }
  };

  const openReorder = (item) => {
    setEditingReorder(item);
    setReorderLevel(String(item.reorder_level ?? 5));
    setExpiryAlertDays(String(item.expiry_alert_days ?? 90));
    setReorderError(null); setReorderSuccess(null);
  };

  const handleReorderSave = async () => {
    if (!reorderLevel || Number(reorderLevel) < 0) { setReorderError("Enter a valid reorder level."); return; }
    setReorderLoading(true); setReorderError(null);
    try {
      await updateReorderLevel({
        product_id:        editingReorder.product_id,
        branch_id:         editingReorder.branch_id,
        reorder_level:     Number(reorderLevel),
        expiry_alert_days: expiryAlertDays ? Number(expiryAlertDays) : undefined,
      });
      setReorderSuccess("Settings updated.");
      fetchData();
    } catch (err) { setReorderError(err.response?.data?.detail || "Update failed."); }
    finally { setReorderLoading(false); }
  };

  const openBatches = async (item) => {
    setViewingBatches(item); setBatches([]); setBatchLoading(true);
    try { setBatches(Array.isArray(await getProductBatches(item.product_id)) ? await getProductBatches(item.product_id) : []); }
    catch { setBatches([]); }
    finally { setBatchLoading(false); }
  };

  const closeAll = () => {
    setRestocking(null); setEditingReorder(null); setViewingBatches(null);
    setRestockSuccess(null); setReorderSuccess(null);
  };

  const statusBadge = (item) => {
    if (item.stock_quantity <= 0)                            return { bg: "#FCEBEB", color: "#A32D2D", label: "Out of stock" };
    if (item.stock_quantity <= (item.reorder_level ?? 5))   return { bg: "#FAEEDA", color: "#854F0B", label: "Low" };
    return { bg: "#EAF3DE", color: "#3B6D11", label: "OK" };
  };

  const handleBulkFile = (f) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".csv")) { setBulkError("Only .csv files are supported."); return; }
    setBulkFile(f); setBulkError(null); setBulkResult(null);
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) return;
    setBulkLoading(true); setBulkError(null); setBulkResult(null);
    try {
      const formData = new FormData();
      formData.append("file", bulkFile);
      const res = await api.post("/inventory/bulk-restock", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        params:  getActiveBranchParam(),
      });
      setBulkResult(res.data); setBulkFile(null); fetchData();
    } catch (err) { setBulkError(err.response?.data?.detail || "Bulk restock failed."); }
    finally { setBulkLoading(false); }
  };

  const downloadBulkTemplate = async () => {
    let productList = Object.values(products);
    if (productList.length === 0) {
      try { const prod = await getProducts(1, 500); productList = prod.data || []; }
      catch { /* fall through */ }
    }
    const sampleExpiry = new Date();
    sampleExpiry.setFullYear(sampleExpiry.getFullYear() + 1);
    const sampleExpiryStr = sampleExpiry.toISOString().split("T")[0];
    const rows = productList.length > 0
      ? ["product_name,barcode,quantity,expiry_date,notes",
          ...productList.map(p => `"${(p.product_name||"").replace(/"/g,'""')}",${p.barcode},0,,`)]
      : ["product_name,barcode,quantity,expiry_date,notes",
          `"Men Vintage Shirt",1,15,,`, `"Nike Sneakers",9,5,${sampleExpiryStr},Batch A`];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "bulk_restock_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Active branch display name ─────────────────────────────────────────────
  const activeBranchName = branches.find(b => b.branch_id == receiveBranch)?.branch_name
    || (receiveBranch ? `Branch ${receiveBranch}` : "No branch selected");

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--color-border-tertiary)" }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: "8px 14px", border: "none", background: "none", fontSize: 13, cursor: "pointer",
            fontWeight: activeTab === tab ? 500 : 400,
            color: activeTab === tab ? "#185FA5" : "var(--color-text-secondary)",
            borderBottom: activeTab === tab ? "2px solid #185FA5" : "2px solid transparent",
            marginBottom: -1,
          }}>
            {tab}
            {tab === "Expiry alerts" && expiryData?.total_alerts > 0 && (
              <span style={{ marginLeft: 6, background: "#FCEBEB", color: "#A32D2D", fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 8 }}>
                {expiryData.total_alerts}
              </span>
            )}
          </button>
        ))}
        <button onClick={fetchData} style={refreshBtn}>↻ Refresh</button>
      </div>

      {/* ── Stock levels ── */}
      {activeTab === "Stock levels" && (
        <>
          {error   && <div style={errorBox}>{error}</div>}
          {loading && <div style={centreMsg}>Loading inventory...</div>}
          {!loading && !error && (
            <div style={tableWrapper}>
              <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
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
                          <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 10, background: sb.bg, color: sb.color }}>
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
            </div>
          )}
        </>
      )}

      {/* ── Receive stock ── */}
      {activeTab === "Receive stock" && (
        <div style={{ maxWidth: 580 }}>

          {/* Branch selector — admin only */}
          {isAdmin && (
            <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>Receiving into:</span>
              <select
                value={receiveBranch}
                onChange={e => setReceiveBranch(e.target.value)}
                style={{ ...inputStyle, marginTop: 0, flex: 1, maxWidth: 240 }}
              >
                <option value="">— Select branch —</option>
                {branches.map(b => (
                  <option key={b.branch_id} value={b.branch_id}>{b.branch_name || b.name || `Branch ${b.branch_id}`}</option>
                ))}
              </select>
            </div>
          )}

          {/* Branch indicator — manager */}
          {!isAdmin && (
            <div style={{ marginBottom: 14, fontSize: 12, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 6, padding: "4px 10px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                📦 {activeBranchName}
              </span>
              <span>— stock will be added to this branch</span>
            </div>
          )}

          {/* Barcode scan input */}
          <div style={infoCard}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 10 }}>
              🔍 Scan or enter barcode
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Scan barcode or type and press Enter..."
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
                style={{ ...inputStyle, marginTop: 0, flex: 1 }}
                autoComplete="off"
              />
              <button
                onClick={() => { lookupBarcode(barcodeInput); setBarcodeInput(""); }}
                disabled={scanLoading || !barcodeInput.trim()}
                style={{ ...primaryBtn, padding: "0 16px", opacity: (!barcodeInput.trim() || scanLoading) ? 0.5 : 1 }}
              >
                {scanLoading ? "..." : "Find"}
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 6 }}>
              Works with USB or Bluetooth barcode scanners — scanner input is detected automatically on Enter.
            </div>
          </div>

          {scanError && <div style={{ ...errorBox, marginBottom: 14 }}>{scanError}</div>}

          {/* Product found — receive form */}
          {scannedProduct && (
            <div style={{ ...infoCard, borderColor: "rgba(24,95,165,0.3)" }}>

              {/* Product info */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
                    {scannedProduct.product_name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 3, display: "flex", gap: 10 }}>
                    <span style={{ fontFamily: "monospace" }}>{scannedProduct.barcode}</span>
                    {scannedProduct.supplier?.supplier_name && (
                      <span>🚚 {scannedProduct.supplier.supplier_name}</span>
                    )}
                  </div>
                </div>
                <button onClick={() => { setScannedProduct(null); setScanError(null); setTimeout(() => barcodeInputRef.current?.focus(), 100); }}
                  style={{ background: "none", border: "none", fontSize: 18, color: "var(--color-text-tertiary)", cursor: "pointer" }}>×</button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                {/* Quantity */}
                <div>
                  <label style={labelStyle}>Quantity received <span style={starStyle}>*</span></label>
                  <input
                    id="receive-qty-input"
                    type="number" min="1"
                    value={receiveQty}
                    onChange={e => setReceiveQty(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleConfirmReceive(); }}
                    placeholder="e.g. 50"
                    style={inputStyle}
                    autoFocus
                  />
                </div>

                {/* Supplier */}
                <div>
                  <label style={labelStyle}>Supplier (optional)</label>
                  <select value={receiveSupplierId} onChange={e => setReceiveSupplierId(e.target.value)} style={inputStyle}>
                    <option value="">— No supplier —</option>
                    {suppliers.map(s => (
                      <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>
                    ))}
                  </select>
                </div>

                {/* Expiry date */}
                <div>
                  <label style={labelStyle}>Expiry date</label>
                  <input type="date" value={receiveExpiry} onChange={e => setReceiveExpiry(e.target.value)} style={inputStyle} />
                  <span style={hintStyle}>Leave blank for clothing, accessories, or products with no expiry.</span>
                </div>

                {/* Notes */}
                <div>
                  <label style={labelStyle}>Notes (optional)</label>
                  <input type="text" value={receiveNotes} onChange={e => setReceiveNotes(e.target.value)}
                    placeholder="e.g. Batch from Kano market" style={inputStyle} />
                </div>
              </div>

              {receiveError && <div style={{ ...errorBox, marginTop: 10 }}>{receiveError}</div>}

              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => { setScannedProduct(null); setTimeout(() => barcodeInputRef.current?.focus(), 100); }}
                  style={{ ...cancelBtn, flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReceive}
                  disabled={receiveLoading || !receiveQty}
                  style={{ ...primaryBtn, flex: 2, padding: "10px 0", opacity: (receiveLoading || !receiveQty) ? 0.6 : 1 }}
                >
                  {receiveLoading ? "Adding stock..." : `✓ Receive ${receiveQty || ""}${receiveQty ? " units" : ""}`}
                </button>
              </div>
            </div>
          )}

          {/* Session history */}
          {receiveHistory.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Received this session
              </div>
              <div style={tableWrapper}>
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                      <th style={thStyle}>Product</th>
                      <th style={thStyle}>Barcode</th>
                      <th style={thStyle}>Supplier</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Qty added</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiveHistory.map((h, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                        <td style={tdStyle}>{h.product_name}</td>
                        <td style={{ ...tdStyle, fontSize: 11, color: "var(--color-text-tertiary)", fontFamily: "monospace" }}>{h.barcode}</td>
                        <td style={{ ...tdStyle, fontSize: 12, color: "var(--color-text-secondary)" }}>{h.supplier || "—"}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: "#3B6D11" }}>+{h.quantity}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontSize: 11, color: "var(--color-text-tertiary)" }}>{h.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Expiry alerts ── */}
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

      {/* ── Bulk restock ── */}
      {activeTab === "Bulk restock" && (
        <div style={{ maxWidth: 640 }}>
          <div style={infoCard}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--color-text-primary)" }}>
              📦 How to bulk restock
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 2.2 }}>
              <li>Download the template — pre-filled with all your product names and barcodes</li>
              <li>Fill in the <strong style={{ color: "var(--color-text-primary)" }}>quantity</strong> column for each product to restock</li>
              <li>Enter <strong style={{ color: "var(--color-text-primary)" }}>expiry_date</strong> in <code style={{ background: "var(--color-background-secondary)", padding: "1px 6px", borderRadius: 4, fontSize: 12 }}>YYYY-MM-DD</code> format if applicable</li>
              <li>Leave <strong style={{ color: "var(--color-text-primary)" }}>expiry_date</strong> blank for clothing or products with no expiry</li>
              <li>Delete rows you don't want to restock, save as <strong style={{ color: "var(--color-text-primary)" }}>.csv</strong> and upload</li>
            </ol>
            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={greyBadge}>product_name (reference)</span>
              <span style={requiredBadge}>barcode *</span>
              <span style={requiredBadge}>quantity *</span>
              <span style={optionalBadge}>expiry_date</span>
              <span style={optionalBadge}>notes</span>
            </div>
            <button onClick={downloadBulkTemplate} style={{ ...outlineBtn, marginTop: 14 }}>
              ⬇ Download template (.csv)
            </button>
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setBulkDragging(true); }}
            onDragLeave={() => setBulkDragging(false)}
            onDrop={e => { e.preventDefault(); setBulkDragging(false); handleBulkFile(e.dataTransfer.files[0]); }}
            onClick={() => bulkInputRef.current?.click()}
            style={{ border: `2px dashed ${bulkDragging ? "#185FA5" : "var(--color-border-tertiary)"}`, borderRadius: 12, padding: "40px 24px", textAlign: "center", cursor: "pointer", background: bulkDragging ? "rgba(24,95,165,0.04)" : "var(--color-background-primary)", transition: "all 0.2s", marginBottom: 16 }}
          >
            <input ref={bulkInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => handleBulkFile(e.target.files[0])} />
            <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
            {bulkFile ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{bulkFile.name}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>{(bulkFile.size/1024).toFixed(1)} KB · Click to change</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>Drop your CSV here or click to browse</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>Only .csv files supported</div>
              </>
            )}
          </div>

          {bulkError && <div style={errorBox}>{bulkError}</div>}

          {bulkFile && !bulkResult && (
            <button onClick={handleBulkUpload} disabled={bulkLoading}
              style={{ ...primaryBtn, width: "100%", padding: "11px 0", opacity: bulkLoading ? 0.7 : 1 }}>
              {bulkLoading ? "Restocking products..." : `Restock from ${bulkFile.name}`}
            </button>
          )}

          {bulkResult && (
            <div style={{ ...infoCard, borderColor: "#3B6D11", background: "#EAF3DE" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#3B6D11", marginBottom: 12 }}>✅ Bulk restock complete</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                <StatBox label="Restocked" value={bulkResult.restocked ?? 0} color="#3B6D11" />
                <StatBox label="Skipped"   value={bulkResult.skipped   ?? 0} color="#854F0B" />
                <StatBox label="Errors"    value={bulkResult.errors?.length ?? 0} color="#A32D2D" />
              </div>
              {bulkResult.errors?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#A32D2D", marginBottom: 6 }}>Rows with errors:</div>
                  {bulkResult.errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: "#A32D2D", padding: "3px 0" }}>• {e}</div>)}
                </div>
              )}
              <button onClick={() => { setBulkResult(null); setBulkFile(null); }} style={{ ...primaryBtn, marginTop: 14 }}>Restock another file</button>
            </div>
          )}
        </div>
      )}

      {/* ── Restock modal (from stock levels) ── */}
      {restocking && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeader}>
              <h2 style={modalTitle}>Restock product</h2>
              <button onClick={closeAll} style={closeBtn}>×</button>
            </div>
            <div style={infoRow}><span style={infoLabel}>Product</span><span style={infoValue}>{products[restocking.product_id]?.product_name || `#${restocking.product_id}`}</span></div>
            <div style={infoRow}><span style={infoLabel}>Current stock</span><span style={infoValue}>{restocking.stock_quantity} units</span></div>
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
                    <input type="number" min="1" value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="e.g. 50" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Expiry date</label>
                    <input type="date" value={restockExpiry} onChange={e => setRestockExpiry(e.target.value)} style={inputStyle} />
                    <span style={hintStyle}>Leave blank if no expiry date</span>
                  </div>
                  <div>
                    <label style={labelStyle}>Notes (optional)</label>
                    <input type="text" value={restockNotes} onChange={e => setRestockNotes(e.target.value)} placeholder="e.g. Batch from Supplier A" style={inputStyle} />
                  </div>
                </div>
                {restockError && <div style={{ ...errorBox, marginTop: 12 }}>{restockError}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                  <button onClick={closeAll} style={{ ...cancelBtn, flex: 1 }}>Cancel</button>
                  <button onClick={handleRestock} disabled={restockLoading} style={{ ...primaryBtn, flex: 2, opacity: restockLoading ? 0.7 : 1 }}>
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
            <div style={infoRow}><span style={infoLabel}>Product</span><span style={infoValue}>{products[editingReorder.product_id]?.product_name || `#${editingReorder.product_id}`}</span></div>
            <div style={infoRow}><span style={infoLabel}>Branch</span><span style={infoValue}>Branch {editingReorder.branch_id}</span></div>
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
                    <input type="number" min="0" value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} style={inputStyle} />
                    <span style={hintStyle}>Alert when stock falls to or below this number</span>
                  </div>
                  <div>
                    <label style={labelStyle}>Expiry alert threshold (days)</label>
                    <input type="number" min="1" value={expiryAlertDays} onChange={e => setExpiryAlertDays(e.target.value)} style={inputStyle} />
                    <span style={hintStyle}>Alert when a batch expires within this many days (default: 90)</span>
                  </div>
                </div>
                {reorderError && <div style={{ ...errorBox, marginTop: 12 }}>{reorderError}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                  <button onClick={closeAll} style={{ ...cancelBtn, flex: 1 }}>Cancel</button>
                  <button onClick={handleReorderSave} disabled={reorderLoading} style={{ ...primaryBtn, flex: 2, opacity: reorderLoading ? 0.7 : 1 }}>
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
              <h2 style={modalTitle}>Batches — {products[viewingBatches.product_id]?.product_name || `#${viewingBatches.product_id}`}</h2>
              <button onClick={closeAll} style={closeBtn}>×</button>
            </div>
            {batchLoading ? (
              <div style={centreMsg}>Loading batches...</div>
            ) : batches.length === 0 ? (
              <div style={{ ...centreMsg, padding: 24 }}>No batch records found.</div>
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
                        ? { bg: b.status==="expired"?"#FCEBEB":b.status==="expiring_soon"?"#FAEEDA":"#EAF3DE", color: b.status==="expired"?"#A32D2D":b.status==="expiring_soon"?"#854F0B":"#3B6D11", label: b.status==="expired"?"Expired":b.status==="expiring_soon"?`${b.days_left}d left`:"OK" }
                        : { bg: "#252e40", color: "#8a93a6", label: "No expiry" };
                      return (
                        <tr key={b.batch_id} style={{ borderBottom: "1px solid #2a3247" }}>
                          <td style={batchTdStyle}>{b.quantity}</td>
                          <td style={batchTdStyle}>{b.received_date}</td>
                          <td style={{ ...batchTdStyle, color: "#8a93a6" }}>{b.expiry_date || "—"}</td>
                          <td style={batchTdStyle}>
                            <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 10, background: eb.bg, color: eb.color }}>{eb.label}</span>
                          </td>
                          <td style={{ ...batchTdStyle, color: "#8a93a6", fontSize: 12 }}>{b.notes || "—"}</td>
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

function ExpiryTable({ rows }) {
  return (
    <div style={tableWrapper}>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", minWidth: 500, borderCollapse: "collapse", fontSize: 12 }}>
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
                  <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 8, background: isExp?"#FCEBEB":"#FAEEDA", color: isExp?"#A32D2D":"#854F0B" }}>
                    {isExp ? "Expired" : `${r.days_left}d left`}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div> 
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#3B6D11", marginTop: 2 }}>{label}</div>
    </div>
  );
}

const inputStyle      = { display: "block", width: "100%", padding: "9px 11px", borderRadius: 7, border: "1.5px solid #3a4255", fontSize: 13, background: "#1e2535", color: "#e8ecf2", boxSizing: "border-box", marginTop: 5, outline: "none", fontFamily: "inherit" };
const labelStyle      = { fontSize: 12, fontWeight: 500, color: "#c0c7d4", display: "block" };
const starStyle       = { color: "#E24B4A", marginLeft: 2 };
const hintStyle       = { fontSize: 11, color: "#5a6475", marginTop: 4, display: "block" };
const dividerStyle    = { borderTop: "1px solid #2a3247", margin: "14px 0" };
const primaryBtn      = { padding: "10px 0", borderRadius: 8, border: "none", background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const cancelBtn       = { padding: "10px 16px", borderRadius: 8, border: "1px solid #3a4255", background: "none", color: "#c0c7d4", fontSize: 13, cursor: "pointer" };
const outlineBtn      = { padding: "7px 14px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", background: "none", fontSize: 12, cursor: "pointer", color: "var(--color-text-secondary)" };
const ghostBtn        = { padding: "4px 10px", borderRadius: 6, border: "1px solid var(--color-border-tertiary)", background: "none", fontSize: 11, cursor: "pointer", color: "var(--color-text-secondary)" };
const restockBtnStyle = { padding: "4px 12px", borderRadius: 6, border: "1px solid #185FA5", background: "transparent", color: "#185FA5", cursor: "pointer", fontSize: 11, fontWeight: 500 };
const refreshBtn      = { marginLeft: "auto", padding: "6px 12px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", background: "none", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: 12 };
const errorBox        = { background: "#FCEBEB", color: "#A32D2D", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 4 };
const successBox      = { background: "#EAF3DE", color: "#3B6D11", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginTop: 14 };
const infoCard        = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 18px", marginBottom: 16 };
const requiredBadge   = { fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 8, background: "#E6F1FB", color: "#185FA5" };
const optionalBadge   = { fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 8, background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" };
const greyBadge       = { fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 8, background: "var(--color-background-secondary)", color: "var(--color-text-tertiary)", fontStyle: "italic" };
const overlayStyle    = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 };
const modalStyle      = { background: "#151b28", borderRadius: 14, padding: 24, width: 420, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.5)", border: "1px solid #2a3247" };
const modalHeader     = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 };
const modalTitle      = { fontSize: 16, fontWeight: 600, margin: 0, color: "#e8ecf2" };
const closeBtn        = { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#8a93a6", lineHeight: 1, padding: 0 };
const infoRow         = { display: "flex", justifyContent: "space-between", padding: "5px 0" };
const infoLabel       = { fontSize: 12, color: "#8a93a6" };
const infoValue       = { fontSize: 13, fontWeight: 500, color: "#e8ecf2" };
const tableWrapper    = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" };
const batchTableWrapper = { background: "#1a2133", border: "1px solid #2a3247", borderRadius: 10, overflow: "hidden" };
const thStyle         = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" };
const batchThStyle    = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "#5a6475", textTransform: "uppercase", letterSpacing: "0.05em" };
const tdStyle         = { padding: "11px 14px", fontSize: 13, color: "var(--color-text-primary)" };
const batchTdStyle    = { padding: "11px 14px", fontSize: 13, color: "#c0c7d4" };
const emptyTd         = { textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 };
const centreMsg       = { textAlign: "center", padding: 40, color: "var(--color-text-tertiary)", fontSize: 13 };