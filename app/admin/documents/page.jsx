"use client";

import { useEffect, useState } from "react";

const SYNC_SECRET = process.env.NEXT_PUBLIC_SYNC_SECRET ?? "";

async function adminFetch(url, init = {}) {
  // Keep consistent with other admin pages: send x-sync-secret from NEXT_PUBLIC_SYNC_SECRET.
  const headers = new Headers(init.headers ?? {});
  headers.set("x-sync-secret", SYNC_SECRET);
  return fetch(url, { ...init, headers });
}

function buildFolderIndex(folders) {
  const byId = new Map();
  const childrenByParent = new Map();

  for (const f of folders) {
    byId.set(f.id, f);
  }

  for (const f of folders) {
    const parentId = f.parent_id ?? null;
    const arr = childrenByParent.get(parentId) ?? [];
    arr.push(f);
    childrenByParent.set(parentId, arr);
  }

  // Stable-ish ordering: name ASC within siblings
  for (const [k, arr] of childrenByParent.entries()) {
    arr.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    childrenByParent.set(k, arr);
  }

  return { byId, childrenByParent };
}

function getBreadcrumb(folderId, folderById) {
  if (!folderId) return [];
  const out = [];
  const seen = new Set();
  let cur = folderById.get(folderId);
  while (cur && !seen.has(cur.id) && out.length < 50) {
    seen.add(cur.id);
    out.push(cur);
    cur = cur.parent_id ? folderById.get(cur.parent_id) : null;
  }
  return out.reverse();
}

function canMoveFolder({ folderId, newParentId, folderById }) {
  if (!folderId) return false;
  if (newParentId === folderId) return false;
  if (!newParentId) return true;

  // Disallow moving into own descendant (walk parents of target up to root)
  const seen = new Set();
  let cur = folderById.get(newParentId);
  while (cur && !seen.has(cur.id) && seen.size < 50) {
    if (cur.id === folderId) return false;
    seen.add(cur.id);
    cur = cur.parent_id ? folderById.get(cur.parent_id) : null;
  }
  return true;
}

export default function DocumentsPage() {
  const [folders, setFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [error, setError] = useState("");

  async function fetchFolders() {
    const res = await adminFetch("/api/admin/folders");
    if (!res.ok) throw new Error(`Folders failed (${res.status})`);
    const data = await res.json();
    setFolders(Array.isArray(data) ? data : []);
  }

  async function fetchDocuments(folderId = null) {
    const url = folderId
      ? `/api/admin/documents?folderId=${encodeURIComponent(folderId)}`
      : `/api/admin/documents`;
    const res = await adminFetch(url);
    if (!res.ok) throw new Error(`Documents failed (${res.status})`);
    const data = await res.json();
    setDocuments(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void (async () => {
      try {
        await fetchFolders();
        await fetchDocuments();
      } catch (e) {
        setError(e?.message ?? "Failed to load documents");
      }
    })();
  }, []);

  useEffect(() => {
    // Auto-expand top-level folders when data loads.
    const { childrenByParent } = buildFolderIndex(folders);
    const roots = childrenByParent.get(null) ?? [];
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const r of roots) next.add(r.id);
      return next;
    });
  }, [folders]);

  function handleFolderClick(folder) {
    setCurrentFolder(folder);
    void fetchDocuments(folder.id);
  }

  async function createFolder(parentId) {
    const name = window.prompt(parentId ? "New subfolder name:" : "New folder name:");
    if (!name) return;
    setError("");
    const res = await adminFetch("/api/admin/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, parentId: parentId ?? null }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      setError(t || `Create folder failed (${res.status})`);
      return;
    }
    await fetchFolders();
    if (parentId) setExpanded((p) => new Set(p).add(parentId));
  }

  async function moveFolder(folderId, newParentId) {
    setError("");
    const res = await adminFetch(`/api/admin/folders/${folderId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentId: newParentId ?? null }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      setError(t || `Move folder failed (${res.status})`);
      return;
    }
    await fetchFolders();
    if (newParentId) setExpanded((p) => new Set(p).add(newParentId));
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");

    const formData = new FormData();
    formData.append("file", file);
    if (currentFolder) formData.append("folderId", currentFolder.id);

    const res = await adminFetch("/api/admin/documents/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      setError(t || `Upload failed (${res.status})`);
      return;
    }

    await fetchDocuments(currentFolder?.id);
  }

  return (
    <div className="flex h-screen">
      <div className="w-64 border-r p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Folders</h2>
          <button
            onClick={() => createFolder(currentFolder?.id ?? null)}
            className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
            title={currentFolder ? "Create subfolder" : "Create folder"}
          >
            New
          </button>
        </div>

        <FolderTree
          folders={folders}
          currentFolderId={currentFolder?.id ?? null}
          expanded={expanded}
          setExpanded={setExpanded}
          onSelectFolder={(folder) => handleFolderClick(folder)}
          onSelectRoot={() => {
            setCurrentFolder(null);
            void fetchDocuments(null);
          }}
          onMoveFolder={moveFolder}
        />
      </div>

      <div className="flex-1 p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-bold">
              {currentFolder ? currentFolder.name : "All Documents"}
            </h1>
            <Breadcrumb
              folders={folders}
              currentFolderId={currentFolder?.id ?? null}
              onSelectRoot={() => {
                setCurrentFolder(null);
                void fetchDocuments(null);
              }}
              onSelectFolder={(folder) => handleFolderClick(folder)}
            />
          </div>

          <label className="cursor-pointer bg-black text-white px-4 py-2 rounded">
            Upload PDF
            <input
              type="file"
              accept="application/pdf"
              onChange={handleUpload}
              className="hidden"
            />
          </label>
        </div>

        {error ? (
          <div className="mb-4 text-sm text-red-600">{error}</div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {documents.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Breadcrumb({ folders, currentFolderId, onSelectRoot, onSelectFolder }) {
  const { byId } = buildFolderIndex(folders);
  const crumbs = getBreadcrumb(currentFolderId, byId);
  if (!crumbs.length) return null;

  return (
    <div className="text-xs text-gray-500 mt-1">
      <button onClick={onSelectRoot} className="underline">
        All Documents
      </button>
      {crumbs.map((f) => (
        <span key={f.id}>
          {" "}
          /{" "}
          <button
            onClick={() => onSelectFolder(f)}
            className="underline"
            title={f.name}
          >
            {f.name}
          </button>
        </span>
      ))}
    </div>
  );
}

function FolderTree({
  folders,
  currentFolderId,
  expanded,
  setExpanded,
  onSelectFolder,
  onSelectRoot,
  onMoveFolder,
}) {
  const { byId, childrenByParent } = buildFolderIndex(folders);
  const roots = childrenByParent.get(null) ?? [];

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleDrop = async ({ draggedId, targetParentId }) => {
    if (!canMoveFolder({ folderId: draggedId, newParentId: targetParentId, folderById: byId })) {
      return;
    }
    const dragged = byId.get(draggedId);
    if (!dragged) return;
    const currentParent = dragged.parent_id ?? null;
    if (currentParent === (targetParentId ?? null)) return;
    await onMoveFolder(draggedId, targetParentId ?? null);
  };

  return (
    <div className="text-sm">
      <div
        onClick={onSelectRoot}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const draggedId = e.dataTransfer.getData("text/plain");
          if (draggedId) void handleDrop({ draggedId, targetParentId: null });
        }}
        className={`cursor-pointer hover:bg-gray-100 p-2 rounded ${
          !currentFolderId ? "bg-gray-100" : ""
        }`}
        title="Drop here to move to root"
      >
        All Documents
      </div>

      <div className="mt-2 space-y-1">
        {roots.map((folder) => (
          <FolderTreeItem
            key={folder.id}
            folder={folder}
            level={0}
            byId={byId}
            childrenByParent={childrenByParent}
            expanded={expanded}
            toggle={toggle}
            currentFolderId={currentFolderId}
            onSelectFolder={onSelectFolder}
            onDropOnFolder={(draggedId, targetParentId) =>
              handleDrop({ draggedId, targetParentId })
            }
          />
        ))}
      </div>
    </div>
  );
}

function FolderTreeItem({
  folder,
  level,
  byId,
  childrenByParent,
  expanded,
  toggle,
  currentFolderId,
  onSelectFolder,
  onDropOnFolder,
}) {
  const children = childrenByParent.get(folder.id) ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(folder.id);

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", folder.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const draggedId = e.dataTransfer.getData("text/plain");
          if (draggedId) void onDropOnFolder(draggedId, folder.id);
        }}
        className={`flex items-center gap-1 cursor-pointer hover:bg-gray-100 p-2 rounded ${
          currentFolderId === folder.id ? "bg-gray-100" : ""
        }`}
        style={{ paddingLeft: 8 + level * 14 }}
        title="Drag to move, drop to make subfolder"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) toggle(folder.id);
          }}
          className="w-5 h-5 flex items-center justify-center text-gray-500"
          aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
        >
          {hasChildren ? (isExpanded ? "▾" : "▸") : <span className="opacity-30">•</span>}
        </button>
        <div
          onClick={() => onSelectFolder(folder)}
          className="flex-1 truncate"
        >
          📁 {folder.name}
        </div>
      </div>

      {hasChildren && isExpanded ? (
        <div className="space-y-1">
          {children.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              level={level + 1}
              byId={byId}
              childrenByParent={childrenByParent}
              expanded={expanded}
              toggle={toggle}
              currentFolderId={currentFolderId}
              onSelectFolder={onSelectFolder}
              onDropOnFolder={onDropOnFolder}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DocumentCard({ doc }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState("");

  async function loadPreview() {
    setError("");
    const res = await adminFetch(`/api/admin/documents/${doc.id}/view`);
    if (!res.ok) {
      setError(`Preview failed (${res.status})`);
      return;
    }
    const data = await res.json();
    setUrl(data.url ?? null);
  }

  return (
    <div className="border rounded-2xl p-3 shadow-sm">
      <div className="h-40 bg-gray-100 flex items-center justify-center mb-2 overflow-hidden rounded-xl">
        {url ? (
          <iframe title={doc.name ?? "Preview"} src={url} className="w-full h-full" />
        ) : (
          <button onClick={loadPreview} className="text-sm underline">
            Preview
          </button>
        )}
      </div>
      {error ? <div className="text-xs text-red-600 mb-1">{error}</div> : null}
      <div className="text-sm font-medium truncate">{doc.name}</div>
    </div>
  );
}
