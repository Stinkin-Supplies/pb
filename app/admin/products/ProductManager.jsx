'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

const css = `
  :root {
    --bg: #0e0e0f;
    --surface: #161618;
    --surface2: #1e1e21;
    --border: #2a2a2e;
    --border2: #38383e;
    --text: #e8e8ea;
    --muted: #6e6e7a;
    --accent: #ff4d00;
    --accent2: #ff7a3d;
    --green: #22c55e;
    --yellow: #eab308;
    --red: #ef4444;
    --blue: #3b82f6;
    --radius: 6px;
    --font: 'DM Mono', 'Fira Mono', monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .pm-wrap {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    font-size: 13px;
  }

  .pm-header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 18px 28px;
    display: flex;
    align-items: center;
    gap: 16px;
    position: sticky;
    top: 0;
    z-index: 50;
  }

  .pm-header h1 {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text);
  }

  .pm-header-accent {
    color: var(--accent);
  }

  .pm-back {
    color: var(--muted);
    text-decoration: none;
    font-size: 12px;
    letter-spacing: 0.06em;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: color 0.15s;
  }
  .pm-back:hover { color: var(--text); }

  .pm-sep { color: var(--border2); }

  .pm-body {
    padding: 24px 28px;
    max-width: 1600px;
  }

  /* ── Filters ── */
  .pm-filters {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 16px;
    align-items: center;
  }

  .pm-search {
    flex: 1;
    min-width: 240px;
    max-width: 380px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 12px;
    color: var(--text);
    font-family: var(--font);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }
  .pm-search:focus { border-color: var(--accent); }
  .pm-search::placeholder { color: var(--muted); }

  .pm-select {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 10px;
    color: var(--text);
    font-family: var(--font);
    font-size: 12px;
    outline: none;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .pm-select:focus { border-color: var(--accent); }

  .pm-btn {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 14px;
    color: var(--text);
    font-family: var(--font);
    font-size: 12px;
    letter-spacing: 0.05em;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .pm-btn:hover { border-color: var(--border2); background: var(--border); }
  .pm-btn.accent { background: var(--accent); border-color: var(--accent); color: #fff; }
  .pm-btn.accent:hover { background: var(--accent2); border-color: var(--accent2); }
  .pm-btn.danger { background: transparent; border-color: var(--red); color: var(--red); }
  .pm-btn.danger:hover { background: var(--red); color: #fff; }
  .pm-btn.success { background: transparent; border-color: var(--green); color: var(--green); }
  .pm-btn.success:hover { background: var(--green); color: #fff; }
  .pm-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── Bulk bar ── */
  .pm-bulk-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--surface);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    padding: 10px 16px;
    margin-bottom: 14px;
    animation: slideIn 0.15s ease;
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .pm-bulk-count {
    font-weight: 600;
    color: var(--accent);
    margin-right: 4px;
  }
  .pm-bulk-label { color: var(--muted); flex: 1; }

  /* ── Stats row ── */
  .pm-stats {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .pm-stat {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 6px 12px;
    font-size: 11px;
    color: var(--muted);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pm-stat strong { color: var(--text); font-size: 13px; }

  /* ── Table ── */
  .pm-table-wrap {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .pm-table {
    width: 100%;
    border-collapse: collapse;
  }

  .pm-table th {
    background: var(--surface2);
    padding: 10px 12px;
    text-align: left;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
  }
  .pm-table th:hover { color: var(--text); }
  .pm-table th.check-col { width: 36px; cursor: default; }

  .pm-table td {
    padding: 9px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pm-table tr:last-child td { border-bottom: none; }
  .pm-table tr:hover td { background: var(--surface2); }
  .pm-table tr.selected td { background: rgba(255,77,0,0.06); }

  .pm-table input[type=checkbox] {
    accent-color: var(--accent);
    width: 14px;
    height: 14px;
    cursor: pointer;
  }

  .pm-sku { color: var(--muted); font-size: 11px; }
  .pm-name { color: var(--text); font-weight: 500; }

  .pm-badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 3px;
    font-size: 10px;
    letter-spacing: 0.06em;
    font-weight: 600;
    text-transform: uppercase;
  }
  .badge-wps    { background: rgba(59,130,246,0.15); color: #60a5fa; }
  .badge-pu     { background: rgba(168,85,247,0.15); color: #c084fc; }
  .badge-vtwin  { background: rgba(234,179,8,0.15);  color: #fbbf24; }
  .badge-active { background: rgba(34,197,94,0.12);  color: var(--green); }
  .badge-inactive { background: rgba(239,68,68,0.12); color: var(--red); }
  .badge-disc   { background: rgba(107,114,128,0.15); color: #9ca3af; }

  .pm-fitment-pill {
    font-size: 10px;
    color: var(--muted);
  }
  .pm-fitment-pill.has { color: var(--green); }

  .pm-img-thumb {
    width: 32px;
    height: 32px;
    object-fit: cover;
    border-radius: 3px;
    background: var(--surface2);
  }
  .pm-img-placeholder {
    width: 32px;
    height: 32px;
    border-radius: 3px;
    background: var(--surface2);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--border2);
    font-size: 14px;
  }

  .pm-edit-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 8px;
    color: var(--muted);
    font-family: var(--font);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .pm-edit-btn:hover { border-color: var(--accent); color: var(--accent); }

  /* ── Pagination ── */
  .pm-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-top: 1px solid var(--border);
    background: var(--surface);
  }
  .pm-page-info { color: var(--muted); font-size: 11px; }
  .pm-page-btns { display: flex; gap: 6px; }

  /* ── Loading / empty ── */
  .pm-loading {
    padding: 60px;
    text-align: center;
    color: var(--muted);
  }
  .pm-spinner {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    margin-bottom: 12px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Modal backdrop ── */
  .pm-modal-bg {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    backdrop-filter: blur(3px);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .pm-modal {
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 8px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
    animation: modalIn 0.18s ease;
  }
  @keyframes modalIn {
    from { opacity: 0; transform: scale(0.97); }
    to   { opacity: 1; transform: scale(1); }
  }

  .pm-modal.narrow { max-width: 540px; }
  .pm-modal.wide   { max-width: 860px; }

  .pm-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 22px;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: var(--surface);
    z-index: 2;
  }
  .pm-modal-title { font-size: 14px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
  .pm-modal-close {
    background: none;
    border: none;
    color: var(--muted);
    font-size: 20px;
    cursor: pointer;
    line-height: 1;
    padding: 2px 6px;
    border-radius: 4px;
    transition: color 0.15s;
  }
  .pm-modal-close:hover { color: var(--text); }

  .pm-modal-body { padding: 22px; }

  .pm-modal-footer {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    padding: 16px 22px;
    border-top: 1px solid var(--border);
    background: var(--surface);
    position: sticky;
    bottom: 0;
  }

  /* ── Form fields ── */
  .pm-field { margin-bottom: 18px; }
  .pm-label {
    display: block;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .pm-input, .pm-textarea {
    width: 100%;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 9px 12px;
    color: var(--text);
    font-family: var(--font);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }
  .pm-input:focus, .pm-textarea:focus { border-color: var(--accent); }
  .pm-textarea { min-height: 90px; resize: vertical; }

  .pm-toggle-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .pm-toggle-row:last-child { border-bottom: none; }
  .pm-toggle-label { flex: 1; font-size: 13px; }
  .pm-toggle-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }

  .pm-toggle {
    position: relative;
    width: 36px;
    height: 20px;
    flex-shrink: 0;
  }
  .pm-toggle input { opacity: 0; width: 0; height: 0; }
  .pm-toggle-slider {
    position: absolute;
    inset: 0;
    background: var(--border2);
    border-radius: 20px;
    cursor: pointer;
    transition: 0.2s;
  }
  .pm-toggle-slider:before {
    content: '';
    position: absolute;
    left: 3px;
    top: 3px;
    width: 14px;
    height: 14px;
    background: #fff;
    border-radius: 50%;
    transition: 0.2s;
  }
  .pm-toggle input:checked + .pm-toggle-slider { background: var(--green); }
  .pm-toggle input:checked + .pm-toggle-slider:before { transform: translateX(16px); }

  /* ── Features list ── */
  .pm-features-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
  .pm-feature-row { display: flex; gap: 8px; align-items: center; }
  .pm-feature-row .pm-input { flex: 1; }
  .pm-feature-del {
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--muted);
    width: 28px;
    height: 28px;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .pm-feature-del:hover { border-color: var(--red); color: var(--red); }

  /* ── Fitment section ── */
  .pm-fitment-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
  .pm-fitment-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 12px;
    font-size: 12px;
  }
  .pm-fitment-row span { flex: 1; }
  .pm-fitment-del {
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    font-size: 14px;
    padding: 2px 4px;
    border-radius: 3px;
    transition: color 0.15s;
  }
  .pm-fitment-del:hover { color: var(--red); }

  .pm-fitment-add {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr auto;
    gap: 8px;
    align-items: end;
  }

  .pm-section-title {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }

  .pm-divider { border: none; border-top: 1px solid var(--border); margin: 20px 0; }

  .pm-toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: var(--radius);
    padding: 12px 18px;
    font-size: 13px;
    z-index: 200;
    animation: toastIn 0.2s ease;
    max-width: 340px;
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .pm-toast.ok { border-color: var(--green); color: var(--green); }
  .pm-toast.err { border-color: var(--red); color: var(--red); }

  .pm-empty { padding: 48px; text-align: center; color: var(--muted); }

  .pm-confirm-msg { color: var(--text); margin-bottom: 18px; line-height: 1.6; }
  .pm-confirm-msg strong { color: var(--accent); }
`;

const PAGE_SIZE = 50;

function vendorBadge(v) {
  if (!v) return null;
  const cls = v === 'WPS' ? 'badge-wps' : v === 'PU' ? 'badge-pu' : v === 'VTWIN' ? 'badge-vtwin' : '';
  return <span className={`pm-badge ${cls}`}>{v}</span>;
}

function statusBadge(row) {
  if (row.is_discontinued) return <span className="pm-badge badge-disc">DISC</span>;
  if (row.is_active === false) return <span className="pm-badge badge-inactive">OFF</span>;
  return <span className="pm-badge badge-active">ON</span>;
}

function Toast({ msg, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, []);
  return <div className={`pm-toast ${type}`}>{msg}</div>;
}

function Toggle({ checked, onChange }) {
  return (
    <label className="pm-toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="pm-toggle-slider" />
    </label>
  );
}

// ── Edit Modal ─────────────────────────────────────────────────────────────────
function EditModal({ product, families, onClose, onSaved, onToast }) {
  const [form, setForm] = useState({
    name:            product.name || '',
    description:     product.description || '',
    features:        Array.isArray(product.features) ? product.features : [],
    is_active:       product.is_active !== false,
    is_discontinued: !!product.is_discontinued,
  });
  const [fitment, setFitment]   = useState([]);
  const [fitLoading, setFitLoading] = useState(true);
  const [saving, setSaving]     = useState(false);

  // New fitment row state
  const [newFamily, setNewFamily]   = useState('');
  const [models, setModels]         = useState([]);
  const [newModel, setNewModel]     = useState('');
  const [years, setYears]           = useState([]);
  const [newYear, setNewYear]       = useState('');

  // Load existing fitment
  useEffect(() => {
    fetch(`/api/admin/products/${product.id}/fitment`)
      .then(r => r.json())
      .then(d => setFitment(d.fitment || []))
      .catch(() => {})
      .finally(() => setFitLoading(false));
  }, [product.id]);

  // Load models when family changes
  useEffect(() => {
    if (!newFamily) { setModels([]); setNewModel(''); setYears([]); setNewYear(''); return; }
    fetch(`/api/fitment/models?family=${encodeURIComponent(newFamily)}`)
      .then(r => r.json())
      .then(d => { setModels(d.models || []); setNewModel(''); setYears([]); setNewYear(''); })
      .catch(() => {});
  }, [newFamily]);

  // Load years when model changes
  useEffect(() => {
    if (!newModel) { setYears([]); setNewYear(''); return; }
    fetch(`/api/fitment/years?model=${encodeURIComponent(newModel)}`)
      .then(r => r.json())
      .then(d => { setYears(d.years || []); setNewYear(''); })
      .catch(() => {});
  }, [newModel]);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const setFeature = (i, val) => {
    const arr = [...form.features];
    arr[i] = val;
    setField('features', arr);
  };
  const addFeature  = () => setField('features', [...form.features, '']);
  const delFeature  = i  => setField('features', form.features.filter((_, j) => j !== i));

  const addFitment = async () => {
    if (!newFamily || !newModel || !newYear) return;
    const res = await fetch(`/api/admin/products/${product.id}/fitment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ family: newFamily, model: newModel, year: parseInt(newYear) }),
    });
    if (res.ok) {
      const d = await res.json();
      setFitment(d.fitment || []);
      onToast('Fitment added', 'ok');
    } else {
      onToast('Failed to add fitment', 'err');
    }
  };

  const delFitment = async (fitmentId) => {
    const res = await fetch(`/api/admin/products/${product.id}/fitment?fitment_id=${fitmentId}`, { method: 'DELETE' });
    if (res.ok) {
      setFitment(f => f.filter(r => r.id !== fitmentId));
      onToast('Fitment removed', 'ok');
    } else {
      onToast('Failed to remove fitment', 'err');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:            form.name,
          description:     form.description,
          features:        form.features.filter(Boolean),
          is_active:       form.is_active,
          is_discontinued: form.is_discontinued,
        }),
      });
      if (res.ok) {
        onToast('Saved', 'ok');
        onSaved({ ...product, ...form });
        onClose();
      } else {
        onToast('Save failed', 'err');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pm-modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pm-modal wide">
        <div className="pm-modal-header">
          <span className="pm-modal-title">Edit — {product.sku}</span>
          <button className="pm-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="pm-modal-body">

          {/* Content */}
          <div className="pm-section-title">Content</div>
          <div className="pm-field">
            <label className="pm-label">Name</label>
            <input className="pm-input" value={form.name} onChange={e => setField('name', e.target.value)} />
          </div>
          <div className="pm-field">
            <label className="pm-label">Description</label>
            <textarea className="pm-textarea" value={form.description} onChange={e => setField('description', e.target.value)} />
          </div>
          <div className="pm-field">
            <label className="pm-label">Features</label>
            <div className="pm-features-list">
              {form.features.map((f, i) => (
                <div key={i} className="pm-feature-row">
                  <input className="pm-input" value={f} onChange={e => setFeature(i, e.target.value)} placeholder={`Feature ${i + 1}`} />
                  <button className="pm-feature-del" onClick={() => delFeature(i)}>×</button>
                </div>
              ))}
            </div>
            <button className="pm-btn" onClick={addFeature}>+ Add Feature</button>
          </div>

          <hr className="pm-divider" />

          {/* Flags */}
          <div className="pm-section-title">Status</div>
          <div className="pm-toggle-row">
            <div className="pm-toggle-label">
              <div>Active</div>
              <div className="pm-toggle-sub">Visible in shop and search</div>
            </div>
            <Toggle checked={form.is_active} onChange={v => setField('is_active', v)} />
          </div>
          <div className="pm-toggle-row">
            <div className="pm-toggle-label">
              <div>Discontinued</div>
              <div className="pm-toggle-sub">Marked as no longer available</div>
            </div>
            <Toggle checked={form.is_discontinued} onChange={v => setField('is_discontinued', v)} />
          </div>

          <hr className="pm-divider" />

          {/* Fitment */}
          <div className="pm-section-title">Fitment</div>
          {fitLoading ? (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading fitment…</div>
          ) : (
            <>
              {fitment.length === 0 && (
                <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 12 }}>No fitment assigned.</div>
              )}
              <div className="pm-fitment-list">
                {fitment.map(r => (
                  <div key={r.id} className="pm-fitment-row">
                    <span>{r.year} — {r.family_name} / {r.model_name}</span>
                    <button className="pm-fitment-del" onClick={() => delFitment(r.id)}>×</button>
                  </div>
                ))}
              </div>

              <div className="pm-section-title" style={{ marginTop: 16 }}>Add Fitment</div>
              <div className="pm-fitment-add">
                <div>
                  <label className="pm-label">Family</label>
                  <select className="pm-select" style={{ width: '100%' }} value={newFamily} onChange={e => setNewFamily(e.target.value)}>
                    <option value="">— Family —</option>
                    {families.map(f => <option key={f.id} value={f.slug}>{f.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="pm-label">Model</label>
                  <select className="pm-select" style={{ width: '100%' }} value={newModel} onChange={e => setNewModel(e.target.value)} disabled={!models.length}>
                    <option value="">— Model —</option>
                    {models.map(m => <option key={m.id} value={m.id}>{m.model_code} — {m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="pm-label">Year</label>
                  <select className="pm-select" style={{ width: '100%' }} value={newYear} onChange={e => setNewYear(e.target.value)} disabled={!years.length}>
                    <option value="">— Year —</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <button className="pm-btn accent" onClick={addFitment} disabled={!newFamily || !newModel || !newYear}>
                  Add
                </button>
              </div>
            </>
          )}
        </div>

        <div className="pm-modal-footer">
          <button className="pm-btn" onClick={onClose}>Cancel</button>
          <button className="pm-btn accent" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Fitment Modal ─────────────────────────────────────────────────────────
function BulkFitmentModal({ count, families, onClose, onDone, onToast }) {
  const [newFamily, setNewFamily] = useState('');
  const [models, setModels]       = useState([]);
  const [newModel, setNewModel]   = useState('');
  const [years, setYears]         = useState([]);
  const [newYear, setNewYear]     = useState('');
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (!newFamily) { setModels([]); setNewModel(''); setYears([]); setNewYear(''); return; }
    fetch(`/api/fitment/models?family=${encodeURIComponent(newFamily)}`)
      .then(r => r.json())
      .then(d => { setModels(d.models || []); setNewModel(''); setYears([]); setNewYear(''); })
      .catch(() => {});
  }, [newFamily]);

  useEffect(() => {
    if (!newModel) { setYears([]); setNewYear(''); return; }
    fetch(`/api/fitment/years?model=${encodeURIComponent(newModel)}`)
      .then(r => r.json())
      .then(d => { setYears(d.years || []); setNewYear(''); })
      .catch(() => {});
  }, [newModel]);

  const apply = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fitment', family: newFamily, model: newModel, year: parseInt(newYear) }),
      });
      if (res.ok) {
        onToast('Fitment assigned to selected products', 'ok');
        onDone();
        onClose();
      } else {
        onToast('Bulk fitment failed', 'err');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pm-modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pm-modal narrow">
        <div className="pm-modal-header">
          <span className="pm-modal-title">Assign Fitment — {count} products</span>
          <button className="pm-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="pm-modal-body">
          <div className="pm-field">
            <label className="pm-label">Family</label>
            <select className="pm-select" style={{ width: '100%' }} value={newFamily} onChange={e => setNewFamily(e.target.value)}>
              <option value="">— Select family —</option>
              {families.map(f => <option key={f.id} value={f.slug}>{f.name}</option>)}
            </select>
          </div>
          <div className="pm-field">
            <label className="pm-label">Model</label>
            <select className="pm-select" style={{ width: '100%' }} value={newModel} onChange={e => setNewModel(e.target.value)} disabled={!models.length}>
              <option value="">— Select model —</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.model_code} — {m.name}</option>)}
            </select>
          </div>
          <div className="pm-field">
            <label className="pm-label">Year</label>
            <select className="pm-select" style={{ width: '100%' }} value={newYear} onChange={e => setNewYear(e.target.value)} disabled={!years.length}>
              <option value="">— Select year —</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="pm-modal-footer">
          <button className="pm-btn" onClick={onClose}>Cancel</button>
          <button className="pm-btn accent" onClick={apply} disabled={saving || !newFamily || !newModel || !newYear}>
            {saving ? 'Applying…' : 'Apply to All Selected'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Modal ──────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, confirmClass, onConfirm, onClose }) {
  return (
    <div className="pm-modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pm-modal narrow">
        <div className="pm-modal-header">
          <span className="pm-modal-title">{title}</span>
          <button className="pm-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="pm-modal-body">
          <p className="pm-confirm-msg" dangerouslySetInnerHTML={{ __html: message }} />
        </div>
        <div className="pm-modal-footer">
          <button className="pm-btn" onClick={onClose}>Cancel</button>
          <button className={`pm-btn ${confirmClass || 'accent'}`} onClick={onConfirm}>
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ProductManager({ brands, categories, vendorCounts, families }) {
  const [products, setProducts] = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);

  const [search, setSearch]     = useState('');
  const [vendor, setVendor]     = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand]       = useState('');

  const [selected, setSelected] = useState(new Set());
  const [editProd, setEditProd] = useState(null);
  const [toast, setToast]       = useState(null);

  const [modal, setModal]       = useState(null); // 'bulkFitment' | 'bulkToggle' | 'bulkDelete' | 'confirm'

  const searchRef  = useRef(null);
  const debounceRef = useRef(null);

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
  };

  const load = useCallback(async (p = 1, q = search, v = vendor, c = category, b = brand) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: PAGE_SIZE });
      if (q) params.set('q', q);
      if (v) params.set('vendor', v);
      if (c) params.set('category', c);
      if (b) params.set('brand', b);
      const res = await fetch(`/api/admin/products?${params}`);
      const d   = await res.json();
      setProducts(d.products || []);
      setTotal(d.total || 0);
      setPage(p);
      setSelected(new Set());
    } catch {
      showToast('Failed to load products', 'err');
    } finally {
      setLoading(false);
    }
  }, [search, vendor, category, brand]);

  useEffect(() => { load(1); }, [vendor, category, brand]);

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(1, val, vendor, category, brand), 350);
  };

  const toggleSelect = (id) => {
    setSelected(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map(p => p.id)));
    }
  };

  const bulkAction = async (action, extra = {}) => {
    const ids = [...selected];
    if (!ids.length) return;
    const res = await fetch('/api/admin/products/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids, ...extra }),
    });
    if (res.ok) {
      const d = await res.json();
      showToast(d.message || 'Done', 'ok');
      load(page);
    } else {
      showToast('Action failed', 'err');
    }
  };

  const handleSaved = (updated) => {
    setProducts(ps => ps.map(p => p.id === updated.id ? { ...p, ...updated } : p));
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const startRow   = (page - 1) * PAGE_SIZE + 1;
  const endRow     = Math.min(page * PAGE_SIZE, total);

  const vendorLabel = (v) => vendorCounts.find(r => r.source_vendor === v);

  return (
    <div className="pm-wrap">
      <style>{css}</style>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="pm-header">
        <a href="/admin" className="pm-back">← Admin</a>
        <span className="pm-sep">/</span>
        <h1>Product <span className="pm-header-accent">Manager</span></h1>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{total.toLocaleString()} products</div>
      </div>

      <div className="pm-body">

        {/* Stats */}
        <div className="pm-stats">
          {vendorCounts.map(v => (
            <div key={v.source_vendor} className="pm-stat">
              {vendorBadge(v.source_vendor)} <strong>{Number(v.count).toLocaleString()}</strong>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="pm-filters">
          <input
            ref={searchRef}
            className="pm-search"
            placeholder="Search name or SKU…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
          <select className="pm-select" value={vendor} onChange={e => { setVendor(e.target.value); }}>
            <option value="">All vendors</option>
            <option value="WPS">WPS</option>
            <option value="PU">Parts Unlimited</option>
            <option value="VTWIN">VTwin</option>
          </select>
          <select className="pm-select" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="pm-select" value={brand} onChange={e => setBrand(e.target.value)}>
            <option value="">All brands</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <button className="pm-btn" onClick={() => {
            setSearch(''); setVendor(''); setCategory(''); setBrand('');
            setTimeout(() => load(1, '', '', '', ''), 0);
          }}>Clear</button>
        </div>

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="pm-bulk-bar">
            <span className="pm-bulk-count">{selected.size}</span>
            <span className="pm-bulk-label">selected</span>
            <button className="pm-btn success" onClick={() => bulkAction('activate')}>Activate</button>
            <button className="pm-btn" onClick={() => bulkAction('deactivate')}>Deactivate</button>
            <button className="pm-btn" onClick={() => setModal('bulkFitment')}>Assign Fitment</button>
            <button className="pm-btn danger" onClick={() => setModal('bulkDelete')}>Delete</button>
            <button className="pm-btn" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}

        {/* Table */}
        <div className="pm-table-wrap">
          {loading ? (
            <div className="pm-loading">
              <div className="pm-spinner" /><br />Loading products…
            </div>
          ) : products.length === 0 ? (
            <div className="pm-empty">No products found.</div>
          ) : (
            <table className="pm-table">
              <thead>
                <tr>
                  <th className="check-col">
                    <input type="checkbox" checked={selected.size === products.length && products.length > 0} onChange={toggleAll} />
                  </th>
                  <th style={{ width: 40 }}></th>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Vendor</th>
                  <th>Brand</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Fitment</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id} className={selected.has(p.id) ? 'selected' : ''}>
                    <td>
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                    </td>
                    <td>
                      {p.image_url
                        ? <img className="pm-img-thumb" src={p.image_url} alt="" loading="lazy" />
                        : <div className="pm-img-placeholder">○</div>
                      }
                    </td>
                    <td><span className="pm-sku">{p.sku}</span></td>
                    <td title={p.name}><span className="pm-name">{p.name}</span></td>
                    <td>{vendorBadge(p.source_vendor)}</td>
                    <td style={{ color: 'var(--muted)' }}>{p.brand || '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>{p.category || '—'}</td>
                    <td>{statusBadge(p)}</td>
                    <td>
                      <span className={`pm-fitment-pill ${p.fitment_count > 0 ? 'has' : ''}`}>
                        {p.fitment_count > 0 ? `${p.fitment_count} rows` : '—'}
                      </span>
                    </td>
                    <td>
                      <button className="pm-edit-btn" onClick={() => setEditProd(p)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {!loading && total > PAGE_SIZE && (
            <div className="pm-pagination">
              <span className="pm-page-info">
                {startRow}–{endRow} of {total.toLocaleString()}
              </span>
              <div className="pm-page-btns">
                <button className="pm-btn" onClick={() => load(page - 1)} disabled={page === 1}>← Prev</button>
                <button className="pm-btn" onClick={() => load(page + 1)} disabled={page >= totalPages}>Next →</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editProd && (
        <EditModal
          product={editProd}
          families={families}
          onClose={() => setEditProd(null)}
          onSaved={handleSaved}
          onToast={showToast}
        />
      )}

      {/* Bulk fitment modal */}
      {modal === 'bulkFitment' && (
        <BulkFitmentModal
          count={selected.size}
          families={families}
          onClose={() => setModal(null)}
          onDone={() => load(page)}
          onToast={showToast}
        />
      )}

      {/* Bulk delete confirm */}
      {modal === 'bulkDelete' && (
        <ConfirmModal
          title="Delete Products"
          message={`This will permanently delete <strong>${selected.size} product${selected.size !== 1 ? 's' : ''}</strong> from catalog_unified. This cannot be undone.`}
          confirmLabel="Delete"
          confirmClass="danger"
          onClose={() => setModal(null)}
          onConfirm={() => {
            setModal(null);
            bulkAction('delete');
          }}
        />
      )}
    </div>
  );
}