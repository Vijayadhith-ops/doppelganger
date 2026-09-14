/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { readStore, writeStore, setCookie, createParticipantSession, signToken } from "@/lib/event-db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").trim().toUpperCase();
  if (!/^DG-\d{2}$/.test(code)) return Response.json({ error: "Invalid participant ID" }, { status: 400 });
  const store = await readStore();
  const index = store.participants.findIndex((p) => p.code === code);
  if (index < 0) return Response.json({ error: "Participant ID not found" }, { status: 404 });

  const p = store.participants[index];
  const updatedName = String(body.name || "").trim() || p.name;
  const updatedCollege = String(body.college || "").trim() || p.college;

  if (p.status === "REGISTERED" || body.name || body.college) {
    store.participants[index] = {
      ...p,
      name: updatedName,
      college: updatedCollege,
      status: p.status === "REGISTERED" ? "VERIFIED" : p.status,
      verifiedAt: p.verifiedAt || new Date().toISOString(),
    };
    await writeStore(store);
  }

  const now = new Date().toISOString();
  const expiresAt = Date.now() + 6 * 3600e3;
  const rawId = crypto.randomUUID();
  const token = signToken(`participant:${code}:${expiresAt}:${rawId}`);

  await createParticipantSession(token, code, now);

  const person = store.participants[index];
  const challenge = store.status === "LIVE" ? store.challenges.find((c) => c.code === person.challenge) : null;

  return Response.json(
    { person, challenge, status: store.status, store: { ...store, participants: [person], challenges: challenge ? [challenge] : [] } },
    { headers: { "Set-Cookie": setCookie("dg_session", token, 21600) } }
  );
}
