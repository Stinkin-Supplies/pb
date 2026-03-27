"use client";
// ============================================================
// app/admin/build-tracker/page.jsx
// Private build tracker — behind Supabase auth.
// Click tasks to toggle done/open. Add notes inline.
// Claude patches via SQL — paste into Supabase SQL editor.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const STATUS_CYCLE = { done: "open", open: "done", pending: "pending", planned: "planned" };

const STATUS_STYLE = {
  done:    { color: "#22c55e", label: "DONE",    dot: "#22c55e" },
  open:    { color: "#e8621a", label: "OPEN",    dot: "#e8621a" },
  pending: { color: "#c9a84c", label: "PENDING", dot: "#c9a84c" },
  planned: { color: "#8a8784", label: "PLANNED", dot: "#8a8784" },
};

const PHASE_ORDER = ["PHASE 0", "PHASE 0B", "PHASE 1", "PHASE 5", "PHASE 6", "PHASE 6B", "PHASE 7", "BUGS"];

export default function BuildTrackerPage() {
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(null);
  const [filter,   setFilter]   = useState("all");   // all | open | done | pending
  const [editNote, setEditNote] = useState(null);     // id of item being note-edited
  const [noteVal,  setNoteVal]  = useState("");
  const [search,   setSearch]   = useState("");

  const supabase = createBrowserSupabaseClient();

  // ── Load ────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("build_tracker_items")
      .select("*")
      .order("phase")
      .order("sort_order");
    if (!error) setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Toggle status ────────────────────────────────────────────
  async function toggleStatus(item) {
    const next = item.status === "done" ? "open" : "done";
    setSaving(item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: next } : i));
    await supabase
      .from("build_tracker_items")
      .update({ status: next })
      .eq("id", item.id);
    setSaving(null);
  }

  // ── Save note ────────────────────────────────────────────────
  async function saveNote(id) {
    await supabase
      .from("build_tracker_items")
      .update({ notes: noteVal || null })
      .eq("id", id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, notes: noteVal || null } : i));
    setEditNote(null);
    setNoteVal("");
  }

  // ── Group by phase ───────────────────────────────────────────
  const grouped = {};
  for (const item of items) {
    if (!grouped[item.phase]) grouped[item.phase] = { label: item.phase_label, items: [] };
    grouped[item.phase].items.push(item);
  }

  // ── Filter + search ──────────────────────────────────────────
  const visibleItems = (phaseItems) => phaseItems.filter(item => {
    const matchFilter = filter === "all" || item.status === filter;
    const matchSearch = !search || item.title.toLowerCase().includes(search.toLowerCase())
      || (item.section ?? "").toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  // ── Stats ────────────────────────────────────────────────────
  const total   = items.length;
  const done    = items.filter(i => i.status === "done").length;
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0;
  const open    = items.filter(i => i.status === "open").length;
  const pending = items.filter(i => i.status === "pending").length;

  return (
    <div style={{
      background: "#0a0909", minHeight: "100vh", color: "#f0ebe3",
      fontFamily: "'Barlow Condensed', sans-serif", padding: "0 0 80px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@300;400;500;600&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .bt-header {
          background: #111010; border-bottom: 1px solid #2a2828;
          padding: 20px 32px; display: flex; align-items: center;
          justify-content: space-between; gap: 24px; flex-wrap: wrap;
        }
        .bt-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 28px; letter-spacing: 0.05em; color: #f0ebe3;
        }
        .bt-title span { color: #e8621a; }
        .bt-version {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px; color: #8a8784; letter-spacing: 0.15em; margin-top: 2px;
        }

        .bt-stats {
          display: flex; gap: 24px; align-items: center;
        }
        .bt-stat { text-align: center; }
        .bt-stat-val {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 28px; line-height: 1; color: #f0ebe3;
        }
        .bt-stat-val.orange { color: #e8621a; }
        .bt-stat-val.green  { color: #22c55e; }
        .bt-stat-val.gold   { color: #c9a84c; }
        .bt-stat-label {
          font-family: 'Share Tech Mono', monospace;
          font-size: 8px; color: #8a8784; letter-spacing: 0.12em;
        }

        .bt-progress-bar {
          width: 200px; height: 4px;
          background: #2a2828; border-radius: 2px; overflow: hidden;
        }
        .bt-progress-fill {
          height: 100%; background: #e8621a;
          transition: width 0.5s ease; border-radius: 2px;
        }

        .bt-controls {
          padding: 14px 32px; background: #0e0d0d;
          border-bottom: 1px solid #1a1919;
          display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
        }
        .bt-search {
          background: #1a1919; border: 1px solid #2a2828;
          color: #f0ebe3; padding: 7px 12px; border-radius: 2px;
          font-family: 'Share Tech Mono', monospace; font-size: 11px;
          letter-spacing: 0.08em; width: 260px; outline: none;
        }
        .bt-search:focus { border-color: #e8621a; }
        .bt-search::placeholder { color: #3a3838; }

        .bt-filter-btn {
          background: none; border: 1px solid #2a2828; color: #8a8784;
          padding: 6px 14px; border-radius: 2px; cursor: pointer;
          font-family: 'Share Tech Mono', monospace; font-size: 9px;
          letter-spacing: 0.12em; transition: all 0.15s;
        }
        .bt-filter-btn:hover  { border-color: #e8621a; color: #e8621a; }
        .bt-filter-btn.active { border-color: #e8621a; color: #e8621a; background: rgba(232,98,26,0.08); }

        .bt-body { max-width: 960px; margin: 0 auto; padding: 32px 24px; }

        .bt-phase { margin-bottom: 40px; }
        .bt-phase-header {
          display: flex; align-items: baseline; gap: 12px;
          margin-bottom: 14px; padding-bottom: 8px;
          border-bottom: 1px solid #2a2828;
        }
        .bt-phase-name {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 22px; letter-spacing: 0.05em; color: #e8621a;
        }
        .bt-phase-label {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px; color: #8a8784; letter-spacing: 0.15em;
        }
        .bt-phase-count {
          margin-left: auto;
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px; color: #8a8784; letter-spacing: 0.1em;
        }

        .bt-section-label {
          font-family: 'Share Tech Mono', monospace;
          font-size: 8px; color: #3a3838; letter-spacing: 0.18em;
          text-transform: uppercase; padding: 10px 0 4px;
        }

        .bt-item {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 9px 12px; border-radius: 2px;
          border: 1px solid transparent;
          transition: background 0.15s, border-color 0.15s;
          cursor: pointer; group: true;
        }
        .bt-item:hover { background: #111010; border-color: #2a2828; }
        .bt-item.done  { opacity: 0.55; }
        .bt-item.done:hover { opacity: 0.75; }

        .bt-checkbox {
          width: 16px; height: 16px; flex-shrink: 0; margin-top: 2px;
          border: 1px solid #3a3838; border-radius: 2px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s; position: relative;
        }
        .bt-item:hover .bt-checkbox { border-color: #e8621a; }
        .bt-checkbox.done  { background: #22c55e; border-color: #22c55e; }
        .bt-checkbox.open  { border-color: #3a3838; }
        .bt-checkbox.pending { border-color: #c9a84c; background: rgba(201,168,76,0.1); }
        .bt-checkbox.planned { border-color: #8a8784; background: rgba(138,135,132,0.1); }
        .bt-checkmark { color: #0a0909; font-size: 10px; font-weight: 700; }

        .bt-item-body { flex: 1; min-width: 0; }
        .bt-item-title {
          font-size: 13px; color: #f0ebe3; line-height: 1.4;
          font-weight: 400; letter-spacing: 0.01em;
        }
        .bt-item.done .bt-item-title { text-decoration: line-through; color: #8a8784; }

        .bt-item-note {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px; color: #8a8784; letter-spacing: 0.05em;
          margin-top: 4px; line-height: 1.5;
        }
        .bt-note-input {
          background: #1a1919; border: 1px solid #e8621a;
          color: #f0ebe3; padding: 5px 8px; border-radius: 2px;
          font-family: 'Share Tech Mono', monospace; font-size: 10px;
          width: 100%; margin-top: 6px; outline: none; letter-spacing: 0.05em;
        }
        .bt-note-actions {
          display: flex; gap: 8px; margin-top: 5px;
        }
        .bt-note-btn {
          background: none; border: 1px solid #2a2828; color: #8a8784;
          padding: 3px 10px; border-radius: 2px; cursor: pointer;
          font-family: 'Share Tech Mono', monospace; font-size: 8px;
          letter-spacing: 0.1em; transition: all 0.15s;
        }
        .bt-note-btn.save  { border-color: #e8621a; color: #e8621a; }
        .bt-note-btn.save:hover  { background: rgba(232,98,26,0.1); }
        .bt-note-btn:hover { border-color: #8a8784; color: #f0ebe3; }

        .bt-item-meta {
          display: flex; align-items: center; gap: 8px; margin-left: auto; flex-shrink: 0;
        }
        .bt-status-pill {
          font-family: 'Share Tech Mono', monospace;
          font-size: 8px; letter-spacing: 0.1em;
          padding: 2px 7px; border-radius: 1px; border: 1px solid;
        }
        .bt-note-icon {
          background: none; border: none; cursor: pointer;
          font-size: 11px; opacity: 0.4; transition: opacity 0.15s; padding: 2px;
        }
        .bt-note-icon:hover { opacity: 1; }
        .bt-saving { width: 14px; height: 14px; }

        .bt-empty {
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px; color: #3a3838; letter-spacing: 0.12em;
          padding: 20px 12px; text-align: center;
        }

        .spinner {
          width: 14px; height: 14px; border: 2px solid #2a2828;
          border-top-color: #e8621a; border-radius: 50%;
          animation: spin 0.6s linear infinite; display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Header ── */}
      <div className="bt-header">
        <div>
          <div className="bt-title">STINKIN<span>'</span> SUPPLIES — BUILD TRACKER</div>
          <div className="bt-version">INTERNAL · ADMIN ONLY · UPDATED {new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}).toUpperCase()}</div>
        </div>
        <div className="bt-stats">
          <div className="bt-stat">
            <div className="bt-stat-val green">{done}</div>
            <div className="bt-stat-label">DONE</div>
          </div>
          <div className="bt-stat">
            <div className="bt-stat-val orange">{open}</div>
            <div className="bt-stat-label">OPEN</div>
          </div>
          <div className="bt-stat">
            <div className="bt-stat-val gold">{pending}</div>
            <div className="bt-stat-label">PENDING</div>
          </div>
          <div className="bt-stat">
            <div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span className="bt-stat-label">PROGRESS</span>
                <span className="bt-stat-label" style={{color:"#e8621a"}}>{pct}%</span>
              </div>
              <div className="bt-progress-bar">
                <div className="bt-progress-fill" style={{width:`${pct}%`}}/>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="bt-controls">
        <input
          className="bt-search"
          placeholder="SEARCH TASKS..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {["all","open","done","pending"].map(f => (
          <button
            key={f}
            className={`bt-filter-btn ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      <div className="bt-body">
        {loading ? (
          <div style={{textAlign:"center",padding:60}}>
            <div className="spinner" style={{width:24,height:24,borderWidth:3}}/>
          </div>
        ) : (
          PHASE_ORDER.map(phase => {
            const group = grouped[phase];
            if (!group) return null;

            const visible = visibleItems(group.items);
            if (visible.length === 0) return null;

            const phaseDone  = group.items.filter(i => i.status === "done").length;
            const phaseTotal = group.items.length;

            // Group by section within phase
            const sections = {};
            for (const item of visible) {
              const sec = item.section ?? "__none__";
              if (!sections[sec]) sections[sec] = [];
              sections[sec].push(item);
            }

            return (
              <div key={phase} className="bt-phase">
                <div className="bt-phase-header">
                  <div className="bt-phase-name">{phase}</div>
                  <div className="bt-phase-label">{group.label.toUpperCase()}</div>
                  <div className="bt-phase-count">{phaseDone}/{phaseTotal}</div>
                </div>

                {Object.entries(sections).map(([sec, secItems]) => (
                  <div key={sec}>
                    {sec !== "__none__" && (
                      <div className="bt-section-label">▸ {sec}</div>
                    )}
                    {secItems.map(item => {
                      const st = STATUS_STYLE[item.status] ?? STATUS_STYLE.open;
                      const isEditingNote = editNote === item.id;

                      return (
                        <div
                          key={item.id}
                          className={`bt-item ${item.status}`}
                          onClick={e => {
                            if (e.target.closest(".bt-note-icon") || e.target.closest(".bt-note-input") || e.target.closest(".bt-note-btn")) return;
                            if (item.status === "pending" || item.status === "planned") return;
                            toggleStatus(item);
                          }}
                        >
                          {/* Checkbox */}
                          <div className={`bt-checkbox ${item.status}`}>
                            {item.status === "done" && <span className="bt-checkmark">✓</span>}
                            {item.status === "pending" && <span style={{color:"#c9a84c",fontSize:9}}>…</span>}
                          </div>

                          {/* Body */}
                          <div className="bt-item-body">
                            <div className="bt-item-title">{item.title}</div>
                            {item.notes && !isEditingNote && (
                              <div className="bt-item-note">↳ {item.notes}</div>
                            )}
                            {isEditingNote && (
                              <div onClick={e => e.stopPropagation()}>
                                <input
                                  className="bt-note-input"
                                  value={noteVal}
                                  onChange={e => setNoteVal(e.target.value)}
                                  placeholder="Add a note..."
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === "Enter") saveNote(item.id);
                                    if (e.key === "Escape") { setEditNote(null); setNoteVal(""); }
                                  }}
                                />
                                <div className="bt-note-actions">
                                  <button className="bt-note-btn save" onClick={() => saveNote(item.id)}>SAVE</button>
                                  <button className="bt-note-btn" onClick={() => { setEditNote(null); setNoteVal(""); }}>CANCEL</button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Meta */}
                          <div className="bt-item-meta" onClick={e => e.stopPropagation()}>
                            {saving === item.id ? (
                              <div className="spinner"/>
                            ) : (
                              <span
                                className="bt-status-pill"
                                style={{ color: st.color, borderColor: st.color, background: `${st.color}10` }}
                              >
                                {st.label}
                              </span>
                            )}
                            <button
                              className="bt-note-icon"
                              title={item.notes ? "Edit note" : "Add note"}
                              onClick={() => {
                                setEditNote(item.id);
                                setNoteVal(item.notes ?? "");
                              }}
                            >
                              {item.notes ? "📝" : "✎"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}