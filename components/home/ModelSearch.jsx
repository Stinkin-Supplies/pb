'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { YEARS } from './eras';

// ─── Model Search — Year dropdown + Modal ────────────────────────────────────
function ModelSearch() {
  const router = useRouter();
  const [selectedYear, setSelectedYear] = useState('');
  const [models, setModels] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const openModal = async (year) => {
    if (!year) return;
    setLoading(true);
    setModalOpen(true);
    try {
      const res = await fetch(`/api/models/search?q=${year}`);
      const data = await res.json();
      const sorted = (data.results || []).sort((a, b) =>
        a.model_name.localeCompare(b.model_name)
      );
      setModels(sorted);
    } catch {
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  const selectModel = (item) => {
    setModalOpen(false);
    router.push(`/browse?year=${item.year}&model=${encodeURIComponent(item.model_code)}&family=${encodeURIComponent(item.family)}`);
  };

  const handleYearChange = (e) => {
    const year = e.target.value;
    setSelectedYear(year);
    if (year) openModal(year);
  };

  // Close modal on Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') setModalOpen(false); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  return (
    <>
      <div className="model-search-wrap">
        <div className="year-select-row">
          <svg className="select-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
          </svg>
          <select
            className="year-select"
            value={selectedYear}
            onChange={handleYearChange}
          >
            <option value="">Select a year…</option>
            {YEARS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <svg className="chevron-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </div>
        {selectedYear && (
          <button className="change-year-btn" onClick={() => { setSelectedYear(''); setModels([]); }}>
            Clear
          </button>
        )}
      </div>

      {/* ── Modal — portaled to body to escape tile stacking context */}
      {modalOpen && typeof document !== 'undefined' && createPortal(
        <div className="model-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="model-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-eyebrow">Select your model</span>
                <h3 className="modal-title">{selectedYear} Models</h3>
              </div>
              <button className="modal-close" onClick={() => setModalOpen(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              {loading ? (
                <div className="modal-loading">
                  <span className="spinner" />
                  <span>Loading models…</span>
                </div>
              ) : models.length === 0 ? (
                <p className="modal-empty">No models found for {selectedYear}.</p>
              ) : (
                <ul className="model-list">
                  {models.map(item => (
                    <li key={`${item.year}-${item.model_code}`}>
                      <button className="model-list-item" onClick={() => selectModel(item)}>
                        <span className="mli-name">{item.model_name}</span>
                        <span className="mli-meta">
                          <span className="mli-code">{item.model_code}</span>
                          <span className="mli-family">{item.family}</span>
                        </span>
                        <svg className="mli-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                          <path d="m9 18 6-6-6-6"/>
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}




export default ModelSearch;