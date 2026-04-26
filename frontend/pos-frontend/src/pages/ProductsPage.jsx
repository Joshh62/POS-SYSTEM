import { useState, useEffect, useMemo } from "react";
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
  stock_quantity: 0,
};

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

  const [scanMsg, setScanMsg]         = useState(null);

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
    setShowForm(true);
  };

  const openEdit = (product) => {
    if (!product) return;
    setEditing(product);
    setForm({
      product_name:   product.product_name  || "",
      barcode:        product.barcode        || "",
      category_id:    product.category_id    || "",
      cost_price:     product.cost_price     || "",
      selling_price:  product.selling_price  || "",
      stock_quantity: product.stock_quantity ?? 0,
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
        category_id:    form.category_id   ? parseInt(form.category_id)  : null,
        cost_price:     parseFloat(form.cost_price    || 0),
        selling_price:  parseFloat(form.selling_price),
        stock_quantity: parseInt(form.stock_quantity  || 0),
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
          style={{ ...inputStyle, flex: 1 }}
        />
        <button onClick={openCreate} style={primaryBtn}>+ Add product</button>
      </div>

      {scanMsg && (
        <div style={{
          padding: "8px 14px", borderRadius: 8, marginBottom: 12,
          fontSize: 13, fontWeight: 500,
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
            ) : products.map(p => (
              <tr key={p.product_id} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                <td style={td}>{p.product_name}</td>
                <td style={{ ...td, color: "var(--color-text-secondary)" }}>{p.barcode}</td>
                <td style={td}>{categoryMap[p.category_id] || "—"}</td>
                <td style={td}>₦{parseFloat(p.cost_price || 0).toLocaleString("en-NG")}</td>
                <td style={{ ...td, fontWeight: 500 }}>
                  ₦{parseFloat(p.selling_price || 0).toLocaleString("en-NG")}
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
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} style={pageBtn(page === 1)} disabled={page === 1}>← Prev</button>
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)", alignSelf: "center" }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={pageBtn(page === totalPages)} disabled={page === totalPages}>Next →</button>
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {showForm && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
                {editing ? "Edit product" : "Add product"}
              </h2>
              <button onClick={() => setShowForm(false)} style={closeBtn}>×</button>
            </div>

            {formError && <div style={errorBox}>{formError}</div>}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={labelStyle}>
                Product name *
                <input placeholder="e.g. Indomie Noodles" {...field("product_name")} />
              </label>

              <label style={labelStyle}>
                Barcode *
                <input placeholder="e.g. 0404" {...field("barcode")} />
              </label>

              <label style={labelStyle}>
                Category
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
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={labelStyle}>
                  Cost price (₦)
                  <input type="number" min="0" placeholder="0" {...field("cost_price")} />
                </label>
                <label style={labelStyle}>
                  Selling price (₦) *
                  <input type="number" min="0" placeholder="0" {...field("selling_price")} />
                </label>
              </div>

              {/* Stock quantity only shown when creating — editing uses Inventory page */}
              {!editing && (
                <label style={labelStyle}>
                  Initial stock quantity
                  <input type="number" min="0" placeholder="0" {...field("stock_quantity")} />
                </label>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button
                onClick={() => setShowForm(false)}
                style={{ ...cancelBtn, flex: 1 }}
                disabled={formLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                style={{ ...primaryBtn, flex: 2 }}
                disabled={formLoading}
              >
                {formLoading ? "Saving..." : editing ? "Save changes" : "Add product"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const inputStyle = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 7,
  border: "1px solid var(--color-border-tertiary)",
  fontSize: 13,
  background: "var(--color-background-secondary)",
  color: "var(--color-text-primary)",
  boxSizing: "border-box",
  marginTop: 4,
  display: "block",
};

const primaryBtn = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "#185FA5",
  color: "#fff",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const cancelBtn = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid var(--color-border-tertiary)",
  background: "none",
  color: "var(--color-text-primary)",
  fontSize: 13,
  cursor: "pointer",
};

const editBtn = {
  padding: "4px 12px",
  borderRadius: 6,
  border: "none",
  background: "#E6F1FB",
  color: "#185FA5",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
};

const pageBtn = (disabled) => ({
  padding: "5px 12px",
  borderRadius: 6,
  border: "1px solid var(--color-border-tertiary)",
  background: "none",
  fontSize: 12,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.4 : 1,
  color: "var(--color-text-primary)",
});

const errorBox  = { background: "#FCEBEB", color: "#A32D2D", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 12 };
const tableWrap = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" };
const th        = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" };
const td        = { padding: "11px 14px", fontSize: 13, color: "var(--color-text-primary)" };
const emptyTd   = { textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 };

const overlayStyle = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 999,
};

const modalStyle = {
  background: "var(--color-background-primary)",
  borderRadius: 14,
  padding: 24,
  width: 420,
  maxHeight: "85vh",
  overflowY: "auto",
  boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
};

const closeBtn = {
  background: "none", border: "none",
  fontSize: 22, cursor: "pointer",
  color: "var(--color-text-secondary)",
  lineHeight: 1, padding: 0,
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--color-text-secondary)",
  display: "block",
};