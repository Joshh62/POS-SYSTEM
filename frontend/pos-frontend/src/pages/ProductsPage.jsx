import { useState, useEffect, useMemo, useRef } from "react";
import {
  getProducts,
  createProduct,
  updateProduct,
  getCategories,
  getProductByBarcode,
} from "../api/api";
import api from "../api/api";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";

const EMPTY_FORM = {
  product_name: "", barcode: "", category_id: "",
  cost_price: "", selling_price: "", supplier_id: "",
};

const TABS = ["Products", "Import"];

function generateBarcode() {
  const timestamp = Date.now().toString().slice(-8);
  const random    = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `PT${timestamp}${random}`;
}

function BarcodeDisplay({ value, productName }) {
  const svgRef = useRef(null);
  useEffect(() => {
    if (!value || !svgRef.current) return;
    const render = () => {
      try {
        window.JsBarcode(svgRef.current, value, {
          format: "CODE128", width: 2, height: 60,
          displayValue: true, fontSize: 12, margin: 8,
          background: "#ffffff", lineColor: "#000000",
        });
      } catch (e) { console.error(e); }
    };
    if (window.JsBarcode) { render(); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js";
    script.onload = render;
    document.head.appendChild(script);
    return () => { if (script.parentNode) script.parentNode.removeChild(script); };
  }, [value]);
  if (!value) return null;
  return (
    <div style={{ textAlign: "center", background: "#fff", borderRadius: 8, padding: "12px 16px", border: "1px solid #e0e0e0" }}>
      <svg ref={svgRef} style={{ maxWidth: "100%" }} />
      {productName && <div style={{ fontSize: 11, color: "#555", marginTop: 4, fontWeight: 500 }}>{productName}</div>}
    </div>
  );
}

function printBarcodeLabel(barcode, productName, quantity = 1) {
  const win = window.open("", "_blank", "width=400,height=300");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>Barcode</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js"></script>
    <style>body{margin:0;padding:10px;font-family:Arial}.label{display:inline-block;border:1px solid #ccc;border-radius:6px;padding:8px 12px;margin:4px;text-align:center}.product-name{font-size:11px;font-weight:600;margin-bottom:4px;color:#222;max-width:200px;word-wrap:break-word}.labels{display:flex;flex-wrap:wrap;gap:6px}@media print{body{padding:0}}</style>
    </head><body><div class="labels">
    ${Array.from({length:quantity},(_,i)=>`<div class="label"><div class="product-name">${productName}</div><svg id="bc${i}"></svg></div>`).join("")}
    </div><script>window.onload=function(){${Array.from({length:quantity},(_,i)=>`JsBarcode("#bc${i}","${barcode}",{format:"CODE128",width:2,height:50,displayValue:true,fontSize:11,margin:4});`).join("")}setTimeout(()=>window.print(),500);};</script></body></html>`);
  win.document.close();
}

export default function ProductsPage() {
  const [activeTab,   setActiveTab]   = useState("Products");
  const [products,    setProducts]    = useState([]);
  const [categories,  setCategories]  = useState([]);
  const [suppliers,   setSuppliers]   = useState([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [search,      setSearch]      = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);

  const [showForm,    setShowForm]    = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError,   setFormError]   = useState(null);

  const [showBarcode,  setShowBarcode]  = useState(false);
  const [printQty,     setPrintQty]     = useState(1);
  const [barcodeModal, setBarcodeModal] = useState(null);
  const [scanMsg,      setScanMsg]      = useState(null);

  // ── Import state ──────────────────────────────────────────────────────────
  const [importFile,     setImportFile]     = useState(null);
  const [importDragging, setImportDragging] = useState(false);
  const [importLoading,  setImportLoading]  = useState(false);
  const [importResult,   setImportResult]   = useState(null);
  const [importError,    setImportError]    = useState(null);
  const importInputRef = useRef();

  const LIMIT = 20;

  const categoryMap = useMemo(() => {
    const m = {}; categories.forEach(c => { m[c.category_id] = c.category_name; }); return m;
  }, [categories]);

  useBarcodeScanner(async (barcode) => {
    if (activeTab !== "Products") return;
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
    setLoading(true); setError(null);
    try {
      const [prod, cats, sups] = await Promise.all([
        getProducts(page, LIMIT, search),
        getCategories(),
        api.get("/suppliers/").then(r => r.data).catch(() => []),
      ]);
      setProducts(prod?.data || []);
      setTotal(prod?.total || 0);
      setCategories(Array.isArray(cats) ? cats : []);
      setSuppliers(Array.isArray(sups) ? sups : []);
    } catch (err) {
      console.error(err); setError("Failed to load products.");
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [page, search]);
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const openCreate = () => {
    setEditing(null); setForm(EMPTY_FORM); setFormError(null);
    setShowBarcode(false); setPrintQty(1); setShowForm(true);
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
      supplier_id:   product.supplier_id    || "",
    });
    setFormError(null); setShowBarcode(false); setPrintQty(1); setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.product_name || !form.barcode || !form.selling_price) {
      setFormError("Product name, barcode and selling price are required."); return;
    }
    setFormLoading(true); setFormError(null);
    try {
      const payload = {
        ...form,
        category_id:    form.category_id  ? parseInt(form.category_id)  : null,
        supplier_id:    form.supplier_id   ? parseInt(form.supplier_id)  : null,
        cost_price:     parseFloat(form.cost_price    || 0),
        selling_price:  parseFloat(form.selling_price),
        stock_quantity: 0,
      };
      if (editing) await updateProduct(editing.product_id, payload);
      else         await createProduct(payload);
      setShowForm(false); fetchData();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Failed to save product.");
    } finally { setFormLoading(false); }
  };

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm(f => ({ ...f, [key]: e.target.value })),
    style: inputStyle,
  });

  // ── Import handlers ───────────────────────────────────────────────────────
  const handleImportFile = (f) => {
    if (!f) return;
    const name = f.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      setImportError("Only .csv or .xlsx files are supported.");
      return;
    }
    setImportFile(f); setImportError(null); setImportResult(null);
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImportLoading(true); setImportError(null); setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await api.post("/products/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(res.data);
      setImportFile(null);
      fetchData();
    } catch (err) {
      setImportError(err.response?.data?.detail || "Import failed. Check your file and try again.");
    } finally { setImportLoading(false); }
  };

  const downloadTemplate = async () => {
    try {
      const res = await api.get("/products/import/template", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a   = document.createElement("a");
      a.href = url; a.download = "profittrack_import_template.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: generate client-side
      const rows = [
        "product_name,barcode,selling_price,cost_price,stock_quantity,category,supplier,expiry_date",
        '"Indomie Noodles (Chicken)",8712345678901,250,180,100,Food & Beverages,Dangote Suppliers,',
        '"Men Polo Shirt - Black",PT1234567890,4500,2800,20,Clothing,,',
        '"Paracetamol 500mg",6001234567890,150,80,50,Pharmaceuticals,Lagos Pharma Dist,2026-12-31',
      ].join("\n");
      const url = URL.createObjectURL(new Blob([rows], { type: "text/csv" }));
      const a   = document.createElement("a");
      a.href = url; a.download = "profittrack_import_template.csv"; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--color-border-tertiary)" }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: "8px 14px", border: "none", background: "none", fontSize: 13, cursor: "pointer",
            fontWeight: activeTab === tab ? 500 : 400,
            color: activeTab === tab ? "var(--color-primary)" : "var(--color-text-secondary)",
            borderBottom: activeTab === tab ? "2px solid var(--color-primary)" : "2px solid transparent",
            marginBottom: -1,
          }}>
            {tab}
          </button>
        ))}
        {activeTab === "Products" && (
          <button onClick={openCreate} style={{ ...primaryBtn, marginLeft: "auto" }}>+ Add product</button>
        )}
      </div>

      {/* ── Products tab ── */}
      {activeTab === "Products" && (
        <>
          <div style={{ marginBottom: 16 }}>
            <input type="text" placeholder="Search products..."
              value={searchInput} onChange={e => setSearchInput(e.target.value)}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginTop: 0 }} />
          </div>

          {scanMsg && (
            <div style={{ padding: "8px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 500, background: scanMsg.type === "success" ? "#EAF3DE" : "#FCEBEB", color: scanMsg.type === "success" ? "#3B6D11" : "#A32D2D" }}>
              {scanMsg.message}
            </div>
          )}

          {error && <div style={errorBox}>{error}</div>}

          <div style={tableWrap}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                  <th style={thStyle}>Product</th>
                  <th style={thStyle}>Barcode</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Supplier</th>
                  <th style={thStyle}>Cost</th>
                  <th style={thStyle}>Price</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={emptyTd}>Loading...</td></tr>
                ) : products.length === 0 ? (
                  <tr><td colSpan={7} style={emptyTd}>No products found.</td></tr>
                ) : products.map(p => (
                  <tr key={p.product_id} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                    <td style={tdStyle}>{p.product_name}</td>
                    <td style={{ ...tdStyle, color: "var(--color-text-secondary)", fontFamily: "monospace", fontSize: 12 }}>{p.barcode}</td>
                    <td style={tdStyle}>{categoryMap[p.category_id] || "—"}</td>
                    <td style={{ ...tdStyle, fontSize: 12, color: "var(--color-text-secondary)" }}>{p.supplier?.supplier_name || "—"}</td>
                    <td style={tdStyle}>₦{parseFloat(p.cost_price || 0).toLocaleString("en-NG")}</td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>₦{parseFloat(p.selling_price || 0).toLocaleString("en-NG")}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button onClick={() => setBarcodeModal({ barcode: p.barcode, product_name: p.product_name })} style={barcodeBtn} title="Print barcode label">🏷️</button>
                        <button onClick={() => openEdit(p)} style={editBtn}>Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
              <button onClick={() => setPage(p => Math.max(1,p-1))} style={pageBtn(page===1)} disabled={page===1}>← Prev</button>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)", alignSelf: "center" }}>{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages,p+1))} style={pageBtn(page===totalPages)} disabled={page===totalPages}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* ── Import tab ── */}
      {activeTab === "Import" && (
        <div style={{ maxWidth: 640 }}>

          {/* Instructions card */}
          <div style={infoCard}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 10 }}>
              📥 How to bulk import products
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 2.2 }}>
              <li>Download the template — it has the correct columns with example rows</li>
              <li>Fill in your products. <strong style={{ color: "var(--color-text-primary)" }}>product_name</strong>, <strong style={{ color: "var(--color-text-primary)" }}>barcode</strong>, and <strong style={{ color: "var(--color-text-primary)" }}>selling_price</strong> are required for new products</li>
              <li>For <strong style={{ color: "var(--color-text-primary)" }}>supplier</strong> — type the exact supplier name as it appears in your Suppliers page. Unmatched names are ignored (product still imports)</li>
              <li>For <strong style={{ color: "var(--color-text-primary)" }}>expiry_date</strong> — use YYYY-MM-DD format (e.g. 2026-12-31). Leave blank for products with no expiry</li>
              <li>If a barcode already exists in your catalog, the row <strong style={{ color: "var(--color-text-primary)" }}>restocks</strong> that product — prices are not changed</li>
              <li>Save as <strong style={{ color: "var(--color-text-primary)" }}>.csv</strong> or <strong style={{ color: "var(--color-text-primary)" }}>.xlsx</strong> and upload</li>
            </ol>

            {/* Column reference */}
            <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={requiredBadge}>product_name *</span>
              <span style={requiredBadge}>barcode *</span>
              <span style={requiredBadge}>selling_price * (new only)</span>
              <span style={optionalBadge}>cost_price</span>
              <span style={optionalBadge}>stock_quantity</span>
              <span style={optionalBadge}>category</span>
              <span style={optionalBadge}>supplier</span>
              <span style={optionalBadge}>expiry_date</span>
            </div>

            <button onClick={downloadTemplate} style={{ ...outlineBtn, marginTop: 14 }}>
              ⬇ Download template (.csv)
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setImportDragging(true); }}
            onDragLeave={() => setImportDragging(false)}
            onDrop={e => { e.preventDefault(); setImportDragging(false); handleImportFile(e.dataTransfer.files[0]); }}
            onClick={() => importInputRef.current?.click()}
            style={{
              border: `2px dashed ${importDragging ? "var(--color-primary)" : "var(--color-border-tertiary)"}`,
              borderRadius: 12, padding: "40px 24px", textAlign: "center", cursor: "pointer",
              background: importDragging ? "rgba(24,95,165,0.04)" : "var(--color-background-primary)",
              transition: "all 0.2s", marginBottom: 16,
            }}
          >
            <input ref={importInputRef} type="file" accept=".csv,.xlsx,.xls"
              style={{ display: "none" }} onChange={e => handleImportFile(e.target.files[0])} />
            <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
            {importFile ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{importFile.name}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
                  {(importFile.size / 1024).toFixed(1)} KB · Click to change file
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>
                  Drop your file here or click to browse
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
                  .csv or .xlsx files supported
                </div>
              </>
            )}
          </div>

          {importError && <div style={errorBox}>{importError}</div>}

          {importFile && !importResult && (
            <button onClick={handleImport} disabled={importLoading}
              style={{ ...primaryBtn, width: "100%", padding: "11px 0", opacity: importLoading ? 0.7 : 1 }}>
              {importLoading ? "Importing products..." : `Import from ${importFile.name}`}
            </button>
          )}

          {/* Import result */}
          {importResult && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Summary KPIs */}
              <div style={{ background: "#EAF3DE", border: "1px solid rgba(59,109,17,0.3)", borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#3B6D11", marginBottom: 12 }}>✅ Import complete</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                  <ResultKPI label="New products" value={importResult.imported}  color="#3B6D11" />
                  <ResultKPI label="Restocked"    value={importResult.restocked} color="#185FA5" />
                  <ResultKPI label="Skipped"      value={importResult.skipped}   color="#854F0B" />
                  <ResultKPI label="Errors"        value={importResult.errors?.length || 0} color="#A32D2D" />
                </div>
              </div>

              {/* Warnings — supplier mismatches etc */}
              {importResult.warnings?.length > 0 && (
                <div style={{ background: "#FAEEDA", border: "1px solid rgba(133,79,11,0.3)", borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#854F0B", marginBottom: 8 }}>
                    ⚠️ {importResult.warnings.length} warning{importResult.warnings.length !== 1 ? "s" : ""} — products were imported but check these:
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {importResult.warnings.map((w, i) => (
                      <div key={i} style={{ fontSize: 12, color: "#854F0B", lineHeight: 1.5 }}>• {w}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors — rows that failed */}
              {importResult.errors?.length > 0 && (
                <div style={{ background: "#FCEBEB", border: "1px solid rgba(163,45,45,0.3)", borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#A32D2D", marginBottom: 8 }}>
                    ❌ {importResult.errors.length} row{importResult.errors.length !== 1 ? "s" : ""} failed — fix these in your file and re-import:
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {importResult.errors.map((e, i) => (
                      <div key={i} style={{ fontSize: 12, color: "#A32D2D", lineHeight: 1.5 }}>• {e}</div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => { setImportResult(null); setImportFile(null); }}
                style={{ ...primaryBtn, padding: "10px 0" }}>
                Import another file
              </button>
            </div>
          )}
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

            {!editing && <div style={hintBanner}>After adding, go to <strong style={{ color: "#e8ecf2" }}>Inventory → Receive stock</strong> to add stock.</div>}
            {formError && <div style={errorBox}>{formError}</div>}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Product name <span style={starStyle}>*</span></label>
                <input placeholder="e.g. Indomie Noodles" {...field("product_name")} />
              </div>

              <div>
                <label style={labelStyle}>Barcode <span style={starStyle}>*</span></label>
                <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
                  <input placeholder="Scan, type, or generate" value={form.barcode}
                    onChange={e => { setForm(f => ({ ...f, barcode: e.target.value })); setShowBarcode(false); }}
                    style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
                  <button type="button"
                    onClick={() => { setForm(f => ({ ...f, barcode: generateBarcode() })); setShowBarcode(true); }}
                    style={{ padding: "0 12px", borderRadius: 7, border: "1px solid #3a4255", background: "#1a2438", color: "#8a93a6", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", fontWeight: 500 }}>
                    Generate
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "#5a6475", marginTop: 4 }}>
                  Scan a physical barcode, type one, or click Generate for products without barcodes.
                </div>
              </div>

              {showBarcode && form.barcode && (
                <div>
                  <label style={{ ...labelStyle, marginBottom: 6 }}>Barcode preview</label>
                  <BarcodeDisplay value={form.barcode} productName={form.product_name} />
                  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#8a93a6" }}>Print</span>
                    <input type="number" min="1" max="100" value={printQty}
                      onChange={e => setPrintQty(Math.max(1, parseInt(e.target.value)||1))}
                      style={{ ...inputStyle, marginTop: 0, width: 60, padding: "5px 8px" }} />
                    <span style={{ fontSize: 11, color: "#8a93a6" }}>label{printQty!==1?"s":""}</span>
                    <button onClick={() => printBarcodeLabel(form.barcode, form.product_name, printQty)}
                      style={{ ...primaryBtn, padding: "6px 14px", fontSize: 12 }}>🖨️ Print</button>
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>Category</label>
                <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} style={inputStyle}>
                  <option value="">— None —</option>
                  {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Supplier (optional)</label>
                <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))} style={inputStyle}>
                  <option value="">— No supplier —</option>
                  {suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
                </select>
                {suppliers.length === 0 && (
                  <div style={{ fontSize: 11, color: "#5a6475", marginTop: 4 }}>
                    No suppliers yet — add them in the Suppliers page first.
                  </div>
                )}
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

              {editing && form.barcode && !showBarcode && (
                <button type="button" onClick={() => setShowBarcode(true)}
                  style={{ ...primaryBtn, background: "#1a2438", border: "1px solid #3a4255", color: "#8a93a6", fontSize: 12, padding: "7px 14px" }}>
                  🏷️ Show barcode label
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
              <button onClick={() => setShowForm(false)} style={{ ...cancelBtn, flex: 1 }} disabled={formLoading}>Cancel</button>
              <button onClick={handleSubmit} style={{ ...primaryBtn, flex: 2 }} disabled={formLoading}>
                {formLoading ? "Saving..." : editing ? "Save changes" : "Add product"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Barcode label modal ── */}
      {barcodeModal && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 400 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={modalTitle}>Barcode label</h2>
              <button onClick={() => setBarcodeModal(null)} style={closeBtn}>×</button>
            </div>
            <BarcodeDisplay value={barcodeModal.barcode} productName={barcodeModal.product_name} />
            <div style={{ fontSize: 12, color: "#8a93a6", textAlign: "center", marginTop: 8 }}>CODE-128 · {barcodeModal.barcode}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 12, color: "#8a93a6" }}>Quantity:</span>
              <input type="number" min="1" max="100" value={printQty}
                onChange={e => setPrintQty(Math.max(1, parseInt(e.target.value)||1))}
                style={{ ...inputStyle, marginTop: 0, width: 64, padding: "6px 8px" }} />
              <button onClick={() => printBarcodeLabel(barcodeModal.barcode, barcodeModal.product_name, printQty)}
                style={{ ...primaryBtn, padding: "8px 18px" }}>🖨️ Print {printQty}</button>
            </div>
            <button onClick={() => setBarcodeModal(null)} style={{ ...cancelBtn, width: "100%", marginTop: 12 }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultKPI({ label, value, color }) {
  return (
    <div style={{ textAlign: "center", background: "rgba(255,255,255,0.4)", borderRadius: 8, padding: "10px 8px" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#3B6D11", marginTop: 2 }}>{label}</div>
    </div>
  );
}

const inputStyle   = { display: "block", width: "100%", padding: "9px 11px", borderRadius: 7, border: "1.5px solid #3a4255", fontSize: 13, background: "#1e2535", color: "#e8ecf2", boxSizing: "border-box", marginTop: 5, outline: "none", fontFamily: "inherit" };
const labelStyle   = { fontSize: 12, fontWeight: 500, color: "#c0c7d4", display: "block" };
const starStyle    = { color: "#E24B4A", marginLeft: 2 };
const hintBanner   = { background: "#1a2438", border: "1px solid #2a3247", borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "#8a93a6", marginBottom: 16, lineHeight: 1.5 };
const primaryBtn   = { padding: "9px 18px", borderRadius: 8, border: "none", background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" };
const cancelBtn    = { padding: "9px 18px", borderRadius: 8, border: "1px solid #3a4255", background: "none", color: "#c0c7d4", fontSize: 13, cursor: "pointer" };
const outlineBtn   = { padding: "7px 14px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", background: "none", fontSize: 12, cursor: "pointer", color: "var(--color-text-secondary)" };
const editBtn      = { padding: "4px 12px", borderRadius: 6, border: "none", background: "#E6F1FB", color: "#185FA5", fontSize: 11, fontWeight: 500, cursor: "pointer" };
const barcodeBtn   = { padding: "4px 8px", borderRadius: 6, border: "none", background: "#FAEEDA", color: "#854F0B", fontSize: 12, cursor: "pointer" };
const pageBtn      = (d) => ({ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--color-border-tertiary)", background: "none", fontSize: 12, cursor: d?"default":"pointer", opacity: d?0.4:1, color: "var(--color-text-primary)" });
const errorBox     = { background: "#FCEBEB", color: "#A32D2D", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 14 };
const infoCard     = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 18px", marginBottom: 16 };
const requiredBadge = { fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 8, background: "#E6F1FB", color: "#185FA5" };
const optionalBadge = { fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 8, background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" };
const tableWrap    = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" };
const thStyle      = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" };
const tdStyle      = { padding: "11px 14px", fontSize: 13, color: "var(--color-text-primary)" };
const emptyTd      = { textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 };
const modalStyle   = { background: "#151b28", borderRadius: 14, padding: 24, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.5)", border: "1px solid #2a3247" };
const modalTitle   = { fontSize: 16, fontWeight: 600, margin: 0, color: "#e8ecf2" };
const closeBtn     = { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#8a93a6", lineHeight: 1, padding: 0 };