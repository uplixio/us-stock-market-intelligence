"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Category {
  id: string;
  name: string;
  display_name: string;
  description: string;
}

interface PostWithMeta {
  id: string;
  category_id: string;
  title: string;
  body: string;
  author_name: string;
  created_at: string;
  vote_score: number;
  comment_count: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR");
}

function getVoterId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("board_voter_id");
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("board_voter_id", id);
  }
  return id;
}

const CATEGORY_COLORS: Record<string, { dot: string; badge: string }> = {
  notice:     { dot: "bg-sky-200",    badge: "text-sky-200 bg-sky-200/10" },
  stocks:     { dot: "bg-blue-400",   badge: "text-blue-400 bg-blue-400/10" },
  strategies: { dot: "bg-green-400",  badge: "text-green-400 bg-green-400/10" },
  macro:      { dot: "bg-amber-400",  badge: "text-amber-400 bg-amber-400/10" },
  general:    { dot: "bg-purple-400", badge: "text-purple-400 bg-purple-400/10" },
  question:   { dot: "bg-pink-400",   badge: "text-pink-400 bg-pink-400/10" },
};

function NewPostModal({
  categories,
  onClose,
  onCreated,
}: {
  categories: Category[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    const res = await fetch("/api/board/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category_id: categoryId,
        title,
        body,
        author_name: authorName || "익명",
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      onClose();
      onCreated();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl bg-surface-container-low border border-outline-variant/20 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-on-surface">새 글 작성</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-container-high rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                카테고리
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                작성자 (선택)
              </label>
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="익명"
                maxLength={30}
                className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
              제목
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목을 입력하세요"
              maxLength={200}
              required
              className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
              내용
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="내용을 입력하세요"
              required
              rows={6}
              className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !body.trim()}
              className="px-6 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {submitting ? "등록 중..." : "등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PostCard({
  post,
  categories,
  onVote,
}: {
  post: PostWithMeta;
  categories: Category[];
  onVote: (postId: string, value: 1 | -1) => void;
}) {
  const category = categories.find((c) => c.id === post.category_id);
  const colors = CATEGORY_COLORS[post.category_id] ?? {
    dot: "bg-on-surface-variant",
    badge: "text-on-surface-variant bg-surface-container",
  };

  return (
    <div className="flex gap-3 p-4 bg-surface-container-low rounded-xl border border-outline-variant/10 hover:border-outline-variant/30 transition-all group">
      {/* Vote column */}
      <div className="flex flex-col items-center gap-0.5 flex-shrink-0 pt-0.5">
        <button
          onClick={() => onVote(post.id, 1)}
          className="p-1 rounded hover:text-primary hover:bg-primary/10 transition-colors text-on-surface-variant"
          title="추천"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
            arrow_upward
          </span>
        </button>
        <span
          className={`text-xs font-black tabular-nums leading-none py-0.5 ${
            post.vote_score > 0
              ? "text-primary"
              : post.vote_score < 0
              ? "text-error"
              : "text-on-surface-variant"
          }`}
        >
          {post.vote_score}
        </span>
        <button
          onClick={() => onVote(post.id, -1)}
          className="p-1 rounded hover:text-error hover:bg-error/10 transition-colors text-on-surface-variant"
          title="비추천"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
            arrow_downward
          </span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
            {category?.display_name ?? post.category_id}
          </span>
          <span className="text-[11px] text-on-surface-variant">{post.author_name}</span>
          <span className="text-[11px] text-on-surface-variant/40">·</span>
          <span className="text-[11px] text-on-surface-variant">{timeAgo(post.created_at)}</span>
        </div>
        <Link href={`/board/${post.id}`} className="block group/link">
          <h3 className="text-sm font-semibold text-on-surface group-hover/link:text-primary transition-colors line-clamp-1 mb-1">
            {post.title}
          </h3>
          <p className="text-xs text-on-surface-variant line-clamp-2 leading-relaxed">
            {post.body}
          </p>
        </Link>
        <div className="flex items-center gap-4 mt-2">
          <Link
            href={`/board/${post.id}`}
            className="flex items-center gap-1 text-[11px] text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
              chat_bubble_outline
            </span>
            {post.comment_count} 댓글
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function BoardPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sort, setSort] = useState<"hot" | "new" | "top">("hot");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [visitorStats, setVisitorStats] = useState<{ today: number; total: number } | null>(null);

  useEffect(() => {
    fetch("/api/board/visitors", { method: "POST" }).catch(() => {});
    fetch("/api/board/visitors")
      .then((r) => r.json())
      .then((d: { today: number; total: number }) => setVisitorStats(d))
      .catch(() => {});
  }, []);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== "all") params.set("category", selectedCategory);
      params.set("sort", sort);
      if (search) params.set("q", search);
      const res = await fetch(`/api/board/posts?${params}`);
      const data = await res.json();
      setPosts(data.posts ?? []);
      setCategories(data.categories ?? []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, sort, search]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleVote = async (postId: string, value: 1 | -1) => {
    const voter_id = getVoterId();
    const res = await fetch("/api/board/votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_type: "post", target_id: postId, value, voter_id }),
    });
    if (res.ok) {
      const { score } = await res.json();
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, vote_score: score.score } : p))
      );
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-primary">forum</span>
            <h1 className="text-2xl font-black text-on-surface tracking-tight">Board</h1>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-on-surface-variant mt-0.5">
            <span>종목 · 전략 · 매크로 토론 커뮤니티</span>
            {visitorStats !== null && (
              <>
                <span className="opacity-30">|</span>
                <span>오늘 <span className="text-primary font-bold">{visitorStats.today.toLocaleString()}</span>명</span>
                <span className="opacity-30">·</span>
                <span>누적 <span className="text-on-surface font-semibold">{visitorStats.total.toLocaleString()}</span>명</span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg hover:opacity-90 transition-opacity"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
            edit
          </span>
          글쓰기
        </button>
      </div>

      <div className="flex gap-6">
        {/* Category sidebar */}
        <aside className="hidden lg:block w-44 flex-shrink-0">
          <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden sticky top-20">
            <div className="px-4 py-3 border-b border-outline-variant/10">
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                카테고리
              </span>
            </div>
            <nav className="py-1">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  selectedCategory === "all"
                    ? "text-primary font-bold bg-primary/5"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                }`}
              >
                <span className="material-symbols-outlined text-sm">view_list</span>
                전체
              </button>
              {categories.map((cat) => {
                const colors = CATEGORY_COLORS[cat.id] ?? {
                  dot: "bg-on-surface-variant",
                  badge: "",
                };
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      selectedCategory === cat.id
                        ? "text-primary font-bold bg-primary/5"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
                    {cat.display_name}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main feed */}
        <main className="flex-1 min-w-0">
          {/* Sort + Search bar */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-1 bg-surface-container-low rounded-lg border border-outline-variant/10 p-1 flex-shrink-0">
              {(["hot", "new", "top"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors uppercase tracking-wider ${
                    sort === s
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {s === "hot" ? "Hot" : s === "new" ? "New" : "Top"}
                </button>
              ))}
            </div>

            {/* Mobile category select */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="lg:hidden bg-surface-container-low border border-outline-variant/10 rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none"
            >
              <option value="all">전체</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </select>

            <form onSubmit={handleSearch} className="flex-1 flex gap-2 min-w-0">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="제목, 내용 검색..."
                className="flex-1 min-w-0 bg-surface-container-low border border-outline-variant/10 rounded-lg px-3 py-2 text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-surface-container-high rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                  search
                </span>
              </button>
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSearchInput("");
                  }}
                  className="px-2 py-2 text-xs text-on-surface-variant hover:text-error transition-colors flex-shrink-0"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                    close
                  </span>
                </button>
              )}
            </form>
          </div>

          {/* Search result label */}
          {search && (
            <div className="mb-3 text-xs text-on-surface-variant">
              <span className="text-primary font-bold">&quot;{search}&quot;</span> 검색 결과{" "}
              {posts.length}건
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
              <span
                className="material-symbols-outlined mb-3 opacity-20"
                style={{ fontSize: "48px" }}
              >
                forum
              </span>
              <p className="text-sm font-medium mb-1">
                {search ? "검색 결과가 없습니다." : "아직 게시글이 없습니다."}
              </p>
              {!search && (
                <button
                  onClick={() => setShowForm(true)}
                  className="mt-3 text-xs text-primary hover:underline"
                >
                  첫 번째 글을 작성해보세요
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  categories={categories}
                  onVote={handleVote}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {showForm && (
        <NewPostModal
          categories={categories}
          onClose={() => setShowForm(false)}
          onCreated={fetchPosts}
        />
      )}
    </div>
  );
}
