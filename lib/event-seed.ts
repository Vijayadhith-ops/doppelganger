export type RoundStatus = "WAITING" | "READY" | "LIVE" | "PAUSED" | "ENDED";
export type PStatus = "REGISTERED" | "VERIFIED" | "ACTIVE" | "SUBMITTED" | "EXPIRED";
export type Participant = {
  code: string;
  name: string;
  college: string;
  challenge: string;
  status: PStatus;
  verifiedAt?: string;
  submittedAt?: string;
  projectUrl?: string;
  figmaUrl?: string;
  prompt?: string;
  submissionImage?: string;
};
export type Challenge = {
  code: string;
  title: string;
  difficulty: string;
  color: string;
  description: string;
  imageUrl?: string;
  specs?: string[];
  category?: string;
};
export type EventStore = {
  status: RoundStatus;
  duration: number;
  endsAt: number | null;
  pausedRemaining: number;
  participants: Participant[];
  challenges: Challenge[];
  startedAt?: number;
  grace: number;
};

export const challenges: Challenge[] = [];

export function seed(): EventStore {
  return {
    status: "WAITING",
    duration: 1800,
    endsAt: null,
    pausedRemaining: 1800,
    grace: 30,
    challenges: [],
    participants: [],
  };
}
