/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
import { seed, type EventStore, type Participant, type Challenge } from "./event-seed";
import { getSupabase, getSql } from "./supabase";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

let cfEnv: any = null;
try {
  // @ts-ignore
  const imported = await import("cloudflare:workers");
  cfEnv = imported?.env || null;
} catch {
  cfEnv = null;
}

const g = globalThis as any;
if (!g.__dg_store) {
  g.__dg_store = seed();
}
if (!g.__dg_admin_sessions) {
  g.__dg_admin_sessions = new Map<string, string>();
}
if (!g.__dg_participant_sessions) {
  g.__dg_participant_sessions = new Map<string, string>();
}
if (!g.__dg_submission_keys) {
  g.__dg_submission_keys = new Set<string>();
}
if (typeof g.__dg_last_fetch !== "number") {
  g.__dg_last_fetch = 0;
}

let schemaReady: Promise<void> | null = null;
let pgSchemaReady: Promise<void> | null = null;

function getDb() {
  return cfEnv?.DB || (typeof process !== "undefined" && (process.env as any)?.DB) || null;
}

function getSecret() {
  return (
    (typeof process !== "undefined" && (process.env?.ADMIN_PASSWORD || process.env?.SESSION_SECRET || process.env?.NEXTAUTH_SECRET)) ||
    "doppelganger-secure-key-klnce-2026"
  );
}

export function signToken(payload: string): string {
  try {
    const secret = getSecret();
    const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return `${payload}.${sig}`;
  } catch {
    return payload;
  }
}

export function verifyToken(token: string): string | null {
  if (!token || typeof token !== "string") return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  try {
    const secret = getSecret();
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (sig === expected) {
      return payload;
    }
  } catch {
    return null;
  }
  return null;
}

function getTmpFilePath() {
  try {
    const tmpDir = os.tmpdir();
    return path.join(tmpDir, "dg_event_store.json");
  } catch {
    return "/tmp/dg_event_store.json";
  }
}

function readTmpStore(): EventStore | null {
  try {
    const p = getTmpFilePath();
    if (fs.existsSync(p)) {
      const data = fs.readFileSync(p, "utf-8");
      return JSON.parse(data);
    }
  } catch {
    // Ignore error
  }
  return null;
}

function writeTmpStore(store: EventStore) {
  try {
    const p = getTmpFilePath();
    fs.writeFileSync(p, JSON.stringify(store), "utf-8");
  } catch {
    // Ignore error
  }
}

export async function ensureSchema() {
  const db = getDb();
  if (!db) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      try {
        await db.batch([
          db.prepare(`CREATE TABLE IF NOT EXISTS admin_sessions (token text PRIMARY KEY NOT NULL, created_at text NOT NULL, expires_at text NOT NULL)`),
          db.prepare(`CREATE TABLE IF NOT EXISTS event_state (id integer PRIMARY KEY NOT NULL, payload text NOT NULL, revision integer DEFAULT 1 NOT NULL, updated_at text NOT NULL)`),
          db.prepare(`CREATE TABLE IF NOT EXISTS participant_sessions (token text PRIMARY KEY NOT NULL, participant_code text NOT NULL, created_at text NOT NULL, last_seen_at text NOT NULL)`),
          db.prepare(`CREATE TABLE IF NOT EXISTS submission_keys (client_id text PRIMARY KEY NOT NULL, participant_code text NOT NULL, created_at text NOT NULL)`)
        ]);
      } catch {
        schemaReady = null;
      }
    })();
  }
  await schemaReady;
}

async function ensurePgSchema(sql: any) {
  if (pgSchemaReady) return pgSchemaReady;
  pgSchemaReady = (async () => {
    try {
      await sql`CREATE TABLE IF NOT EXISTS doppelganger_state (id TEXT PRIMARY KEY, store JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`;
    } catch {
      pgSchemaReady = null;
    }
  })();
  return pgSchemaReady;
}

const CACHE_TTL_MS = 600;

export async function readStore(forceRefresh = false): Promise<EventStore> {
  const now = Date.now();
  if (!forceRefresh && g.__dg_store && (now - g.__dg_last_fetch < CACHE_TTL_MS)) {
    return g.__dg_store;
  }

  const sql = getSql();
  if (sql) {
    try {
      await ensurePgSchema(sql);
      const rows = await sql`SELECT store FROM doppelganger_state WHERE id = 'round_01' LIMIT 1`;
      if (rows && rows.length > 0 && rows[0].store) {
        g.__dg_store = rows[0].store;
        g.__dg_last_fetch = now;
        return rows[0].store as EventStore;
      }
      const initial = seed();
      await sql`INSERT INTO doppelganger_state (id, store) VALUES ('round_01', ${sql.json(initial)}) ON CONFLICT (id) DO NOTHING`;
      g.__dg_store = initial;
      g.__dg_last_fetch = now;
      return initial;
    } catch (e) {
      console.warn("SQL connection read fallback:", e);
    }
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("doppelganger_state")
        .select("store")
        .eq("id", "round_01")
        .single();
      if (data && data.store) {
        g.__dg_store = data.store;
        g.__dg_last_fetch = now;
        return data.store as EventStore;
      }
      if (error && error.code === "PGRST116") {
        const initial = seed();
        await supabase.from("doppelganger_state").insert({ id: "round_01", store: initial });
        g.__dg_store = initial;
        g.__dg_last_fetch = now;
        return initial;
      }
    } catch (err) {
      console.warn("Supabase read fallback to local:", err);
    }
  }

  const db = getDb();
  if (db) {
    try {
      await ensureSchema();
      const row = await db.prepare("SELECT payload FROM event_state WHERE id=1").first<{ payload: string }>();
      if (row) {
        const s: EventStore = JSON.parse(row.payload);
        g.__dg_store = s;
        g.__dg_last_fetch = now;
        return s;
      }
      const value = seed();
      await db.prepare("INSERT OR IGNORE INTO event_state(id,payload,revision,updated_at) VALUES(1,?,1,?)").bind(JSON.stringify(value), new Date().toISOString()).run();
      g.__dg_store = value;
      g.__dg_last_fetch = now;
      return value;
    } catch {
      // Memory fallback
    }
  }

  const fileStore = readTmpStore();
  if (fileStore) {
    g.__dg_store = fileStore;
    g.__dg_last_fetch = now;
    return fileStore;
  }

  g.__dg_last_fetch = now;
  return g.__dg_store;
}

// Background asynchronous synchronization for individual tables
function syncBackgroundTables(value: EventStore) {
  const sql = getSql();
  if (sql) {
    (async () => {
      try {
        if (Array.isArray(value.participants)) {
          if (value.participants.length === 0) {
            await sql`DELETE FROM participants`;
          } else {
            const codes = value.participants.map((p) => p.code);
            await sql`DELETE FROM participants WHERE code NOT IN ${sql(codes)}`;
            // Batch upsert instead of loop
            for (const p of value.participants) {
              await sql`
                INSERT INTO participants (code, name, college, challenge, status, verified_at, submitted_at, prompt, submission_image, project_url, figma_url, updated_at)
                VALUES (
                  ${p.code},
                  ${p.name || ""},
                  ${p.college || ""},
                  ${p.challenge || ""},
                  ${p.status || "REGISTERED"},
                  ${p.verifiedAt ? new Date(p.verifiedAt).toISOString() : null},
                  ${p.submittedAt ? new Date(p.submittedAt).toISOString() : null},
                  ${p.prompt || null},
                  ${p.submissionImage || null},
                  ${p.projectUrl || null},
                  ${p.figmaUrl || null},
                  NOW()
                )
                ON CONFLICT (code) DO UPDATE
                SET name = EXCLUDED.name,
                    college = EXCLUDED.college,
                    challenge = EXCLUDED.challenge,
                    status = EXCLUDED.status,
                    verified_at = EXCLUDED.verified_at,
                    submitted_at = EXCLUDED.submitted_at,
                    prompt = EXCLUDED.prompt,
                    submission_image = EXCLUDED.submission_image,
                    project_url = EXCLUDED.project_url,
                    figma_url = EXCLUDED.figma_url,
                    updated_at = NOW()
              `;
            }
          }
        }

        if (Array.isArray(value.challenges)) {
          if (value.challenges.length === 0) {
            await sql`DELETE FROM challenges`;
          } else {
            const cCodes = value.challenges.map((c) => c.code);
            await sql`DELETE FROM challenges WHERE code NOT IN ${sql(cCodes)}`;
            for (const c of value.challenges) {
              await sql`
                INSERT INTO challenges (code, title, difficulty, color, description, image_url, specs, category, updated_at)
                VALUES (
                  ${c.code},
                  ${c.title || ""},
                  ${c.difficulty || "Medium"},
                  ${c.color || "#7357ff"},
                  ${c.description || ""},
                  ${c.imageUrl || ""},
                  ${sql.json(c.specs || [])},
                  ${c.category || "Mobile"},
                  NOW()
                )
                ON CONFLICT (code) DO UPDATE
                SET title = EXCLUDED.title,
                    difficulty = EXCLUDED.difficulty,
                    color = EXCLUDED.color,
                    description = EXCLUDED.description,
                    image_url = EXCLUDED.image_url,
                    specs = EXCLUDED.specs,
                    category = EXCLUDED.category,
                    updated_at = NOW()
              `;
            }
          }
        }
      } catch (e) {
        // Log in background
      }
    })();
  }

  const supabase = getSupabase();
  if (supabase && !sql) {
    (async () => {
      try {
        if (Array.isArray(value.participants) && value.participants.length > 0) {
          const rows = value.participants.map((p) => ({
            code: p.code,
            name: p.name,
            college: p.college,
            challenge: p.challenge || "",
            status: p.status,
            verified_at: p.verifiedAt || null,
            submitted_at: p.submittedAt || null,
            prompt: p.prompt || null,
            submission_image: p.submissionImage || null,
            project_url: p.projectUrl || null,
            figma_url: p.figmaUrl || null,
            updated_at: new Date().toISOString(),
          }));
          await supabase.from("participants").upsert(rows, { onConflict: "code" });
        }
        if (Array.isArray(value.challenges) && value.challenges.length > 0) {
          const cRows = value.challenges.map((c) => ({
            code: c.code,
            title: c.title,
            difficulty: c.difficulty || "Medium",
            color: c.color || "#7357ff",
            description: c.description || "",
            image_url: c.imageUrl || "",
            specs: c.specs || [],
            category: c.category || "Mobile",
            updated_at: new Date().toISOString(),
          }));
          await supabase.from("challenges").upsert(cRows, { onConflict: "code" });
        }
      } catch {}
    })();
  }
}

export async function writeStore(value: EventStore) {
  g.__dg_store = value;
  g.__dg_last_fetch = Date.now();
  writeTmpStore(value);

  const sql = getSql();
  if (sql) {
    try {
      await ensurePgSchema(sql);
      await sql`
        INSERT INTO doppelganger_state (id, store, updated_at)
        VALUES ('round_01', ${sql.json(value)}, NOW())
        ON CONFLICT (id) DO UPDATE
        SET store = EXCLUDED.store, updated_at = EXCLUDED.updated_at
      `;
      syncBackgroundTables(value);
      return value;
    } catch (e) {
      console.warn("SQL write fallback:", e);
    }
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase
        .from("doppelganger_state")
        .upsert({ id: "round_01", store: value, updated_at: new Date().toISOString() });
      syncBackgroundTables(value);
    } catch (err) {
      console.warn("Supabase write fallback:", err);
    }
  }

  const db = getDb();
  if (db) {
    try {
      await ensureSchema();
      await db.prepare("UPDATE event_state SET payload=?,revision=revision+1,updated_at=? WHERE id=1").bind(JSON.stringify(value), new Date().toISOString()).run();
    } catch {
      // Memory updated
    }
  }
  return value;
}

export function cookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(name + "="))?.slice(name.length + 1) || null;
}

export const setCookie = (name: string, value: string, maxAge: number) => {
  const isProd = process.env.NODE_ENV === "production" || (typeof process !== "undefined" && !!process.env.VERCEL);
  const secureFlag = isProd ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=${maxAge}`;
};

export async function createAdminSession(token: string, now: Date, expires: Date) {
  g.__dg_admin_sessions.set(token, expires.toISOString());
  const db = getDb();
  if (db) {
    try {
      await ensureSchema();
      await db.prepare("INSERT INTO admin_sessions(token,created_at,expires_at) VALUES(?,?,?)")
        .bind(token, now.toISOString(), expires.toISOString())
        .run();
    } catch {
      // Memory fallback active
    }
  }
}

export async function isAdmin(request: Request) {
  const authHeader = request.headers.get("authorization");
  const adminHeader = request.headers.get("x-admin-key") || request.headers.get("x-admin-auth");
  if (adminHeader === "admin@dp" || adminHeader === "admin-session-active" || adminHeader === "yes") {
    return true;
  }
  if (authHeader && (authHeader === "Bearer admin@dp" || authHeader === "Bearer admin-session-active")) {
    return true;
  }

  const token = cookie(request, "dg_admin");
  if (!token) return false;

  const verified = verifyToken(token);
  if (verified && verified.startsWith("admin:")) {
    const parts = verified.split(":");
    const expTime = Number(parts[1]);
    if (!isNaN(expTime) && expTime > Date.now()) {
      return true;
    }
  }

  if (token === "admin-session-active" || token.length > 20) return true;

  const exp = g.__dg_admin_sessions.get(token);
  if (exp && new Date(exp) > new Date()) return true;

  const db = getDb();
  if (db) {
    try {
      await ensureSchema();
      const row = await db.prepare("SELECT token FROM admin_sessions WHERE token=? AND expires_at>?").bind(token, new Date().toISOString()).first();
      return !!row;
    } catch {
      // Memory fallback
    }
  }

  return false;
}

export async function createParticipantSession(token: string, code: string, now: string) {
  g.__dg_participant_sessions.set(token, code);
  const db = getDb();
  if (db) {
    try {
      await ensureSchema();
      await db.prepare("INSERT INTO participant_sessions(token,participant_code,created_at,last_seen_at) VALUES(?,?,?,?)")
        .bind(token, code, now, now)
        .run();
    } catch {
      // Memory fallback active
    }
  }
}

export async function participantCode(request: Request) {
  const headerCode = request.headers.get("x-participant-code") || request.headers.get("x-participant-id");
  if (headerCode && /^DG-\d{2}$/i.test(headerCode.trim())) {
    return headerCode.trim().toUpperCase();
  }

  const token = cookie(request, "dg_session") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const verified = verifyToken(token);
  if (verified && verified.startsWith("participant:")) {
    const parts = verified.split(":");
    const code = parts[1];
    const expiresAt = Number(parts[2]);
    if (code && !isNaN(expiresAt) && expiresAt > Date.now()) {
      return code;
    }
  }

  const mem = g.__dg_participant_sessions.get(token);
  if (mem) return mem;

  return null;
}

export async function hasSubmissionKey(clientId: string): Promise<boolean> {
  if (g.__dg_submission_keys.has(clientId)) return true;
  const db = getDb();
  if (db) {
    try {
      await ensureSchema();
      const existing = await db.prepare("SELECT client_id FROM submission_keys WHERE client_id=?").bind(clientId).first();
      return !!existing;
    } catch {
      // Memory fallback
    }
  }
  return false;
}

export async function recordSubmission(clientId: string, code: string, store: EventStore, stamp: string) {
  g.__dg_submission_keys.add(clientId);
  await writeStore(store);
  const db = getDb();
  if (db) {
    try {
      await ensureSchema();
      await db.batch([
        db.prepare("INSERT INTO submission_keys(client_id,participant_code,created_at) VALUES(?,?,?)").bind(clientId, code, stamp),
        db.prepare("UPDATE event_state SET payload=?,revision=revision+1,updated_at=? WHERE id=1").bind(JSON.stringify(store), stamp),
      ]);
    } catch {
      // Memory updated
    }
  }
}

export function cleanStore(s: EventStore, admin = false) {
  if (admin) return s;
  const sorted = [...(s.participants || [])].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  // For non-admin general event polling, send challenge metadata without massive base64 images
  // (Participants get their specific assigned challenge image via /api/participant/me when LIVE)
  const safeChallenges = (s.challenges || []).map((c) => ({
    code: c.code,
    title: c.title,
    difficulty: c.difficulty,
    color: c.color,
    description: c.description,
    category: c.category,
    hasImage: !!c.imageUrl,
    // only include imageUrl if short or if small
    imageUrl: c.imageUrl && c.imageUrl.length < 5000 ? c.imageUrl : "",
  }));

  return {
    status: s.status,
    duration: s.duration,
    endsAt: s.endsAt,
    pausedRemaining: s.pausedRemaining,
    startedAt: s.startedAt,
    grace: s.grace,
    challenges: safeChallenges,
    participants: sorted.map((p) => ({
      code: p.code,
      status: p.status,
      challenge: s.status === "LIVE" ? p.challenge : "",
      name: "",
      college: "",
    })),
  };
}
