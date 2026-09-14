/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { readStore, writeStore, setCookie, createParticipantSession, signToken } from "@/lib/event-db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  let code = String(body.code || "").trim().toUpperCase();
  const name = String(body.name || "").trim();
  const college = String(body.college || "").trim();

  const store = await readStore();

  // If no code is passed, automatically allocate the lowest unused ID (DG-01, DG-02, ...)
  if (!code || code === "AUTO") {
    const existingCodes = new Set(store.participants.map((p) => p.code));
    let num = 1;
    while (existingCodes.has(`DG-${String(num).padStart(2, "0")}`)) {
      num++;
    }
    code = `DG-${String(num).padStart(2, "0")}`;
  } else {
    if (!/^DG-\d{2}$/.test(code)) {
      return Response.json({ error: "Invalid participant ID format (must be DG-01, DG-02, etc.)" }, { status: 400 });
    }
  }

  let index = store.participants.findIndex((p) => p.code === code);
  const nowStr = new Date().toISOString();
  const assignedStatus = store.status === "LIVE" ? "ACTIVE" : "VERIFIED";

  if (index < 0) {
    const assignedChallenge = store.challenges.length > 0
      ? store.challenges[store.participants.length % store.challenges.length].code
      : "";
    const newParticipant = {
      code,
      name: name || `Participant ${code}`,
      college: college || "Participant",
      challenge: assignedChallenge,
      status: assignedStatus,
      verifiedAt: nowStr,
    };
    store.participants.push(newParticipant);
    store.participants.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    index = store.participants.findIndex((p) => p.code === code);
  } else {
    const p = store.participants[index];
    store.participants[index] = {
      ...p,
      name: name || p.name,
      college: college || p.college,
      status: p.status === "REGISTERED" ? assignedStatus : p.status,
      verifiedAt: p.verifiedAt || nowStr,
    };
  }

  await writeStore(store);

  const expiresAt = Date.now() + 6 * 3600e3;
  const rawId = crypto.randomUUID();
  const token = signToken(`participant:${code}:${expiresAt}:${rawId}`);

  await createParticipantSession(token, code, nowStr);

  const person = store.participants[index];
  const challenge = store.status === "LIVE" ? store.challenges.find((c) => c.code === person.challenge) : null;

  return Response.json(
    { person, challenge, status: store.status, store: { ...store, participants: [person], challenges: challenge ? [challenge] : [] } },
    { headers: { "Set-Cookie": setCookie("dg_session", token, 21600) } }
  );
}
