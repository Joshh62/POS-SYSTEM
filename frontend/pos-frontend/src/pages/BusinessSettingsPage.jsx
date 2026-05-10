import { useState, useEffect, useRef } from "react";
import api from "../api/api";

const PRESET_COLORS = [
  "#185FA5", "#0F6E56", "#3B6D11", "#854F0B",
  "#A32D2D", "#5C3D9E", "#B85C00", "#1a6b8a",
  "#2d4a8a", "#8a2d6b", "#2d8a5c", "#6b2d2d",
];

export default function BusinessSettingsPage() {
  const [branding,     setBranding]     = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [saveSuccess,  setSaveSuccess]  = useState(false);
  const [saveError,    setSaveError]    = useState(null);

  // Form state
  const [form, setForm] = useState({
    name: "", address: "", phone: "", email: "", owner_name: "", brand_color: "#185FA5",
  });

  // Logo state
  const [logoFile,      setLogoFile]      = useState(null);
  const [logoPreview,   setLogoPreview]   = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError,     setLogoError]     = useState(null);
  const [logoDragging,  setLogoDragging]  = useState(false);
  const logoInputRef = useRef();

  const fetchBranding = async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get("/businesses/my/branding");
      setBranding(res.data);
      setForm({
        name:        res.data.name        || "",
        address:     res.data.address     || "",
        phone:       res.data.phone       || "",
        email:       res.data.email       || "",
        owner_name:  res.data.owner_name  || "",
        brand_color: res.data.brand_color || "#185FA5",
      });
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load business settings.");
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchBranding(); }, []);

  // ── Logo file selection ───────────────────────────────────────────────────
  const handleLogoFile = (file) => {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type)) {
      setLogoError("Only JPG, PNG, WebP, or SVG files are accepted."); return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Logo must be under 2MB."); return;
    }
    setLogoError(null);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleLogoUpload = async () => {
    if (!logoFile) return;
    setLogoUploading(true); setLogoError(null);
    try {
      const formData = new FormData();
      formData.append("file", logoFile);
      const res = await api.post("/businesses/my/logo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setBranding(b => ({ ...b, logo_url: res.data.logo_url }));
      setLogoFile(null);
      setLogoPreview(null);
    } catch (err) {
      setLogoError(err.response?.data?.detail || "Logo upload failed.");
    } finally { setLogoUploading(false); }
  };

  const handleRemoveLogo = async () => {
    try {
      await api.delete("/businesses/my/logo");
      setBranding(b => ({ ...b, logo_url: null }));
      setLogoFile(null); setLogoPreview(null);
    } catch (err) {
      setLogoError(err.response?.data?.detail || "Failed to remove logo.");
    }
  };

  // ── Save settings ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) { setSaveError("Business name is required."); return; }
    setSaving(true); setSaveError(null); setSaveSuccess(false);
    try {
      const res = await api.patch("/businesses/my/branding", form);
      setBranding(b => ({ ...b, ...res.data }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err.response?.data?.detail || "Failed to save settings.");
    } finally { setSaving(false); }
  };

  // ── Derived brand color for preview ──────────────────────────────────────
  const previewColor = form.brand_color || "#185FA5";
  const currentLogo  = logoPreview || branding?.logo_url;

  if (loading) return <div style={centreMsg}>Loading settings...</div>;
  if (error)   return <div style={{ padding: 24 }}><div style={errorBox}>{error}</div></div>;

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box", maxWidth: 720 }}>

      {/* ── Logo section ── */}
      <div style={sectionCard}>
        <div style={sectionTitle}>Business logo</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16 }}>
          Appears on PDF invoices and receipts. JPG, PNG, WebP or SVG. Max 2MB. Recommended: square, min 200×200px.
        </div>

        {/* Current logo preview */}
        {currentLogo && (
          <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 80, height: 80, borderRadius: 10, border: "1px solid var(--color-border-tertiary)", overflow: "hidden", background: "var(--color-background-secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={currentLogo} alt="Logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                {logoFile ? "Preview — not yet uploaded" : "Current logo"}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {logoFile ? (
                  <>
                    <button onClick={handleLogoUpload} disabled={logoUploading}
                      style={{ ...smallBtn("var(--color-primary)", "#fff"), opacity: logoUploading ? 0.7 : 1 }}>
                      {logoUploading ? "Uploading..." : "✓ Save logo"}
                    </button>
                    <button onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                      style={smallBtn("var(--color-background-secondary)", "var(--color-text-secondary)", "1px solid var(--color-border-tertiary)")}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => logoInputRef.current?.click()} style={smallBtn("var(--color-background-secondary)", "var(--color-text-secondary)", "1px solid var(--color-border-tertiary)")}>
                      Change logo
                    </button>
                    <button onClick={handleRemoveLogo} style={smallBtn("#FCEBEB", "#A32D2D")}>
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {logoError && <div style={{ ...errorBox, marginBottom: 12 }}>{logoError}</div>}

        {/* Drop zone — show if no logo yet */}
        {!currentLogo && (
          <div
            onDragOver={e => { e.preventDefault(); setLogoDragging(true); }}
            onDragLeave={() => setLogoDragging(false)}
            onDrop={e => { e.preventDefault(); setLogoDragging(false); handleLogoFile(e.dataTransfer.files[0]); }}
            onClick={() => logoInputRef.current?.click()}
            style={{
              border: `2px dashed ${logoDragging ? "var(--color-primary)" : "var(--color-border-tertiary)"}`,
              borderRadius: 12, padding: "32px 24px", textAlign: "center", cursor: "pointer",
              background: logoDragging ? "rgba(24,95,165,0.04)" : "var(--color-background-secondary)",
              transition: "all 0.2s",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
              Drop your logo here or click to browse
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
              JPG, PNG, WebP, SVG · Max 2MB
            </div>
          </div>
        )}

        <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml"
          style={{ display: "none" }} onChange={e => handleLogoFile(e.target.files[0])} />
      </div>

      {/* ── Brand color ── */}
      <div style={sectionCard}>
        <div style={sectionTitle}>Brand color</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 14 }}>
          Used for the invoice header and accent color on receipts.
        </div>

        {/* Color preview */}
        <div style={{ background: previewColor, borderRadius: 8, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>{branding?.name || "Your Shop Name"}</span>
          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>Invoice header preview</span>
        </div>

        {/* Preset swatches */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => setForm(f => ({ ...f, brand_color: c }))}
              title={c}
              style={{
                width: 28, height: 28, borderRadius: 6, background: c, border: "none", cursor: "pointer",
                outline: form.brand_color === c ? "3px solid var(--color-text-primary)" : "none",
                outlineOffset: 2, transition: "outline 0.1s",
              }} />
          ))}
        </div>

        {/* Custom hex input */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: previewColor, border: "1px solid var(--color-border-tertiary)", flexShrink: 0 }} />
          <input
            type="text"
            value={form.brand_color}
            onChange={e => setForm(f => ({ ...f, brand_color: e.target.value }))}
            placeholder="#185FA5"
            maxLength={7}
            style={{ ...formInput, width: 120, marginTop: 0 }}
          />
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Custom hex color</span>
          <input
            type="color"
            value={form.brand_color}
            onChange={e => setForm(f => ({ ...f, brand_color: e.target.value }))}
            style={{ width: 32, height: 28, padding: 2, borderRadius: 6, border: "1px solid var(--color-border-tertiary)", cursor: "pointer", background: "none" }}
          />
        </div>
      </div>

      {/* ── Business details ── */}
      <div style={sectionCard}>
        <div style={sectionTitle}>Business details</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16 }}>
          These appear on every invoice and receipt printed from this business.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Business name *">
            <input style={formInput} value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Wear Haus" />
          </Field>

          <Field label="Address">
            <input style={formInput} value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="e.g. 9 Kashim Ibrahim Road, Kaduna" />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Phone number">
              <input style={formInput} value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="e.g. 08154586355" />
            </Field>
            <Field label="Email (optional)">
              <input style={formInput} value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="info@yourshop.com" />
            </Field>
          </div>

          <Field label="Owner name (optional)">
            <input style={formInput} value={form.owner_name}
              onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))}
              placeholder="e.g. Alhaji Musa" />
          </Field>
        </div>
      </div>

      {/* ── Invoice preview card ── */}
      <div style={sectionCard}>
        <div style={sectionTitle}>Invoice preview</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12 }}>
          How your invoice header will look after saving.
        </div>
        <div style={{ border: "1px solid var(--color-border-tertiary)", borderRadius: 10, overflow: "hidden" }}>
          {/* Mock invoice header */}
          <div style={{ background: previewColor, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {currentLogo && (
                <img src={currentLogo} alt="logo" style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 6, background: "rgba(255,255,255,0.15)", padding: 4 }} />
              )}
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{form.name || "YOUR SHOP NAME"}</div>
                <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 2 }}>{form.address || "Your address"}</div>
                <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 11 }}>{form.phone ? `Tel: ${form.phone}` : "Your phone"}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>RECEIPT</div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>#00001</div>
            </div>
          </div>
          <div style={{ padding: "12px 20px", fontSize: 12, color: "var(--color-text-tertiary)", background: "var(--color-background-secondary)" }}>
            Line items appear here...
          </div>
        </div>
      </div>

      {/* Save button */}
      {saveError   && <div style={{ ...errorBox, marginBottom: 12 }}>{saveError}</div>}
      {saveSuccess && <div style={{ ...successBox, marginBottom: 12 }}>✓ Settings saved successfully</div>}

      <div style={{ display: "flex", gap: 10, marginBottom: 40 }}>
        <button onClick={fetchBranding} style={{ ...smallBtn("var(--color-background-secondary)", "var(--color-text-secondary)", "1px solid var(--color-border-tertiary)"), padding: "10px 20px", fontSize: 13 }}>
          Reset
        </button>
        <button onClick={handleSave} disabled={saving} style={{
          flex: 1, padding: "11px 0", borderRadius: 10, border: "none",
          background: saving ? "var(--color-background-secondary)" : "var(--color-primary)",
          color: saving ? "var(--color-text-tertiary)" : "#fff",
          fontSize: 14, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer",
        }}>
          {saving ? "Saving..." : "Save branding settings"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

const smallBtn = (bg, color, border) => ({
  padding: "6px 12px", borderRadius: 7, border: border || "none",
  background: bg, color, fontSize: 12, fontWeight: 500, cursor: "pointer",
});

const formInput  = { display: "block", width: "100%", padding: "9px 11px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", fontSize: 13, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box", marginTop: 5, outline: "none", fontFamily: "inherit" };
const sectionCard  = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "18px 20px", marginBottom: 16 };
const sectionTitle = { fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 };
const errorBox   = { background: "var(--error-bg)", color: "var(--error-text)", borderRadius: 8, padding: "9px 13px", fontSize: 13 };
const successBox = { background: "#EAF3DE", color: "#3B6D11", borderRadius: 8, padding: "9px 13px", fontSize: 13 };
const centreMsg  = { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-tertiary)", fontSize: 13 };