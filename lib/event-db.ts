/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
import { seed, type EventStore } from "./event-seed";

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

let schemaReady: Promise<void> | null = null;

function getDb() {
  return cfEnv?.DB || (typeof process !== "undefined" && (process.env as any)?.DB) || null;
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

export async function readStore(): Promise<EventStore> {
  const db = getDb();
  if (db) {
    try {
      await ensureSchema();
      const row = await db.prepare("SELECT payload FROM event_state WHERE id=1").first<{ payload: string }>();
      if (row) {
        const s: EventStore = JSON.parse(row.payload);
        const defaultSeed = seed();
        if (Array.isArray(s.participants) && s.participants.length < defaultSeed.participants.length) {
          const existingCodes = new Set(s.participants.map((p) => p.code));
          for (const p of defaultSeed.participants) {
            if (!existingCodes.has(p.code)) {
              s.participants.push(p);
            }
          }
          s.participants.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
          await writeStore(s);
        }
        return s;
      }
      const value = seed();
      await db.prepare("INSERT OR IGNORE INTO event_state(id,payload,revision,updated_at) VALUES(1,?,1,?)").bind(JSON.stringify(value), new Date().toISOString()).run();
      return value;
    } catch {
      // Memory fallback
    }
  }
  return g.__dg_store;
}

export async function writeStore(value: EventStore) {
  g.__dg_store = value;
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
export const setCookie = (name: string, value: string, maxAge: number) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

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
  const token = cookie(request, "dg_admin");
  if (!token) return false;
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
  const exp = g.__dg_admin_sessions.get(token);
  if (exp && new Date(exp) > new Date()) return true;
  return token === "admin-session-active";
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
  const token = cookie(request, "dg_session");
  if (!token) return null;
  const db = getDb();
  if (db) {
    try {
      await ensureSchema();
      const row = await db.prepare("SELECT participant_code FROM participant_sessions WHERE token=?").bind(token).first<{ participant_code: string }>();
      return row?.participant_code || null;
    } catch {
      // Memory fallback
    }
  }
  return g.__dg_participant_sessions.get(token) || null;
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
  g.__dg_store = store;
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
  return {
    status: s.status,
    duration: s.duration,
    endsAt: s.endsAt,
    pausedRemaining: s.pausedRemaining,
    startedAt: s.startedAt,
    grace: s.grace,
    challenges: s.challenges || [],
    participants: sorted.map((p) => ({
      code: p.code,
      status: p.status,
      challenge: s.status === "LIVE" ? p.challenge : "",
      name: "",
      college: "",
    })),
  };
}
