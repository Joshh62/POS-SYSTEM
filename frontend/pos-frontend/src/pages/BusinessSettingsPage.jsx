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

  // Branch state
  const [branches,       setBranches]       = useState([]);
  const [branchStatus,   setBranchStatus]   = useState(null);
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [branchForm,     setBranchForm]     = useState({ name: "", location: "" });
  const [branchSaving,   setBranchSaving]   = useState(false);
  const [branchError,    setBranchError]    = useState(null);
  const [branchSuccess,  setBranchSuccess]  = useState(null);
  const [editingBranch,  setEditingBranch]  = useState(null);

  // Account deletion state
  const [showDeleteModal,  setShowDeleteModal]  = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteReason,     setDeleteReason]     = useState("");
  const [deleting,         setDeleting]         = useState(false);
  const [deleteError,      setDeleteError]      = useState(null);
  const [deleteRequested,  setDeleteRequested]  = useState(false);

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

  const fetchBranches = async () => {
    try {
      const [branchRes, statusRes] = await Promise.all([
        api.get("/businesses/my/branches"),
        api.get("/businesses/my/branch-status"),
      ]);
      setBranches(branchRes.data);
      setBranchStatus(statusRes.data);
    } catch (err) {
      // Non-critical — don't block page
      console.error("Failed to load branches:", err);
    }
  };

  useEffect(() => { fetchBranding(); fetchBranches(); }, []);

  // ── Logo handlers ─────────────────────────────────────────────────────────
  const handleLogoFile = (file) => {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type)) { setLogoError("Only JPG, PNG, WebP, or SVG files are accepted."); return; }
    if (file.size > 2 * 1024 * 1024) { setLogoError("Logo must be under 2MB."); return; }
    setLogoError(null); setLogoFile(file); setLogoPreview(URL.createObjectURL(file));
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
      setLogoFile(null); setLogoPreview(null);
    } catch (err) {
      setLogoError(err.response?.data?.detail || "Logo upload failed.");
    } finally { setLogoUploading(false); }
  };

  const handleRemoveLogo = async () => {
    try {
      await api.delete("/businesses/my/logo");
      setBranding(b => ({ ...b, logo_url: null }));
      setLogoFile(null); setLogoPreview(null);
    } catch (err) { setLogoError(err.response?.data?.detail || "Failed to remove logo."); }
  };

  // ── Save branding ─────────────────────────────────────────────────────────
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

  // ── Branch handlers ───────────────────────────────────────────────────────
  const handleCreateBranch = async () => {
    if (!branchForm.name.trim()) { setBranchError("Branch name is required."); return; }
    setBranchSaving(true); setBranchError(null);
    try {
      await api.post("/businesses/my/branches", branchForm);
      setBranchSuccess(`Branch '${branchForm.name}' created successfully.`);
      setBranchForm({ name: "", location: "" });
      setShowBranchForm(false);
      fetchBranches();
      setTimeout(() => setBranchSuccess(null), 4000);
    } catch (err) {
      setBranchError(err.response?.data?.detail || "Failed to create branch.");
    } finally { setBranchSaving(false); }
  };

  const handleUpdateBranch = async () => {
    if (!editingBranch || !editingBranch.name.trim()) return;
    setBranchSaving(true); setBranchError(null);
    try {
      await api.patch(`/businesses/my/branches/${editingBranch.branch_id}`, {
        name: editingBranch.name, location: editingBranch.location,
      });
      setBranchSuccess("Branch updated.");
      setEditingBranch(null);
      fetchBranches();
      setTimeout(() => setBranchSuccess(null), 3000);
    } catch (err) {
      setBranchError(err.response?.data?.detail || "Failed to update branch.");
    } finally { setBranchSaving(false); }
  };

  // ── Account deletion ──────────────────────────────────────────────────────
  const handleRequestDeletion = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE MY ACCOUNT") {
      setDeleteError("Please type 'DELETE MY ACCOUNT' exactly to confirm."); return;
    }
    setDeleting(true); setDeleteError(null);
    try {
      await api.post("/businesses/my/request-deletion", {
        confirm_text: deleteConfirmText.trim(),
        reason:       deleteReason,
      });
      setDeleteRequested(true);
      setShowDeleteModal(false);
      // Log out after deletion request
      setTimeout(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/";
      }, 4000);
    } catch (err) {
      setDeleteError(err.response?.data?.detail || "Failed to submit deletion request.");
    } finally { setDeleting(false); }
  };

  const previewColor = form.brand_color || "#185FA5";
  const currentLogo  = logoPreview || branding?.logo_url;

  if (loading) return <div style={centreMsg}>Loading settings...</div>;
  if (error)   return <div style={{ padding: 24 }}><div style={errorBox}>{error}</div></div>;

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box", maxWidth: 720 }}>

      {/* Deletion requested banner */}
      {deleteRequested && (
        <div style={{ background: "#FCEBEB", border: "1px solid rgba(163,45,45,0.3)", borderRadius: 10, padding: "14px 18px", marginBottom: 16, fontSize: 14, color: "#A32D2D", fontWeight: 500 }}>
          ⚠️ Account deletion request submitted. Your account has been suspended.
          You will be logged out in a moment. To cancel, contact +234 815 458 6355 within 90 days.
        </div>
      )}

      {/* ── Logo section ── */}
      <div style={sectionCard}>
        <div style={sectionTitle}>Business logo</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16 }}>
          Appears on PDF invoices and receipts. JPG, PNG, WebP or SVG. Max 2MB. Recommended: square, min 200×200px.
        </div>

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
        <div style={{ background: previewColor, borderRadius: 8, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>{branding?.name || "Your Shop Name"}</span>
          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>Invoice header preview</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => setForm(f => ({ ...f, brand_color: c }))} title={c}
              style={{ width: 28, height: 28, borderRadius: 6, background: c, border: "none", cursor: "pointer",
                outline: form.brand_color === c ? "3px solid var(--color-text-primary)" : "none",
                outlineOffset: 2, transition: "outline 0.1s" }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: previewColor, border: "1px solid var(--color-border-tertiary)", flexShrink: 0 }} />
          <input type="text" value={form.brand_color} onChange={e => setForm(f => ({ ...f, brand_color: e.target.value }))}
            placeholder="#185FA5" maxLength={7} style={{ ...formInput, width: 120, marginTop: 0 }} />
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Custom hex color</span>
          <input type="color" value={form.brand_color} onChange={e => setForm(f => ({ ...f, brand_color: e.target.value }))}
            style={{ width: 32, height: 28, padding: 2, borderRadius: 6, border: "1px solid var(--color-border-tertiary)", cursor: "pointer", background: "none" }} />
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
            <input style={formInput} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Wear Haus" />
          </Field>
          <Field label="Address">
            <input style={formInput} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="e.g. 9 Kashim Ibrahim Road, Kaduna" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Phone number">
              <input style={formInput} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="e.g. 08154586355" />
            </Field>
            <Field label="Email">
              <input style={formInput} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="info@yourshop.com" />
            </Field>
          </div>
          <Field label="Owner name">
            <input style={formInput} value={form.owner_name} onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))} placeholder="e.g. Alhaji Musa" />
          </Field>
        </div>
      </div>

      {/* ── Invoice preview ── */}
      <div style={sectionCard}>
        <div style={sectionTitle}>Invoice preview</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12 }}>How your invoice header will look after saving.</div>
        <div style={{ border: "1px solid var(--color-border-tertiary)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ background: previewColor, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {currentLogo && <img src={currentLogo} alt="logo" style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 6, background: "rgba(255,255,255,0.15)", padding: 4 }} />}
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

      {/* ── Save branding ── */}
      {saveError   && <div style={{ ...errorBox, marginBottom: 12 }}>{saveError}</div>}
      {saveSuccess && <div style={{ ...successBox, marginBottom: 12 }}>✓ Settings saved successfully</div>}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button onClick={fetchBranding} style={{ ...smallBtn("var(--color-background-secondary)", "var(--color-text-secondary)", "1px solid var(--color-border-tertiary)"), padding: "10px 20px", fontSize: 13 }}>Reset</button>
        <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", background: saving ? "var(--color-background-secondary)" : "var(--color-primary)", color: saving ? "var(--color-text-tertiary)" : "#fff", fontSize: 14, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Saving..." : "Save branding settings"}
        </button>
      </div>

      {/* ── Branch management ── */}
      <div style={sectionCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div>
            <div style={sectionTitle}>Branch management</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
              {branchStatus ? (
                branchStatus.max_branches === -1
                  ? `${branchStatus.current_count} branches · Unlimited (Enterprise plan)`
                  : `${branchStatus.current_count} of ${branchStatus.max_branches} branches used`
              ) : "Loading..."}
            </div>
          </div>
          {branchStatus?.can_add && !showBranchForm && (
            <button onClick={() => { setShowBranchForm(true); setBranchError(null); setBranchForm({ name: "", location: "" }); }}
              style={{ ...smallBtn("var(--color-primary)", "#fff"), fontSize: 12 }}>
              + Add branch
            </button>
          )}
        </div>

        {/* Plan limit notice */}
        {branchStatus && !branchStatus.can_add && (
          <div style={{ background: "#FAEEDA", border: "1px solid rgba(133,79,11,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#854F0B", marginBottom: 12 }}>
            ⚠️ You've reached the {branchStatus.max_branches}-branch limit on your{" "}
            <strong style={{ textTransform: "capitalize" }}>{branchStatus.plan}</strong> plan.{" "}
            Upgrade to Business (3 branches) or Enterprise (unlimited) to add more.
          </div>
        )}

        {branchSuccess && <div style={{ ...successBox, marginBottom: 10, fontSize: 12 }}>{branchSuccess}</div>}
        {branchError   && <div style={{ ...errorBox,   marginBottom: 10, fontSize: 12 }}>{branchError}</div>}

        {/* Add branch form */}
        {showBranchForm && (
          <div style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: "14px 16px", marginBottom: 14, border: "1px solid var(--color-border-tertiary)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 12 }}>New branch</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Field label="Branch name *">
                <input style={formInput} value={branchForm.name} onChange={e => setBranchForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Kano Branch" />
              </Field>
              <Field label="Location (optional)">
                <input style={formInput} value={branchForm.location} onChange={e => setBranchForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. 15 Bello Road, Kano" />
              </Field>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => { setShowBranchForm(false); setBranchError(null); }}
                style={smallBtn("var(--color-background-secondary)", "var(--color-text-secondary)", "1px solid var(--color-border-tertiary)")}>
                Cancel
              </button>
              <button onClick={handleCreateBranch} disabled={branchSaving}
                style={{ ...smallBtn("var(--color-primary)", "#fff"), opacity: branchSaving ? 0.7 : 1 }}>
                {branchSaving ? "Creating..." : "Create branch"}
              </button>
            </div>
          </div>
        )}

        {/* Branch list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {branches.map(branch => (
            <div key={branch.branch_id} style={{ background: "var(--color-background-secondary)", borderRadius: 9, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--color-border-tertiary)" }}>
              {editingBranch?.branch_id === branch.branch_id ? (
                <div style={{ flex: 1, display: "flex", gap: 8, alignItems: "center" }}>
                  <input style={{ ...formInput, marginTop: 0, flex: 1 }}
                    value={editingBranch.name}
                    onChange={e => setEditingBranch(b => ({ ...b, name: e.target.value }))} />
                  <input style={{ ...formInput, marginTop: 0, flex: 1 }}
                    value={editingBranch.location || ""}
                    onChange={e => setEditingBranch(b => ({ ...b, location: e.target.value }))}
                    placeholder="Location" />
                  <button onClick={handleUpdateBranch} disabled={branchSaving}
                    style={smallBtn("var(--color-primary)", "#fff")}>
                    {branchSaving ? "..." : "Save"}
                  </button>
                  <button onClick={() => setEditingBranch(null)}
                    style={smallBtn("var(--color-background-secondary)", "var(--color-text-secondary)", "1px solid var(--color-border-tertiary)")}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{branch.name}</div>
                    {branch.location && <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>{branch.location}</div>}
                  </div>
                  <button onClick={() => setEditingBranch({ ...branch })}
                    style={smallBtn("var(--color-background-secondary)", "var(--color-text-secondary)", "1px solid var(--color-border-tertiary)")}>
                    Edit
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Danger zone — Account deletion ── */}
      <div style={{ ...sectionCard, border: "1px solid rgba(163,45,45,0.25)", marginBottom: 40 }}>
        <div style={{ ...sectionTitle, color: "#A32D2D" }}>Danger zone</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 14, lineHeight: 1.7 }}>
          Deleting your account is irreversible after 90 days. All data including products,
          sales history, customers, and inventory will be permanently deleted.
          You have 90 days to cancel the request by contacting support.
        </div>
        <button onClick={() => { setShowDeleteModal(true); setDeleteError(null); setDeleteConfirmText(""); setDeleteReason(""); }}
          style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #A32D2D", background: "transparent", color: "#A32D2D", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
          Request account deletion
        </button>
      </div>

      {/* ── Account deletion modal ── */}
      {showDeleteModal && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "#A32D2D", margin: 0 }}>⚠️ Delete account</h2>
              <button onClick={() => setShowDeleteModal(false)} style={closeBtn}>×</button>
            </div>

            <div style={{ background: "#FCEBEB", border: "1px solid rgba(163,45,45,0.2)", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "#A32D2D", lineHeight: 1.7 }}>
              <strong>This will:</strong>
              <div>• Immediately suspend your account and all staff logins</div>
              <div>• Permanently delete ALL data after 90 days</div>
              <div>• Cancel your subscription immediately</div>
              <div style={{ marginTop: 6 }}>To cancel within 90 days: WhatsApp +234 815 458 6355</div>
            </div>

            <Field label="Reason for leaving (optional)">
              <textarea style={{ ...formInput, height: 70, resize: "vertical" }}
                value={deleteReason} onChange={e => setDeleteReason(e.target.value)}
                placeholder="Tell us why you're leaving — this helps us improve" />
            </Field>

            <div style={{ marginTop: 14 }}>
              <Field label={`Type "DELETE MY ACCOUNT" to confirm`}>
                <input style={{ ...formInput, borderColor: "#A32D2D" }}
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE MY ACCOUNT" />
              </Field>
            </div>

            {deleteError && <div style={{ ...errorBox, marginTop: 10 }}>{deleteError}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button onClick={() => setShowDeleteModal(false)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid var(--color-border-tertiary)", background: "none", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleRequestDeletion} disabled={deleting || deleteConfirmText.trim().toUpperCase() !== "DELETE MY ACCOUNT"}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: deleting || deleteConfirmText.trim().toUpperCase() !== "DELETE MY ACCOUNT" ? "not-allowed" : "pointer", background: deleteConfirmText.trim().toUpperCase() === "DELETE MY ACCOUNT" ? "#A32D2D" : "var(--color-background-secondary)", color: deleteConfirmText.trim().toUpperCase() === "DELETE MY ACCOUNT" ? "#fff" : "var(--color-text-tertiary)" }}>
                {deleting ? "Submitting..." : "Permanently delete account"}
              </button>
            </div>
          </div>
        </div>
      )}
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

const smallBtn   = (bg, color, border) => ({ padding: "6px 12px", borderRadius: 7, border: border || "none", background: bg, color, fontSize: 12, fontWeight: 500, cursor: "pointer" });
const formInput  = { display: "block", width: "100%", padding: "9px 11px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", fontSize: 13, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box", marginTop: 5, outline: "none", fontFamily: "inherit" };
const sectionCard  = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "18px 20px", marginBottom: 16 };
const sectionTitle = { fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 };
const errorBox   = { background: "var(--error-bg)", color: "var(--error-text)", borderRadius: 8, padding: "9px 13px", fontSize: 13 };
const successBox = { background: "#EAF3DE", color: "#3B6D11", borderRadius: 8, padding: "9px 13px", fontSize: 13 };
const centreMsg  = { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-tertiary)", fontSize: 13 };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 };
const modalStyle   = { background: "var(--color-background-primary)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.4)", border: "1px solid var(--color-border-tertiary)" };
const closeBtn     = { background: "none", border: "none", fontSize: 22, color: "var(--color-text-tertiary)", cursor: "pointer", padding: 0, lineHeight: 1 };