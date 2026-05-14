"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Post {
  id: string;
  category_id: string;
  title: string;
  body: string;
  author_name: string;
  created_at: string;
}

interface Comment {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  author_name: string;
  deleted: number;
  created_at: string;
}

interface VoteScore {
  upvotes: number;
  downvotes: number;
  score: number;
  user_vote: 1 | -1 | 0;
}

interface CommentWithReplies {
  comment: Comment;
  replies: Comment[];
  score: VoteScore;
}

const CATEGORY_LABELS: Record<string, string> = {
  stocks: "종목 토론",
  strategies: "투자 전략",
  macro: "매크로",
  general: "자유 토론",
  question: "질문",
};

const CATEGORY_COLORS: Record<string, string> = {
  stocks: "text-blue-400 bg-blue-400/10",
  strategies: "text-green-400 bg-green-400/10",
  macro: "text-amber-400 bg-amber-400/10",
  general: "text-purple-400 bg-purple-400/10",
  question: "text-pink-400 bg-pink-400/10",
};

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

function VoteButtons({
  score,
  onVote,
  size = "md",
}: {
  score: VoteScore;
  onVote: (value: 1 | -1) => void;
  size?: "sm" | "md";
}) {
  const iconSize = size === "sm" ? "14px" : "18px";
  const textSize = size === "sm" ? "text-[11px]" : "text-sm";

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onVote(1)}
        className={`p-1 rounded transition-colors ${
          score.user_vote === 1
            ? "text-primary bg-primary/10"
            : "text-on-surface-variant hover:text-primary hover:bg-primary/10"
        }`}
        title="추천"
      >
        <span className="material-symbols-outlined" style={{ fontSize: iconSize }}>
          arrow_upward
        </span>
      </button>
      <span
        className={`font-black tabular-nums ${textSize} ${
          score.score > 0 ? "text-primary" : score.score < 0 ? "text-error" : "text-on-surface-variant"
        }`}
      >
        {score.score}
      </span>
      <button
        onClick={() => onVote(-1)}
        className={`p-1 rounded transition-colors ${
          score.user_vote === -1
            ? "text-error bg-error/10"
            : "text-on-surface-variant hover:text-error hover:bg-error/10"
        }`}
        title="비추천"
      >
        <span className="material-symbols-outlined" style={{ fontSize: iconSize }}>
          arrow_downward
        </span>
      </button>
    </div>
  );
}

function CommentItem({
  item,
  postId,
  onReply,
  onDelete,
  onVote,
}: {
  item: CommentWithReplies;
  postId: string;
  onReply: (parentId: string) => void;
  onDelete: (commentId: string) => void;
  onVote: (commentId: string, value: 1 | -1) => void;
}) {
  const { comment, replies, score } = item;
  const isDeleted = comment.deleted === 1;

  return (
    <div className="space-y-2">
      {/* Top-level comment */}
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "16px" }}>
            person
          </span>
        </div>
        <div className="flex-1 min-w-0">
          {isDeleted ? (
            <p className="text-xs text-on-surface-variant/40 italic py-1">[삭제된 댓글]</p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-on-surface">{comment.author_name}</span>
                <span className="text-[11px] text-on-surface-variant/50">{timeAgo(comment.created_at)}</span>
              </div>
              <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{comment.body}</p>
              <div className="flex items-center gap-3 mt-2">
                <VoteButtons score={score} onVote={(v) => onVote(comment.id, v)} size="sm" />
                <button
                  onClick={() => onReply(comment.id)}
                  className="text-[11px] text-on-surface-variant hover:text-primary transition-colors"
                >
                  답글
                </button>
                <button
                  onClick={() => onDelete(comment.id)}
                  className="text-[11px] text-on-surface-variant/40 hover:text-error transition-colors"
                >
                  삭제
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-11 space-y-2 border-l-2 border-outline-variant/10 pl-4">
          {replies.map((reply) =>
            reply.deleted ? (
              <p key={reply.id} className="text-xs text-on-surface-variant/40 italic py-1">
                [삭제된 댓글]
              </p>
            ) : (
              <div key={reply.id} className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-surface-container-high flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "12px" }}>
                    person
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold text-on-surface">{reply.author_name}</span>
                    <span className="text-[10px] text-on-surface-variant/50">{timeAgo(reply.created_at)}</span>
                  </div>
                  <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{reply.body}</p>
                  <button
                    onClick={() => onDelete(reply.id)}
                    className="mt-1 text-[11px] text-on-surface-variant/40 hover:text-error transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function CommentForm({
  postId,
  parentId,
  placeholder,
  onSubmit,
  onCancel,
}: {
  postId: string;
  parentId?: string | null;
  placeholder: string;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    const res = await fetch("/api/board/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        post_id: postId,
        parent_id: parentId ?? null,
        body: body.trim(),
        author_name: authorName || "익명",
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      setBody("");
      setAuthorName("");
      onSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="닉네임 (선택)"
          maxLength={30}
          className="w-32 bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary"
        />
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        required
        rows={3}
        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary resize-none"
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
          >
            취소
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="px-4 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {submitting ? "등록 중..." : "등록"}
        </button>
      </div>
    </form>
  );
}

export default function PostDetailClient({ id }: { id: string }) {
  const [post, setPost] = useState<Post | null>(null);
  const [postScore, setPostScore] = useState<VoteScore>({
    upvotes: 0,
    downvotes: 0,
    score: 0,
    user_vote: 0,
  });
  const [comments, setComments] = useState<CommentWithReplies[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const fetchPost = useCallback(async () => {
    const voterId = getVoterId();
    const res = await fetch(`/api/board/posts/${id}`, {
      headers: { "x-voter-id": voterId },
    });
    if (res.ok) {
      const data = await res.json();
      setPost(data.post);
      setComments(data.comments ?? []);
      // Build post vote score from comments meta (not available directly, start at 0)
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  const handlePostVote = async (value: 1 | -1) => {
    const voter_id = getVoterId();
    const res = await fetch("/api/board/votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_type: "post", target_id: id, value, voter_id }),
    });
    if (res.ok) {
      const { score } = await res.json();
      setPostScore(score);
    }
  };

  const handleCommentVote = async (commentId: string, value: 1 | -1) => {
    const voter_id = getVoterId();
    const res = await fetch("/api/board/votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_type: "comment", target_id: commentId, value, voter_id }),
    });
    if (res.ok) {
      const { score } = await res.json();
      setComments((prev) =>
        prev.map((item) =>
          item.comment.id === commentId ? { ...item, score } : item
        )
      );
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    await fetch(`/api/board/comments/${commentId}`, { method: "DELETE" });
    fetchPost();
  };

  const handleDeletePost = async () => {
    if (!confirm("게시글을 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/board/posts/${id}`, { method: "DELETE" });
    if (res.ok) window.location.href = "/board";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-on-surface-variant">
        <span className="material-symbols-outlined mb-3 opacity-20" style={{ fontSize: "48px" }}>
          error_outline
        </span>
        <p className="text-sm mb-4">게시글을 찾을 수 없습니다.</p>
        <Link href="/board" className="text-xs text-primary hover:underline">
          목록으로 돌아가기
        </Link>
      </div>
    );
  }

  const catColors = CATEGORY_COLORS[post.category_id] ?? "text-on-surface-variant bg-surface-container";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        href="/board"
        className="inline-flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors"
      >
        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
          arrow_back
        </span>
        Board 목록
      </Link>

      {/* Post */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="p-6">
          {/* Meta */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${catColors}`}>
              {CATEGORY_LABELS[post.category_id] ?? post.category_id}
            </span>
            <span className="text-xs text-on-surface-variant">{post.author_name}</span>
            <span className="text-xs text-on-surface-variant/40">·</span>
            <span className="text-xs text-on-surface-variant">{timeAgo(post.created_at)}</span>
          </div>

          {/* Title */}
          <h1 className="text-xl font-black text-on-surface tracking-tight mb-4">{post.title}</h1>

          {/* Body */}
          <div className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
            {post.body}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-outline-variant/10">
            <VoteButtons score={postScore} onVote={handlePostVote} />
            <button
              onClick={handleDeletePost}
              className="text-xs text-on-surface-variant/40 hover:text-error transition-colors"
            >
              삭제
            </button>
          </div>
        </div>
      </div>

      {/* Comments */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/10">
          <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            댓글 {comments.length}개
          </span>
        </div>

        {/* New comment form */}
        <div className="p-6 border-b border-outline-variant/10">
          <CommentForm
            postId={id}
            placeholder="댓글을 입력하세요..."
            onSubmit={fetchPost}
          />
        </div>

        {/* Comment list */}
        <div className="divide-y divide-outline-variant/10">
          {comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-on-surface-variant">
              <span className="material-symbols-outlined mb-2 opacity-20" style={{ fontSize: "32px" }}>
                chat_bubble_outline
              </span>
              <p className="text-xs">첫 번째 댓글을 달아보세요.</p>
            </div>
          ) : (
            comments.map((item) => (
              <div key={item.comment.id} className="p-6">
                <CommentItem
                  item={item}
                  postId={id}
                  onReply={(parentId) =>
                    setReplyTo(replyTo === parentId ? null : parentId)
                  }
                  onDelete={handleDeleteComment}
                  onVote={handleCommentVote}
                />
                {/* Reply form */}
                {replyTo === item.comment.id && (
                  <div className="ml-11 mt-3 pl-4 border-l-2 border-primary/30">
                    <CommentForm
                      postId={id}
                      parentId={item.comment.id}
                      placeholder="답글을 입력하세요..."
                      onSubmit={() => {
                        setReplyTo(null);
                        fetchPost();
                      }}
                      onCancel={() => setReplyTo(null)}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
