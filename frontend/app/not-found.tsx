import Link from "next/link";

export default function NotFound() {
  return (
    <div className="bg-surface-container-low rounded-xl p-10 text-center">
      <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-4">
        event_busy
      </span>
      <h2 className="text-xl font-black text-on-surface mb-2">페이지를 찾을 수 없습니다</h2>
      <p className="text-sm text-on-surface-variant mb-6">
        주소를 확인하거나 대시보드로 돌아가세요.
      </p>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary"
      >
        대시보드로 이동
      </Link>
    </div>
  );
}
