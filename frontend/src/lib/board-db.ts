import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

function getDbPath(): string {
  if (process.env.BOARD_DB_PATH) return process.env.BOARD_DB_PATH;
  if (process.env.VERCEL) return "/tmp/board.db";
  if (existsSync("/data")) return "/data/board.db";
  return join(process.cwd(), "board.db");
}

let _db: Database.Database | null = null;

function generateId(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
}

function now(): string {
  return new Date().toISOString();
}

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = getDbPath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES categories(id),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      author_name TEXT NOT NULL DEFAULT '익명',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES comments(id),
      body TEXT NOT NULL,
      author_name TEXT NOT NULL DEFAULT '익명',
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment')),
      target_id TEXT NOT NULL,
      value INTEGER NOT NULL CHECK (value IN (1, -1)),
      voter_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (target_type, target_id, voter_id)
    );

    CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category_id);
    CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
    CREATE INDEX IF NOT EXISTS idx_votes_target ON votes(target_type, target_id);

    CREATE TABLE IF NOT EXISTS page_views (
      date TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date)
    );
  `);

  // 카테고리 시드
  const count = (
    db.prepare("SELECT COUNT(*) as c FROM categories").get() as { c: number }
  ).c;
  if (count === 0) {
    const insert = db.prepare(
      "INSERT INTO categories (id, name, display_name, description, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    const seed: [string, string, string, string][] = [
      ["stocks", "stocks", "종목 토론", "S&P 500 개별 종목 분석 및 토론"],
      ["strategies", "strategies", "투자 전략", "매매 전략, 포트폴리오 구성 공유"],
      ["macro", "macro", "매크로", "거시경제, 금리, 환율, 섹터 이슈"],
      ["general", "general", "자유 토론", "시장 전반 자유 토론"],
      ["question", "question", "질문", "분석 지표, 시스템 사용법 질문"],
    ];
    const insertMany = db.transaction((rows: typeof seed) => {
      for (const [id, name, display_name, description] of rows) {
        insert.run(id, name, display_name, description, now());
      }
    });
    insertMany(seed);
  }

  // 마이그레이션: 공지사항 카테고리 추가 (기존 DB에도 반영)
  db.prepare(`
    INSERT OR IGNORE INTO categories (id, name, display_name, description, created_at)
    VALUES ('notice', 'notice', '공지사항', '운영자 공지사항', ?)
  `).run(now());

  // 마이그레이션: 카테고리 이름 변경
  const renames: [string, string][] = [
    ["stocks",     "강의자료"],
    ["strategies", "Prompts"],
    ["macro",      "News"],
    ["general",    "질문"],
    ["question",   "익명게시판"],
  ];
  for (const [id, name] of renames) {
    db.prepare("UPDATE categories SET display_name = ? WHERE id = ?").run(name, id);
  }
}

// ── Types ──────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  display_name: string;
  description: string;
  created_at: string;
}

export interface Post {
  id: string;
  category_id: string;
  title: string;
  body: string;
  author_name: string;
  created_at: string;
  updated_at: string;
}

export interface PostWithMeta extends Post {
  vote_score: number;
  comment_count: number;
}

export interface Comment {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  author_name: string;
  deleted: number;
  created_at: string;
  updated_at: string;
}

export interface VoteScore {
  upvotes: number;
  downvotes: number;
  score: number;
  user_vote: 1 | -1 | 0;
}

export interface CommentWithReplies {
  comment: Comment;
  replies: Comment[];
  score: VoteScore;
}

// ── Categories ─────────────────────────────────────────────────

export function getCategories(): Category[] {
  return getDb()
    .prepare("SELECT * FROM categories ORDER BY CASE WHEN id='notice' THEN 0 ELSE 1 END, rowid")
    .all() as Category[];
}

// ── Posts ───────────────────────────────────────────────────────

export function getPosts(opts: {
  categoryId?: string;
  sort?: "hot" | "new" | "top";
  search?: string;
  limit?: number;
}): PostWithMeta[] {
  const db = getDb();
  const { categoryId, sort = "hot", search, limit = 50 } = opts;

  const conditions: string[] = ["1=1"];
  const params: (string | number)[] = [];

  if (categoryId && categoryId !== "all") {
    conditions.push("p.category_id = ?");
    params.push(categoryId);
  }
  if (search) {
    conditions.push("(p.title LIKE ? OR p.body LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  const where = conditions.join(" AND ");
  const orderMap = {
    hot: "(COALESCE(SUM(CASE WHEN v.value=1 THEN 1 ELSE 0 END),0) - COALESCE(SUM(CASE WHEN v.value=-1 THEN 1 ELSE 0 END),0)) * 2 + COUNT(DISTINCT c.id) DESC, p.created_at DESC",
    new: "p.created_at DESC",
    top: "(COALESCE(SUM(CASE WHEN v.value=1 THEN 1 ELSE 0 END),0) - COALESCE(SUM(CASE WHEN v.value=-1 THEN 1 ELSE 0 END),0)) DESC, p.created_at DESC",
  };

  return db
    .prepare(
      `SELECT
        p.*,
        COALESCE(SUM(CASE WHEN v.value=1 THEN 1 ELSE 0 END),0) -
        COALESCE(SUM(CASE WHEN v.value=-1 THEN 1 ELSE 0 END),0) AS vote_score,
        COUNT(DISTINCT c.id) AS comment_count
       FROM posts p
       LEFT JOIN votes v ON v.target_type='post' AND v.target_id=p.id
       LEFT JOIN comments c ON c.post_id=p.id AND c.deleted=0
       WHERE ${where}
       GROUP BY p.id
       ORDER BY ${orderMap[sort]}
       LIMIT ?`
    )
    .all(...params, limit) as PostWithMeta[];
}

export function getPost(id: string): Post | null {
  return getDb().prepare("SELECT * FROM posts WHERE id = ?").get(id) as Post | null;
}

export function createPost(data: {
  category_id: string;
  title: string;
  body: string;
  author_name?: string;
}): Post {
  const id = generateId();
  const ts = now();
  getDb()
    .prepare(
      "INSERT INTO posts (id, category_id, title, body, author_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(id, data.category_id, data.title, data.body, data.author_name ?? "익명", ts, ts);
  return getPost(id)!;
}

export function deletePost(id: string): void {
  getDb().prepare("DELETE FROM posts WHERE id = ?").run(id);
}

// ── Comments ────────────────────────────────────────────────────

function buildVoteScore(
  db: Database.Database,
  targetType: "post" | "comment",
  targetId: string,
  voterId?: string
): VoteScore {
  const rows = db
    .prepare("SELECT value, voter_id FROM votes WHERE target_type = ? AND target_id = ?")
    .all(targetType, targetId) as { value: number; voter_id: string }[];

  const upvotes = rows.filter((r) => r.value === 1).length;
  const downvotes = rows.filter((r) => r.value === -1).length;
  const userRow = voterId ? rows.find((r) => r.voter_id === voterId) : null;

  return {
    upvotes,
    downvotes,
    score: upvotes - downvotes,
    user_vote: (userRow?.value ?? 0) as 1 | -1 | 0,
  };
}

export function getComments(postId: string, voterId?: string): CommentWithReplies[] {
  const db = getDb();
  const all = db
    .prepare("SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC")
    .all(postId) as Comment[];

  const topLevel = all.filter((c) => !c.parent_id);
  const repliesMap = new Map<string, Comment[]>();
  for (const c of all) {
    if (c.parent_id) {
      const arr = repliesMap.get(c.parent_id) ?? [];
      arr.push(c);
      repliesMap.set(c.parent_id, arr);
    }
  }

  return topLevel.map((comment) => ({
    comment,
    replies: repliesMap.get(comment.id) ?? [],
    score: buildVoteScore(db, "comment", comment.id, voterId),
  }));
}

export function createComment(data: {
  post_id: string;
  parent_id?: string | null;
  body: string;
  author_name?: string;
}): Comment {
  const id = generateId();
  const ts = now();
  getDb()
    .prepare(
      "INSERT INTO comments (id, post_id, parent_id, body, author_name, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)"
    )
    .run(id, data.post_id, data.parent_id ?? null, data.body, data.author_name ?? "익명", ts, ts);
  return getDb().prepare("SELECT * FROM comments WHERE id = ?").get(id) as Comment;
}

export function softDeleteComment(id: string): void {
  getDb()
    .prepare("UPDATE comments SET deleted=1, body=?, updated_at=? WHERE id=?")
    .run("[삭제된 댓글]", now(), id);
}

// ── Votes ───────────────────────────────────────────────────────

export function castVote(data: {
  target_type: "post" | "comment";
  target_id: string;
  value: 1 | -1;
  voter_id: string;
}): VoteScore {
  const db = getDb();
  const { target_type, target_id, value, voter_id } = data;

  const existing = db
    .prepare(
      "SELECT id, value FROM votes WHERE target_type=? AND target_id=? AND voter_id=?"
    )
    .get(target_type, target_id, voter_id) as { id: string; value: number } | null;

  if (existing) {
    if (existing.value === value) {
      db.prepare("DELETE FROM votes WHERE id=?").run(existing.id);
    } else {
      db.prepare("UPDATE votes SET value=?, created_at=? WHERE id=?").run(value, now(), existing.id);
    }
  } else {
    db.prepare(
      "INSERT INTO votes (id, target_type, target_id, value, voter_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(generateId(), target_type, target_id, value, voter_id, now());
  }

  return buildVoteScore(db, target_type, target_id, voter_id);
}

// ── Page Views ──────────────────────────────────────────────────

export function recordVisit(): void {
  const today = new Date().toISOString().slice(0, 10);
  getDb().prepare(`
    INSERT INTO page_views (date, count) VALUES (?, 1)
    ON CONFLICT(date) DO UPDATE SET count = count + 1
  `).run(today);
}

export function getVisitorStats(): { today: number; total: number } {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const todayRow = db.prepare("SELECT count FROM page_views WHERE date = ?").get(today) as { count: number } | null;
  const totalRow = db.prepare("SELECT COALESCE(SUM(count), 0) as total FROM page_views").get() as { total: number };
  return {
    today: todayRow?.count ?? 0,
    total: totalRow.total,
  };
}
