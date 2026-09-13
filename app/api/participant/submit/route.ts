/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-unused-vars */
// @ts-nocheck
import { readStore, participantCode, hasSubmissionKey, recordSubmission } from "@/lib/event-db";

export async function POST(request: Request) {
  const code = await participantCode(request);
  if (!code) return Response.json({ error: "Session expired. Please re-verify your ID." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const prompt = String(body.prompt || "").trim();
  const submissionImage = String(body.submissionImage || body.imageUrl || "").trim();
  const url = String(body.projectUrl || "").trim();
  const figma = String(body.figmaUrl || "").trim();
  const clientId = String(body.clientId || crypto.randomUUID());

  if (!prompt && !submissionImage && !url) {
    return Response.json({ error: "Please provide your Prompt or upload your generated UI image." }, { status: 400 });
  }

  const existing = await hasSubmissionKey(clientId);
  const store = await readStore();
  const i = store.participants.findIndex((p) => p.code === code);
  if (i < 0) return Response.json({ error: "Participant not found" }, { status: 404 });

  if (existing || store.participants[i].status === "SUBMITTED") {
    return Response.json({ person: store.participants[i], duplicate: true });
  }

  const now = Date.now(),
    deadline = (store.endsAt || 0) + store.grace * 1000;
  if (store.status !== "LIVE" || now > deadline) {
    return Response.json({ error: "Submission window is closed." }, { status: 409 });
  }

  const stamp = new Date().toISOString();
  store.participants[i] = {
    ...store.participants[i],
    status: "SUBMITTED",
    prompt: prompt || undefined,
    submissionImage: submissionImage || undefined,
    projectUrl: url || undefined,
    figmaUrl: figma || undefined,
    submittedAt: stamp,
  };

  await recordSubmission(clientId, code, store, stamp);

  return Response.json({ person: store.participants[i] });
}
