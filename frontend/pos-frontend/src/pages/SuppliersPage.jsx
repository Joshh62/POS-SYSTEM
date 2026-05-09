import { useState, useEffect } from "react";
import api from "../api/api";

export default function SuppliersPage() {
  const user    = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = ["admin", "superadmin"].includes(user.role);
  const canEdit = ["admin", "manager"].includes(user.role);

  const [suppliers,  setSuppliers]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [search,     setSearch]     = useState("");

  // ── Selected supplier detail ──────────────────────────────────────────────
  const [selected,   setSelected]   = useState(null);
  const [detailLoad, setDetailLoad] = useState(false);

  // ── Add / Edit modal ──────────────────────────────────────────────────────
  const [showForm,    setShowForm]    = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [formLoad,    setFormLoad]    = useState(false);
  const [formError,   setFormError]   = useState(null);

  // ── Delete confirm ────────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState(null);

  const fetchSuppliers = async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get("/suppliers/", { params: search ? { search } : {} });
      setSuppliers(res.data);
    } catch { setError("Failed to load suppliers."); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchSuppliers(); }, []);

  const viewSupplier = async (s) => {
    setSelected(null);
    setDetailLoad(true);
    try {
      const res = await api.get(`/suppliers/${s.supplier_id}`);
      setSelected(res.data);
    } catch { setSelected(s); }
    finally { setDetailLoad(false); }
  };

  const openCreate = () => {
    setEditing(null); setForm(EMPTY_FORM); setFormError(null); setShowForm(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setForm({
      supplier_name:  s.supplier_name  || "",
      contact_person: s.contact_person || "",
      phone:          s.phone          || "",
      email:          s.email          || "",
      address:        s.address        || "",
    });
    setFormError(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.supplier_name.trim()) { setFormError("Supplier name is required."); return; }
    setFormLoad(true); setFormError(null);
    try {
      if (editing) {
        await api.patch(`/suppliers/${editing.supplier_id}`, form);
      } else {
        await api.post("/suppliers/", form);
      }
      setShowForm(false);
      fetchSuppliers();
      if (editing && selected?.supplier_id === editing.supplier_id) {
        viewSupplier(editing);
      }
    } catch (err) {
      setFormError(err.response?.data?.detail || "Failed to save supplier.");
    } finally { setFormLoad(false); }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/suppliers/${id}`);
      setDeletingId(null);
      if (selected?.supplier_id === id) setSelected(null);
      fetchSuppliers();
    } catch (err) { alert(err.response?.data?.detail || "Failed to delete supplier."); }
  };

  // Filtered list
  const filtered = suppliers.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.supplier_name || "").toLowerCase().includes(q)
      || (s.contact_person || "").toLowerCase().includes(q)
      || (s.phone || "").toLowerCase().includes(q);
  });

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* ── Left: Supplier list ── */}
      <div style={{ width: selected ? 300 : "100%", flexShrink: 0, display: "flex", flexDirection: "column", borderRight: selected ? "1px solid var(--color-border-tertiary)" : "none", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-tertiary)", display: "flex", gap: 8 }}>
          <input
            type="text" placeholder="Search suppliers..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inputS, flex: 1 }}
          />
          {canEdit && (
            <button onClick={openCreate} style={primaryBtn}>+ Add</button>
          )}
        </div>

        {error   && <div style={{ ...errorBox, margin: 12 }}>{error}</div>}
        {loading && <div style={centreMsg}>Loading suppliers...</div>}

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!loading && filtered.length === 0 && (
            <div style={centreMsg}>
              {search ? "No suppliers match your search." : "No suppliers yet. Click + Add to create one."}
            </div>
          )}
          {filtered.map(s => {
            const isSelected = selected?.supplier_id === s.supplier_id;
            return (
              <div key={s.supplier_id} onClick={() => viewSupplier(s)} style={{
                padding: "12px 16px", cursor: "pointer",
                borderBottom: "1px solid var(--color-border-tertiary)",
                background: isSelected ? "var(--color-primary-light)" : "transparent",
                transition: "background 0.1s",
              }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--color-background-secondary)"; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: isSelected ? "var(--color-primary)" : "var(--color-text-primary)" }}>
                      {s.supplier_name}
                    </div>
                    {s.contact_person && (
                      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>{s.contact_person}</div>
                    )}
                    {s.phone && (
                      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>📞 {s.phone}</div>
                    )}
                  </div>
                  {s.product_count > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 20, background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>
                      {s.product_count} product{s.product_count !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: Supplier detail ── */}
      {selected && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Detail header */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>{selected.supplier_name}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                {selected.contact_person && <span>👤 {selected.contact_person}</span>}
                {selected.phone && <span>📞 {selected.phone}</span>}
                {selected.email && <span>✉️ {selected.email}</span>}
                {selected.address && <span>📍 {selected.address}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {canEdit && (
                <button onClick={() => openEdit(selected)} style={outlineBtn("#185FA5")}>Edit</button>
              )}
              {isAdmin && (
                deletingId === selected.supplier_id ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => handleDelete(selected.supplier_id)} style={dangerBtn}>Confirm delete</button>
                    <button onClick={() => setDeletingId(null)} style={ghostBtn}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setDeletingId(selected.supplier_id)} style={outlineBtn("#A32D2D")}>Delete</button>
                )
              )}
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", fontSize: 20, color: "var(--color-text-tertiary)", cursor: "pointer" }}>×</button>
            </div>
          </div>

          {/* Products supplied */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
            {detailLoad ? (
              <div style={centreMsg}>Loading...</div>
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                  Products supplied ({selected.products?.length || 0})
                </div>

                {(!selected.products || selected.products.length === 0) ? (
                  <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", padding: "16px 0" }}>
                    No products linked to this supplier yet. Edit a product and select this supplier.
                  </div>
                ) : (
                  <div style={tableWrap}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                          <th style={th}>Product</th>
                          <th style={th}>Barcode</th>
                          <th style={{ ...th, textAlign: "right" }}>Selling price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.products.map(p => (
                          <tr key={p.product_id} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                            <td style={td}>{p.product_name}</td>
                            <td style={{ ...td, fontSize: 12, color: "var(--color-text-secondary)", fontFamily: "monospace" }}>{p.barcode}</td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 500 }}>
                              ₦{parseFloat(p.selling_price || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Add / Edit modal ── */}
      {showForm && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={modalTitle}>{editing ? "Edit supplier" : "Add supplier"}</h2>
              <button onClick={() => setShowForm(false)} style={closeBtn}>×</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Supplier name *">
                <input style={formInputStyle} value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} placeholder="e.g. Dangote Suppliers Ltd" />
              </Field>
              <Field label="Contact person">
                <input style={formInputStyle} value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} placeholder="e.g. Alhaji Musa" />
              </Field>
              <Field label="Phone number">
                <input style={formInputStyle} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="e.g. 08012345678" />
              </Field>
              <Field label="Email (optional)">
                <input style={formInputStyle} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="supplier@email.com" />
              </Field>
              <Field label="Address (optional)">
                <input style={formInputStyle} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="e.g. Trade Fair, Lagos" />
              </Field>
            </div>

            {formError && <div style={{ ...errorBox, marginTop: 12 }}>{formError}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button onClick={() => setShowForm(false)} style={{ ...modalBtn, background: "none", border: "1px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={formLoad} style={{ ...modalBtn, background: formLoad ? "var(--color-background-secondary)" : "var(--color-primary)", color: formLoad ? "var(--color-text-tertiary)" : "#fff" }}>
                {formLoad ? "Saving..." : editing ? "Save changes" : "Add supplier"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM = { supplier_name: "", contact_person: "", phone: "", email: "", address: "" };

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

const primaryBtn    = { padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer" };
const outlineBtn    = (color) => ({ padding: "6px 12px", borderRadius: 7, border: `1px solid ${color}`, background: "none", color, fontSize: 12, fontWeight: 500, cursor: "pointer" });
const dangerBtn     = { padding: "6px 12px", borderRadius: 7, border: "none", background: "#FCEBEB", color: "#A32D2D", fontSize: 12, fontWeight: 500, cursor: "pointer" };
const ghostBtn      = { padding: "6px 12px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", background: "none", color: "var(--color-text-secondary)", fontSize: 12, cursor: "pointer" };
const modalBtn      = { flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const errorBox      = { background: "var(--error-bg)", color: "var(--error-text)", borderRadius: 8, padding: "9px 13px", fontSize: 13 };
const centreMsg     = { display: "flex", alignItems: "center", justifyContent: "center", padding: 40, color: "var(--color-text-tertiary)", fontSize: 13 };
const tableWrap     = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" };
const th            = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" };
const td            = { padding: "11px 14px", fontSize: 13, color: "var(--color-text-primary)" };
const inputS        = { padding: "7px 10px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 12, outline: "none", fontFamily: "inherit" };
const formInputStyle = { display: "block", width: "100%", padding: "9px 11px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", fontSize: 13, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box", outline: "none", fontFamily: "inherit" };
const overlayStyle  = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 };
const modalStyle    = { background: "var(--color-background-primary)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--shadow)", border: "1px solid var(--color-border-tertiary)" };
const modalTitle    = { fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 };
const closeBtn      = { background: "none", border: "none", fontSize: 22, color: "var(--color-text-tertiary)", cursor: "pointer", padding: 0, lineHeight: 1 };