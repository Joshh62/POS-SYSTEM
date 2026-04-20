import { useState, useEffect } from "react";
import { getProducts, createProduct, updateProduct, getCategories, getProductByBarcode } from "../api/api";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";

const EMPTY_FORM = {
  product_name: "", barcode: "", category_id: "",
  cost_price: "", selling_price: "", stock_quantity: 0,
};

export default function ProductsPage() {
  const [products, setProducts]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState(null); // product being edited
  const [form, setForm]             = useState(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError]   = useState(null);

  const LIMIT = 20;

  // Barcode scanner — scans open the edit form for that product
  const [scanMsg, setScanMsg] = useState(null);

  useBarcodeScanner(async (barcode) => {
    try {
      const product = await getProductByBarcode(barcode);
      openEdit(product);
      setScanMsg({ type: "success", message: `Found: ${product.product_name}` });
    } catch {
      setScanMsg({ type: "error", message: `No product found for barcode: ${barcode}` });
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

      console.log("CATEGORIES RESPONSE:", cats);

      setProducts(prod.data);
      setTotal(prod.total);
      setCategories(cats);
    } catch {
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
    setShowForm(true);
  };

  const openEdit = (product) => {
    setEditing(product);
    setForm({
      product_name:   product.product_name,
      barcode:        product.barcode,
      category_id:    product.category_id,
      cost_price:     product.cost_price,
      selling_price:  product.selling_price,
      stock_quantity: product.stock_quantity || 0,
    });
    setFormError(null);
    setShowForm(true);
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
        category_id:    parseInt(form.category_id) || null,
        cost_price:     parseFloat(form.cost_price) || 0,
        selling_price:  parseFloat(form.selling_price),
        stock_quantity: parseInt(form.stock_quantity) || 0,
      };
      if (editing) {
        await updateProduct(editing.product_id, payload);
      } else {
        await createProduct(payload);
      }
      setShowForm(false);
      fetchData();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Failed to save product.");
    } finally {
      setFormLoading(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search products..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={inputStyle}
        />
        <button onClick={openCreate} style={primaryBtn}>+ Add product</button>
      </div>

      {/* Scan feedback */}
      {scanMsg && (
        <div style={{
          padding: "8px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 500,
          background: scanMsg.type === "success" ? "#EAF3DE" : "#FCEBEB",
          color: scanMsg.type === "success" ? "#3B6D11" : "#A32D2D",
        }}>
          {scanMsg.type === "success" ? "✓ " : "✕ "}{scanMsg.message}
        </div>
      )}

      {error && <div style={errorBox}>{error}</div>}

      {/* Table */}
      <div style={tableWrap}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
              {["Product", "Barcode", "Category", "Cost price", "Selling price", ""].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={emptyTd}>Loading...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={6} style={emptyTd}>No products found.</td></tr>
            ) : products.map((p) => (
              <tr key={p.product_id} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                <td style={td}>{p.product_name}</td>
                <td style={{ ...td, color: "var(--color-text-tertiary)", fontSize: 12 }}>{p.barcode}</td>
                <td style={td}>
                  {categories.find(c => c.category_id === p.category_id)?.category_name || "—"}
                </td>
                <td style={td}>₦{parseFloat(p.cost_price || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</td>
                <td style={{ ...td, fontWeight: 500, color: "#185FA5" }}>
                  ₦{parseFloat(p.selling_price).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button onClick={() => openEdit(p)} style={editBtn}>Edit</button>
                </td>
              </tr>
            ))}
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

      {/* Add/Edit modal */}
      {showForm && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={modalTitle}>{editing ? "Edit product" : "New product"}</h2>
              <button onClick={() => setShowForm(false)} style={closeBtn}>×</button>
            </div>

            <Field label="Product name *">
              <input style={inputStyle} value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} placeholder="e.g. Indomie Noodles" />
            </Field>
            <Field label="Barcode *">
              <input style={inputStyle} value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="e.g. 5012345678900" />
            </Field>
            <Field label="Category">
              <select style={inputStyle} value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                <option value="">— Select category —</option>
                {categories.map(c => (
                  <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
                ))}
              </select>
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Cost price (₦)">
                <input type="number" style={inputStyle} value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })} placeholder="0.00" />
              </Field>
              <Field label="Selling price (₦) *">
                <input type="number" style={inputStyle} value={form.selling_price} onChange={e => setForm({ ...form, selling_price: e.target.value })} placeholder="0.00" />
              </Field>
            </div>

            {!editing && (
              <Field label="Initial stock quantity">
                <input type="number" style={inputStyle} value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: e.target.value })} placeholder="0" />
              </Field>
            )}

            {formError && <div style={{ ...errorBox, marginBottom: 10 }}>{formError}</div>}

            <button
              onClick={handleSubmit}
              disabled={formLoading}
              style={{ ...primaryBtn, width: "100%", padding: "11px 0", marginTop: 6, opacity: formLoading ? 0.6 : 1 }}
            >
              {formLoading ? "Saving..." : editing ? "Save changes" : "Create product"}
            </button>
            <button onClick={() => setShowForm(false)} style={{ ...cancelBtn, width: "100%", marginTop: 8 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle  = { width: "100%", padding: "8px 11px", borderRadius: 8, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none", boxSizing: "border-box" };
const primaryBtn  = { padding: "8px 16px", borderRadius: 8, border: "none", background: "#185FA5", color: "#E6F1FB", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" };
const cancelBtn   = { padding: "9px 0", borderRadius: 8, border: "1px solid var(--color-border-secondary)", background: "none", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer" };
const editBtn     = { padding: "4px 12px", borderRadius: 6, border: "1px solid var(--color-border-secondary)", background: "none", color: "var(--color-text-secondary)", fontSize: 12, cursor: "pointer" };
const pageBtn     = (disabled) => ({ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--color-border-secondary)", background: disabled ? "var(--color-background-secondary)" : "var(--color-background-primary)", color: disabled ? "var(--color-text-tertiary)" : "var(--color-text-primary)", fontSize: 12, cursor: disabled ? "not-allowed" : "pointer" });
const th          = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" };
const td          = { padding: "11px 14px", fontSize: 13, color: "var(--color-text-primary)" };
const emptyTd     = { textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 };
const errorBox    = { background: "#FCEBEB", color: "#A32D2D", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 14 };
const tableWrap   = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modalStyle  = { background: "var(--color-background-primary)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", border: "1px solid var(--color-border-secondary)" };
const modalTitle  = { fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 };
const closeBtn    = { background: "none", border: "none", fontSize: 22, color: "var(--color-text-secondary)", cursor: "pointer", padding: 0, lineHeight: 1 };