/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { readStore, writeStore, setCookie, createParticipantSession, signToken } from "@/lib/event-db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").trim().toUpperCase();
  if (!/^DG-\d{2}$/.test(code)) return Response.json({ error: "Invalid participant ID format (must be DG-01, DG-02, etc.)" }, { status: 400 });
  const store = await readStore();
  let index = store.participants.findIndex((p) => p.code === code);
  
  const updatedName = String(body.name || "").trim();
  const updatedCollege = String(body.college || "").trim();

  if (index < 0) {
    const assignedChallenge = store.challenges.length > 0
      ? store.challenges[store.participants.length % store.challenges.length].code
      : "";
    const newParticipant = {
      code,
      name: updatedName || `Participant ${code}`,
      college: updatedCollege || "General",
      challenge: assignedChallenge,
      status: "VERIFIED",
      verifiedAt: new Date().toISOString(),
    };
    store.participants.push(newParticipant);
    index = store.participants.length - 1;
    await writeStore(store);
  } else {
    const p = store.participants[index];
    if (p.status === "REGISTERED" || updatedName || updatedCollege) {
      store.participants[index] = {
        ...p,
        name: updatedName || p.name,
        college: updatedCollege || p.college,
        status: p.status === "REGISTERED" ? "VERIFIED" : p.status,
        verifiedAt: p.verifiedAt || new Date().toISOString(),
      };
      await writeStore(store);
    }
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
