import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  getProducts,
  createProduct,
  updateProduct,
  getCategories,
  getProductByBarcode,
} from "../api/api";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";

const EMPTY_FORM = {
  product_name: "",
  barcode: "",
  category_id: "",
  cost_price: "",
  selling_price: "",
};

// ── Generate a random CODE-128 compatible barcode string ─────────────────────
function generateBarcode() {
  const timestamp = Date.now().toString().slice(-8);
  const random    = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `PT${timestamp}${random}`;   // PT = ProfitTrack prefix
}

// ── Render CODE-128 barcode SVG using JsBarcode ───────────────────────────────
function BarcodeDisplay({ value, productName }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!value || !svgRef.current) return;

    // Load JsBarcode dynamically
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js";
    script.onload = () => {
      try {
        window.JsBarcode(svgRef.current, value, {
          format:      "CODE128",
          width:       2,
          height:      60,
          displayValue: true,
          fontSize:    12,
          margin:      8,
          background:  "#ffffff",
          lineColor:   "#000000",
        });
      } catch (e) {
        console.error("Barcode render failed:", e);
      }
    };

    // If already loaded, render directly
    if (window.JsBarcode) {
      try {
        window.JsBarcode(svgRef.current, value, {
          format:       "CODE128",
          width:        2,
          height:       60,
          displayValue: true,
          fontSize:     12,
          margin:       8,
          background:   "#ffffff",
          lineColor:    "#000000",
        });
      } catch (e) {
        console.error("Barcode render failed:", e);
      }
      return;
    }

    document.head.appendChild(script);
    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, [value]);

  if (!value) return null;

  return (
    <div style={{ textAlign: "center", background: "#fff", borderRadius: 8, padding: "12px 16px", border: "1px solid #e0e0e0" }}>
      <svg ref={svgRef} style={{ maxWidth: "100%" }} />
      {productName && (
        <div style={{ fontSize: 11, color: "#555", marginTop: 4, fontWeight: 500 }}>
          {productName}
        </div>
      )}
    </div>
  );
}

// ── Print barcode label ───────────────────────────────────────────────────────
function printBarcodeLabel(barcode, productName, quantity = 1) {
  const win = window.open("", "_blank", "width=400,height=300");
  if (!win) return;

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Barcode Label — ${productName}</title>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js"></script>
      <style>
        body { margin: 0; padding: 10px; font-family: Arial, sans-serif; }
        .label { display: inline-block; border: 1px solid #ccc; border-radius: 6px; padding: 8px 12px; margin: 4px; text-align: center; }
        .product-name { font-size: 11px; font-weight: 600; margin-bottom: 4px; color: #222; max-width: 200px; word-wrap: break-word; }
        .labels { display: flex; flex-wrap: wrap; gap: 6px; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="labels">
        ${Array.from({ length: quantity }, (_, i) => `
          <div class="label">
            <div class="product-name">${productName}</div>
            <svg id="bc${i}"></svg>
          </div>
        `).join("")}
      </div>
      <script>
        window.onload = function() {
          ${Array.from({ length: quantity }, (_, i) => `
            JsBarcode("#bc${i}", "${barcode}", {
              format: "CODE128", width: 2, height: 50,
              displayValue: true, fontSize: 11, margin: 4,
            });
          `).join("")}
          setTimeout(() => window.print(), 500);
        };
      </script>
    </body>
    </html>
  `);
  win.document.close();
}


export default function ProductsPage() {
  const [products, setProducts]       = useState([]);
  const [categories, setCategories]   = useState([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);

  const [showForm, setShowForm]       = useState(false);
  const [editing, setEditing]         = useState(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError]     = useState(null);

  // ── Barcode state ─────────────────────────────────────────────────────────
  const [showBarcode,   setShowBarcode]   = useState(false);  // show barcode preview in form
  const [printQty,      setPrintQty]      = useState(1);
  const [barcodeModal,  setBarcodeModal]  = useState(null);   // { barcode, product_name } for standalone view

  const [scanMsg, setScanMsg] = useState(null);

  const LIMIT = 20;

  const categoryMap = useMemo(() => {
    const map = {};
    (categories || []).forEach(c => { map[c.category_id] = c.category_name; });
    return map;
  }, [categories]);

  useBarcodeScanner(async (barcode) => {
    try {
      const product = await getProductByBarcode(barcode);
      if (product) openEdit(product);
      setScanMsg({ type: "success", message: `Found: ${product?.product_name}` });
    } catch {
      setScanMsg({ type: "error", message: `No product for: ${barcode}` });
    }
    setTimeout(() => setScanMsg(null), 2500);
  });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [prod, cats] = await Promise.all([
        getProducts(page, LIMIT, search),
        getCategories(),
      ]);
      setProducts(prod?.data || []);
      setTotal(prod?.total || 0);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch (err) {
      console.error(err);
      setError("Failed to load products.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [page, search]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowBarcode(false);
    setPrintQty(1);
    setShowForm(true);
  };

  const openEdit = (product) => {
    if (!product) return;
    setEditing(product);
    setForm({
      product_name:  product.product_name  || "",
      barcode:       product.barcode        || "",
      category_id:   product.category_id    || "",
      cost_price:    product.cost_price     || "",
      selling_price: product.selling_price  || "",
    });
    setFormError(null);
    setShowBarcode(false);
    setPrintQty(1);
    setShowForm(true);
  };

  const handleAutoGenerateBarcode = () => {
    const code = generateBarcode();
    setForm(f => ({ ...f, barcode: code }));
    setShowBarcode(true);
  };

  const handleSubmit = async () => {
    if (!form.product_name || !form.barcode || !form.selling_price) {
      setFormError("Product name, barcode and selling price are required.");
      return;
    }
    setFormLoading(true);
    setFormError(null);
    try {
      const payload = {
        ...form,
        category_id:    form.category_id ? parseInt(form.category_id) : null,
        cost_price:     parseFloat(form.cost_price    || 0),
        selling_price:  parseFloat(form.selling_price),
        stock_quantity: 0,
      };
      if (editing) await updateProduct(editing.product_id, payload);
      else         await createProduct(payload);
      setShowForm(false);
      fetchData();
    } catch (err) {
      console.error(err);
      setFormError(err.response?.data?.detail || "Failed to save product.");
    } finally {
      setFormLoading(false);
    }
  };

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm(f => ({ ...f, [key]: e.target.value })),
    style: inputStyle,
  });

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%" }}>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search products..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          style={{ ...inputStyle, flex: 1, marginTop: 0 }}
        />
        <button onClick={openCreate} style={primaryBtn}>+ Add product</button>
      </div>

      {scanMsg && (
        <div style={{
          padding: "8px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 500,
          background: scanMsg.type === "success" ? "#EAF3DE" : "#FCEBEB",
          color:      scanMsg.type === "success" ? "#3B6D11" : "#A32D2D",
        }}>
          {scanMsg.message}
        </div>
      )}

      {error && <div style={errorBox}>{error}</div>}

      {/* Table */}
      <div style={tableWrap}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
              <th style={thStyle}>Product</th>
              <th style={thStyle}>Barcode</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Cost price</th>
              <th style={thStyle}>Selling price</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={emptyTd}>Loading...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={6} style={emptyTd}>No products found.</td></tr>
            ) : products.map(p => (
              <tr key={p.product_id} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                <td style={tdStyle}>{p.product_name}</td>
                <td style={{ ...tdStyle, color: "var(--color-text-secondary)", fontFamily: "monospace", fontSize: 12 }}>
                  {p.barcode}
                </td>
                <td style={tdStyle}>{categoryMap[p.category_id] || "—"}</td>
                <td style={tdStyle}>₦{parseFloat(p.cost_price || 0).toLocaleString("en-NG")}</td>
                <td style={{ ...tdStyle, fontWeight: 500 }}>
                  ₦{parseFloat(p.selling_price || 0).toLocaleString("en-NG")}
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => setBarcodeModal({ barcode: p.barcode, product_name: p.product_name })}
                      style={barcodeBtn}
                      title="View & print barcode"
                    >
                      🏷️ Label
                    </button>
                    <button onClick={() => openEdit(p)} style={editBtn}>Edit</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} style={pageBtn(page === 1)} disabled={page === 1}>
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)", alignSelf: "center" }}>
            {page} / {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={pageBtn(page === totalPages)} disabled={page === totalPages}>
            Next →
          </button>
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {showForm && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: showBarcode && form.barcode ? 520 : 440 }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={modalTitle}>{editing ? "Edit product" : "Add product"}</h2>
              <button onClick={() => setShowForm(false)} style={closeBtn}>×</button>
            </div>

            {!editing && (
              <div style={hintBanner}>
                After adding, go to <strong style={{ color: "#e8ecf2" }}>Inventory → Restock</strong> to add
                stock and set expiry dates.
              </div>
            )}

            {formError && <div style={errorBox}>{formError}</div>}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              <div>
                <label style={labelStyle}>Product name <span style={starStyle}>*</span></label>
                <input placeholder="e.g. Indomie Noodles" {...field("product_name")} />
              </div>

              {/* Barcode field with generate button */}
              <div>
                <label style={labelStyle}>Barcode <span style={starStyle}>*</span></label>
                <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
                  <input
                    placeholder="Scan, type, or generate"
                    value={form.barcode}
                    onChange={e => { setForm(f => ({ ...f, barcode: e.target.value })); setShowBarcode(false); }}
                    style={{ ...inputStyle, marginTop: 0, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={handleAutoGenerateBarcode}
                    title="Auto-generate a unique CODE-128 barcode"
                    style={{ padding: "0 12px", borderRadius: 7, border: "1px solid #3a4255", background: "#1a2438", color: "#8a93a6", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", fontWeight: 500 }}
                  >
                    Generate
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "#5a6475", marginTop: 4 }}>
                  Scan a physical barcode, type one manually, or click Generate for products without barcodes.
                </div>
              </div>

              {/* Barcode preview */}
              {showBarcode && form.barcode && (
                <div>
                  <label style={{ ...labelStyle, marginBottom: 6 }}>Barcode preview</label>
                  <BarcodeDisplay value={form.barcode} productName={form.product_name} />
                  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#8a93a6" }}>Print</span>
                    <input
                      type="number" min="1" max="100"
                      value={printQty}
                      onChange={e => setPrintQty(Math.max(1, parseInt(e.target.value) || 1))}
                      style={{ ...inputStyle, marginTop: 0, width: 60, padding: "5px 8px" }}
                    />
                    <span style={{ fontSize: 11, color: "#8a93a6" }}>label{printQty !== 1 ? "s" : ""}</span>
                    <button
                      onClick={() => printBarcodeLabel(form.barcode, form.product_name, printQty)}
                      style={{ ...primaryBtn, padding: "6px 14px", fontSize: 12 }}
                    >
                      🖨️ Print labels
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>Category</label>
                <select
                  value={form.category_id}
                  onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">— None —</option>
                  {categories.map(c => (
                    <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Cost price (₦)</label>
                  <input type="number" min="0" placeholder="0" {...field("cost_price")} />
                </div>
                <div>
                  <label style={labelStyle}>Selling price (₦) <span style={starStyle}>*</span></label>
                  <input type="number" min="0" placeholder="0" {...field("selling_price")} />
                </div>
              </div>

              {/* Show barcode preview for existing products too */}
              {editing && form.barcode && !showBarcode && (
                <button
                  type="button"
                  onClick={() => setShowBarcode(true)}
                  style={{ ...primaryBtn, background: "#1a2438", border: "1px solid #3a4255", color: "#8a93a6", fontSize: 12, padding: "7px 14px" }}
                >
                  🏷️ Show barcode label
                </button>
              )}

            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
              <button onClick={() => setShowForm(false)} style={{ ...cancelBtn, flex: 1 }} disabled={formLoading}>
                Cancel
              </button>
              <button onClick={handleSubmit} style={{ ...primaryBtn, flex: 2 }} disabled={formLoading}>
                {formLoading ? "Saving..." : editing ? "Save changes" : "Add product"}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Standalone barcode modal (from table Label button) ── */}
      {barcodeModal && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 400 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={modalTitle}>Barcode label</h2>
              <button onClick={() => setBarcodeModal(null)} style={closeBtn}>×</button>
            </div>

            <BarcodeDisplay value={barcodeModal.barcode} productName={barcodeModal.product_name} />

            <div style={{ fontSize: 12, color: "#8a93a6", textAlign: "center", marginTop: 8 }}>
              CODE-128 · {barcodeModal.barcode}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 12, color: "#8a93a6" }}>Quantity:</span>
              <input
                type="number" min="1" max="100"
                value={printQty}
                onChange={e => setPrintQty(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ ...inputStyle, marginTop: 0, width: 64, padding: "6px 8px" }}
              />
              <button
                onClick={() => printBarcodeLabel(barcodeModal.barcode, barcodeModal.product_name, printQty)}
                style={{ ...primaryBtn, padding: "8px 18px" }}
              >
                🖨️ Print {printQty} label{printQty !== 1 ? "s" : ""}
              </button>
            </div>

            <button onClick={() => setBarcodeModal(null)} style={{ ...cancelBtn, width: "100%", marginTop: 12 }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const inputStyle  = { display: "block", width: "100%", padding: "9px 11px", borderRadius: 7, border: "1.5px solid #3a4255", fontSize: 13, background: "#1e2535", color: "#e8ecf2", boxSizing: "border-box", marginTop: 5, outline: "none", fontFamily: "inherit" };
const labelStyle  = { fontSize: 12, fontWeight: 500, color: "#c0c7d4", display: "block" };
const starStyle   = { color: "#E24B4A", marginLeft: 2 };
const hintBanner  = { background: "#1a2438", border: "1px solid #2a3247", borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "#8a93a6", marginBottom: 16, lineHeight: 1.5 };
const primaryBtn  = { padding: "9px 18px", borderRadius: 8, border: "none", background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" };
const cancelBtn   = { padding: "9px 18px", borderRadius: 8, border: "1px solid #3a4255", background: "none", color: "#c0c7d4", fontSize: 13, cursor: "pointer" };
const editBtn     = { padding: "4px 12px", borderRadius: 6, border: "none", background: "#E6F1FB", color: "#185FA5", fontSize: 11, fontWeight: 500, cursor: "pointer" };
const barcodeBtn  = { padding: "4px 10px", borderRadius: 6, border: "none", background: "#FAEEDA", color: "#854F0B", fontSize: 11, fontWeight: 500, cursor: "pointer" };
const pageBtn     = (d) => ({ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--color-border-tertiary)", background: "none", fontSize: 12, cursor: d ? "default" : "pointer", opacity: d ? 0.4 : 1, color: "var(--color-text-primary)" });
const errorBox    = { background: "#FCEBEB", color: "#A32D2D", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 14 };
const tableWrap   = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" };
const thStyle     = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" };
const tdStyle     = { padding: "11px 14px", fontSize: 13, color: "var(--color-text-primary)" };
const emptyTd     = { textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 };
const modalStyle  = { background: "#151b28", borderRadius: 14, padding: 24, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.5)", border: "1px solid #2a3247" };
const modalTitle  = { fontSize: 16, fontWeight: 600, margin: 0, color: "#e8ecf2" };
const closeBtn    = { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#8a93a6", lineHeight: 1, padding: 0 };