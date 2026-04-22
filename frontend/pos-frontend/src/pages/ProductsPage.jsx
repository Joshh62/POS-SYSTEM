import { useState, useEffect, useMemo } from "react";
import {
  getProducts,
  createProduct,
  updateProduct,
  getCategories,
  getProductByBarcode
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
  const [products, setProducts]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError]   = useState(null);

  const LIMIT = 20;

  const [scanMsg, setScanMsg] = useState(null);

  // ✅ Fast category lookup (important optimization)
  const categoryMap = useMemo(() => {
    const map = {};
    (categories || []).forEach(c => {
      map[c.category_id] = c.category_name;
    });
    return map;
  }, [categories]);

  // Barcode scanner
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

  useEffect(() => {
    fetchData();
  }, [page, search]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);

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
      product_name:   product.product_name || "",
      barcode:        product.barcode || "",
      category_id:    product.category_id || "",
      cost_price:     product.cost_price || "",
      selling_price:  product.selling_price || "",
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
        category_id:    form.category_id ? parseInt(form.category_id) : null,
        cost_price:     parseFloat(form.cost_price || 0),
        selling_price:  parseFloat(form.selling_price),
        stock_quantity: parseInt(form.stock_quantity || 0),
      };

      if (editing) {
        await updateProduct(editing.product_id, payload);
      } else {
        await createProduct(payload);
      }

      setShowForm(false);
      fetchData();

    } catch (err) {
      console.error(err);
      setFormError(err.response?.data?.detail || "Failed to save product.");
    } finally {
      setFormLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%" }}>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
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
          padding: "8px 14px",
          borderRadius: 8,
          marginBottom: 12,
          fontSize: 13,
          fontWeight: 500,
          background: scanMsg.type === "success" ? "#EAF3DE" : "#FCEBEB",
          color: scanMsg.type === "success" ? "#3B6D11" : "#A32D2D",
        }}>
          {scanMsg.message}
        </div>
      )}

      {error && <div style={errorBox}>{error}</div>}

      {/* Table */}
      <div style={tableWrap}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
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
              <tr key={p.product_id}>
                <td style={td}>{p.product_name}</td>
                <td style={td}>{p.barcode}</td>
                <td style={td}>{categoryMap[p.category_id] || "—"}</td>
                <td style={td}>
                  ₦{parseFloat(p.cost_price || 0).toLocaleString("en-NG")}
                </td>
                <td style={{ ...td, fontWeight: 500 }}>
                  ₦{parseFloat(p.selling_price || 0).toLocaleString("en-NG")}
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button onClick={() => openEdit(p)} style={editBtn}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
          <span style={{ margin: "0 10px" }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</button>
        </div>
      )}

      {/* Modal stays same (no structural issues) */}
    </div>
  );
}