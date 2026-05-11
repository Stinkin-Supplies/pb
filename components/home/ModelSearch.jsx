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
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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

  // Lock body scroll when modal open
  useEffect(() => {
    if (modalOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [modalOpen]);

  // Close on Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') setModalOpen(false); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const modal = mounted && modalOpen && createPortal(
    <>
      <style>{`
        .ms-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          animation: msOverlayIn 0.2s ease;
        }
        @keyframes msOverlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .ms-modal {
          position: relative;
          background: #0e0e0e;
          border: 1px solid rgba(201,168,76,0.3);
          width: 100%;
          max-width: 520px;
          max-height: 70vh;
          display: flex;
          flex-direction: column;
          animation: msModalIn 0.25s cubic-bezier(0.22,1,0.36,1);
          box-shadow: 0 24px 64px rgba(0,0,0,0.7);
        }
        @keyframes msModalIn {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .ms-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 20px 24px 16px;
          border-bottom: 1px solid #1a1a1a;
          flex-shrink: 0;
        }
        .ms-modal-eyebrow {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #C9A84C;
          display: block;
          margin-bottom: 4px;
        }
        .ms-modal-title {
          font-family: 'New Sailor', 'Barlow Condensed', sans-serif;
          font-size: 28px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #F5F0E8;
          line-height: 1;
        }
        .ms-modal-close {
          background: rgba(255,255,255,0.05);
          border: 1px solid #2a2a2a;
          color: #888;
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.15s, color 0.15s;
        }
        .ms-modal-close:hover { background: rgba(255,255,255,0.1); color: #F5F0E8; }
        .ms-modal-body {
          overflow-y: auto;
          flex: 1;
          padding: 8px 0;
        }
        .ms-modal-body::-webkit-scrollbar { width: 4px; }
        .ms-modal-body::-webkit-scrollbar-thumb { background: #C9A84C; }
        .ms-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 48px;
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #555;
        }
        .ms-spinner {
          width: 18px; height: 18px;
          border: 2px solid #2a2a2a;
          border-top-color: #C9A84C;
          border-radius: 50%;
          animation: msSpin 0.7s linear infinite;
          flex-shrink: 0;
        }
        @keyframes msSpin { to { transform: rotate(360deg); } }
        .ms-empty {
          padding: 48px 24px;
          text-align: center;
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #444;
        }
        .ms-model-list {
          list-style: none;
          margin: 0; padding: 0;
        }
        .ms-model-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          background: none;
          border: none;
          border-bottom: 1px solid #141414;
          padding: 12px 24px;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s;
          gap: 12px;
        }
        .ms-model-item:hover { background: rgba(201,168,76,0.06); }
        .ms-model-item:hover .ms-item-arrow { color: #C9A84C; transform: translateX(3px); }
        .ms-item-name {
          font-family: 'New Sailor', 'Barlow Condensed', sans-serif;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #E8E2D8;
          flex: 1;
        }
        .ms-item-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .ms-item-code {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.12em;
          color: #C9A84C;
          text-transform: uppercase;
          background: rgba(201,168,76,0.08);
          border: 1px solid rgba(201,168,76,0.2);
          padding: 2px 7px;
        }
        .ms-item-family {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.1em;
          color: #555;
          text-transform: uppercase;
        }
        .ms-item-arrow {
          color: #333;
          flex-shrink: 0;
          transition: color 0.15s, transform 0.15s;
        }
      `}</style>
      <div className="ms-overlay" onClick={() => setModalOpen(false)}>
        <div className="ms-modal" onClick={e => e.stopPropagation()}>
          <div className="ms-modal-header">
            <div>
              <span className="ms-modal-eyebrow">Select your model</span>
              <h3 className="ms-modal-title">{selectedYear} Models</h3>
            </div>
            <button className="ms-modal-close" onClick={() => setModalOpen(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div className="ms-modal-body">
            {loading ? (
              <div className="ms-loading">
                <span className="ms-spinner" />
                <span>Loading models…</span>
              </div>
            ) : models.length === 0 ? (
              <p className="ms-empty">No models found for {selectedYear}.</p>
            ) : (
              <ul className="ms-model-list">
                {models.map(item => (
                  <li key={`${item.year}-${item.model_code}`}>
                    <button className="ms-model-item" onClick={() => selectModel(item)}>
                      <span className="ms-item-name">{item.model_name}</span>
                      <span className="ms-item-meta">
                        <span className="ms-item-code">{item.model_code}</span>
                        <span className="ms-item-family">{item.family}</span>
                      </span>
                      <svg className="ms-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <path d="m9 18 6-6-6-6"/>
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );

  return (
    <>
      <style>{`
        .model-search-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 16px;
          flex-wrap: wrap;
        }
        .year-select-row {
          flex: 1;
          min-width: 180px;
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255,248,220,0.07);
          border: 1px solid rgba(201,168,76,0.25);
          padding: 0 12px;
          height: 42px;
          transition: border-color 0.2s;
        }
        .year-select-row:focus-within {
          border-color: rgba(201,168,76,0.55);
          box-shadow: 0 0 0 3px rgba(201,168,76,0.08);
        }
        .select-ico { width: 14px; height: 14px; color: #C9A84C; flex-shrink: 0; }
        .chevron-ico { width: 14px; height: 14px; color: #888; flex-shrink: 0; pointer-events: none; }
        .year-select {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          font-family: 'New Sailor', 'Barlow Condensed', sans-serif;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: #E8E2D8;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
        }
        .year-select option { background: #111; color: #E8E2D8; }
        .change-year-btn {
          background: none;
          border: 1px solid #2a2a2a;
          color: #666;
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          padding: 8px 14px;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
          height: 42px;
        }
        .change-year-btn:hover { border-color: #C9A84C; color: #C9A84C; }
      `}</style>

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
          <button className="change-year-btn" onClick={() => { setSelectedYear(''); setModels([]); setModalOpen(false); }}>
            Clear
          </button>
        )}
      </div>

      {modal}
    </>
  );
}

export default ModelSearch;