import { useState, useRef } from "react";
import api from "../api/api";

// ── Excel template columns (shown to user) ────────────────────────────────────
const REQUIRED_COLS = ["product_name", "barcode", "selling_price"];
const OPTIONAL_COLS = ["category", "cost_price", "stock_quantity"];

export default function ProductImportPage() {
  const [file, setFile]           = useState(null);
  const [dragging, setDragging]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);   // { imported, skipped, errors }
  const [error, setError]         = useState(null);
  const inputRef                  = useRef();

  const handleFile = (f) => {
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext)) {
      setError("Only .xlsx, .xls or .csv files are supported.");
      return;
    }
    setFile(f);
    setError(null);
    setResult(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await api.post("/products/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
      setFile(null);
    } catch (err) {
      setError(err.response?.data?.detail || "Import failed. Check your file format.");
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    // Build a minimal CSV template the user can open in Excel
    const rows = [
      [...REQUIRED_COLS, ...OPTIONAL_COLS].join(","),
      "Indomie Noodles,0404,600,Food,450,100",
      "Milk 500ml,0707,700,Beverages,500,50",
    ].join("\n");

    const blob = new Blob([rows], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "product_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box", maxWidth: 720 }}>

      {/* Instructions */}
      <div style={infoCard}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--color-text-primary)" }}>
          📋 How to import products
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 2 }}>
          <li>Download the template below and open it in Excel or Google Sheets</li>
          <li>Fill in your products — one product per row</li>
          <li>Save as <strong>.xlsx</strong> or <strong>.csv</strong></li>
          <li>Upload the file here — products are added to your branch automatically</li>
        </ol>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 6 }}>
            Required columns
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {REQUIRED_COLS.map(c => (
              <span key={c} style={requiredBadge}>{c}</span>
            ))}
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginTop: 10, marginBottom: 6 }}>
            Optional columns
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {OPTIONAL_COLS.map(c => (
              <span key={c} style={optionalBadge}>{c}</span>
            ))}
          </div>
        </div>

        <button onClick={downloadTemplate} style={{ ...outlineBtn, marginTop: 14 }}>
          ⬇ Download template (.csv)
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "#185FA5" : "var(--color-border-tertiary)"}`,
          borderRadius: 12,
          padding: "40px 24px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "rgba(24,95,165,0.04)" : "var(--color-background-primary)",
          transition: "all 0.2s",
          marginBottom: 16,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: "none" }}
          onChange={e => handleFile(e.target.files[0])}
        />
        <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
        {file ? (
          <>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>
              {file.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
              {(file.size / 1024).toFixed(1)} KB · Click to change file
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>
              Drop your file here or click to browse
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
              Supports .xlsx, .xls, .csv
            </div>
          </>
        )}
      </div>

      {/* Error */}
      {error && <div style={errorBox}>{error}</div>}

      {/* Upload button */}
      {file && !result && (
        <button
          onClick={handleUpload}
          disabled={loading}
          style={{ ...primaryBtn, width: "100%", padding: "11px 0", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? "Importing products..." : `Import from ${file.name}`}
        </button>
      )}

      {/* Result */}
      {result && (
        <div style={{ ...infoCard, borderColor: "#3B6D11", background: "#EAF3DE" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#3B6D11", marginBottom: 12 }}>
            ✅ Import complete
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <StatBox label="Imported" value={result.imported ?? result.created ?? 0} color="#3B6D11" />
            <StatBox label="Skipped"  value={result.skipped  ?? 0} color="#854F0B" />
            <StatBox label="Errors"   value={result.errors?.length ?? 0} color="#A32D2D" />
          </div>

          {result.errors?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#A32D2D", marginBottom: 6 }}>
                Rows with errors:
              </div>
              {result.errors.map((e, i) => (
                <div key={i} style={{ fontSize: 12, color: "#A32D2D", padding: "3px 0" }}>
                  • {e}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => { setResult(null); setFile(null); }}
            style={{ ...primaryBtn, marginTop: 14 }}
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.6)", borderRadius: 8,
      padding: "10px 14px", textAlign: "center",
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const infoCard     = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 18px", marginBottom: 16 };
const primaryBtn   = { padding: "8px 20px", borderRadius: 8, border: "none", background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const outlineBtn   = { padding: "7px 14px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", background: "none", fontSize: 12, cursor: "pointer", color: "var(--color-text-secondary)" };
const errorBox     = { background: "#FCEBEB", color: "#A32D2D", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 12 };
const requiredBadge = { fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 8, background: "#E6F1FB", color: "#185FA5" };
const optionalBadge = { fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 8, background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" };