"use client";

import { useCallback, useState } from "react";

interface FileUploadProps {
  projectId: string;
  onUploadComplete: () => void;
}

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.txt";
const ACCEPTED_DISPLAY = "PDF, DOCX, TXT";

export default function FileUpload({
  projectId,
  onUploadComplete,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("project_id", projectId);
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      onUploadComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [projectId]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-none p-8 text-center transition-colors ${
        isDragging
          ? "border-amber-500 bg-amber-950/10"
          : "border-neutral-700 hover:border-neutral-600"
      }`}
    >
      {uploading ? (
        <div className="text-neutral-400">
          <div className="animate-pulse text-amber-500 text-sm">
            Uploading...
          </div>
        </div>
      ) : (
        <>
          <p className="text-neutral-400 text-sm mb-2">
            Drag & drop your script or document here
          </p>
          <p className="text-neutral-600 text-xs mb-4">
            Accepts {ACCEPTED_DISPLAY} &middot; Max 20MB
          </p>
          <label className="inline-block cursor-pointer text-xs uppercase tracking-widest text-amber-500 border border-amber-800/50 px-4 py-2 hover:bg-amber-950/30 transition-colors">
            Browse Files
            <input
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
        </>
      )}

      {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
    </div>
  );
}
