"use client";
import { useCallback, useEffect, useState } from "react";

interface DownloadEntry {
  filename: string;
  size: number;
  mtime: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function PasswordGate({ onAuth }: { onAuth: () => void }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/download/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setPassword("");
        onAuth();
      } else {
        setError("비밀번호가 올바르지 않습니다.");
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary">lock</span>
          <h2 className="text-lg font-bold text-on-surface tracking-tight">
            수강생 인증
          </h2>
        </div>
        <p className="text-xs text-on-surface-variant mb-5 leading-relaxed">
          강의 소스코드 다운로드는 비밀번호가 필요합니다. 수업에서 공유된 비밀번호를 입력하세요.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
              autoFocus
              className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg pl-3 pr-11 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                {show ? "visibility_off" : "visibility"}
              </span>
            </button>
          </div>
          {error && (
            <div className="text-[11px] text-error font-medium">{error}</div>
          )}
          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full px-4 py-2.5 bg-primary text-on-primary text-sm font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {submitting ? "확인 중..." : "확인"}
          </button>
        </form>
      </div>
    </div>
  );
}

function FileCard({ file }: { file: DownloadEntry }) {
  const href = `/api/download/file/${encodeURIComponent(file.filename)}`;
  return (
    <div className="flex items-center gap-4 p-4 bg-surface-container-low rounded-xl border border-outline-variant/10 hover:border-outline-variant/30 transition-all">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <span className="material-symbols-outlined text-primary">folder_zip</span>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-on-surface truncate mb-0.5">
          {file.filename}
        </h3>
        <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
          <span className="tabular-nums">{formatBytes(file.size)}</span>
          <span className="opacity-30">·</span>
          <span>{formatDate(file.mtime)}</span>
        </div>
      </div>
      <a
        href={href}
        download={file.filename}
        className="flex items-center gap-1.5 px-3 py-2 bg-primary text-on-primary text-xs font-bold rounded-lg hover:opacity-90 transition-opacity flex-shrink-0"
      >
        <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
          download
        </span>
        다운로드
      </a>
    </div>
  );
}

export default function DownloadPage() {
  const [status, setStatus] = useState<"loading" | "unauth" | "ready">("loading");
  const [files, setFiles] = useState<DownloadEntry[]>([]);

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch("/api/download/list", { cache: "no-store" });
      if (res.status === 401) {
        setStatus("unauth");
        return;
      }
      const data: { files?: DownloadEntry[] } = await res.json();
      setFiles(data.files ?? []);
      setStatus("ready");
    } catch {
      setStatus("unauth");
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-primary">download</span>
          <h1 className="text-2xl font-black text-on-surface tracking-tight">Download</h1>
        </div>
        <p className="text-[11px] text-on-surface-variant">
          강의 소스코드 및 자료 다운로드
        </p>
      </div>

      {status === "loading" && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      )}

      {status === "unauth" && <PasswordGate onAuth={fetchList} />}

      {status === "ready" && files.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
          <span
            className="material-symbols-outlined mb-3 opacity-20"
            style={{ fontSize: "48px" }}
          >
            folder_zip
          </span>
          <p className="text-sm font-medium">아직 업로드된 파일이 없습니다.</p>
        </div>
      )}

      {status === "ready" && files.length > 0 && (
        <div className="space-y-2">
          {files.map((f) => (
            <FileCard key={f.filename} file={f} />
          ))}
        </div>
      )}
    </div>
  );
}
