"use client";

import { useEffect, useState } from "react";

const SYNC_SECRET = process.env.NEXT_PUBLIC_SYNC_SECRET ?? "";

async function adminFetch(url, init = {}) {
  // Keep consistent with other admin pages: send x-sync-secret from NEXT_PUBLIC_SYNC_SECRET.
  const headers = new Headers(init.headers ?? {});
  headers.set("x-sync-secret", SYNC_SECRET);
  return fetch(url, { ...init, headers });
}

export default function DocumentsPage() {
  const [folders, setFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
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

  function handleFolderClick(folder) {
    setCurrentFolder(folder);
    void fetchDocuments(folder.id);
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
        <h2 className="text-lg font-semibold mb-4">Folders</h2>
        <ul className="space-y-2">
          <li
            onClick={() => {
              setCurrentFolder(null);
              void fetchDocuments(null);
            }}
            className="cursor-pointer hover:bg-gray-100 p-2 rounded"
          >
            All Documents
          </li>
          {folders.map((folder) => (
            <li
              key={folder.id}
              onClick={() => handleFolderClick(folder)}
              className="cursor-pointer hover:bg-gray-100 p-2 rounded"
            >
              📁 {folder.name}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex-1 p-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold">
            {currentFolder ? currentFolder.name : "All Documents"}
          </h1>

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
