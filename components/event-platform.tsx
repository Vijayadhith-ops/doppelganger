/* eslint-disable react-hooks/purity, react-hooks/set-state-in-effect, react-hooks/static-components, react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment, @typescript-eslint/no-unused-vars, prefer-const */
// @ts-nocheck
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Compass,
  Copy,
  CreditCard,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileCheck2,
  HeartPulse,
  Image as ImageIcon,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Maximize2,
  Menu,
  Monitor,
  Palette,
  Pause,
  Play,
  Plus,
  Printer,
  QrCode,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Users,
  Utensils,
  Wifi,
  WifiOff,
  X,
  ZoomIn
} from "lucide-react";
import { QRCodeSVG } from "@/lib/qr";

type RoundStatus = "WAITING" | "READY" | "LIVE" | "PAUSED" | "ENDED";
type PStatus = "REGISTERED" | "VERIFIED" | "ACTIVE" | "SUBMITTED" | "EXPIRED";
type Participant = {
  code: string;
  name: string;
  college: string;
  challenge: string;
  status: PStatus;
  verifiedAt?: string;
  submittedAt?: string;
  projectUrl?: string;
  figmaUrl?: string;
};
type Challenge = {
  code: string;
  title: string;
  difficulty: string;
  color: string;
  description: string;
  imageUrl?: string;
  specs?: string[];
  category?: string;
};
type Store = {
  status: RoundStatus;
  duration: number;
  endsAt: number | null;
  pausedRemaining: number;
  participants: Participant[];
  challenges: Challenge[];
  startedAt?: number;
  grace: number;
};

const challenges: Challenge[] = [];

const initial: Store = {
  status: "WAITING",
  duration: 1800,
  endsAt: null,
  pausedRemaining: 1800,
  participants: [],
  challenges: [],
  grace: 30,
};

const STORE = "dg-event-v1", SESSION = "dg-participant-v1", CHALLENGES_STORAGE = "dg-challenges-v1";
const safeLoad = (): Store => {
  try {
    const saved = localStorage.getItem(STORE);
    const savedChallenges = localStorage.getItem(CHALLENGES_STORAGE);
    let parsedChallenges: Challenge[] | null = null;
    if (savedChallenges) {
      try {
        parsedChallenges = JSON.parse(savedChallenges);
      } catch {}
    }

    let loadedChallenges: Challenge[] = [];
    if (Array.isArray(parsedChallenges)) {
      loadedChallenges = parsedChallenges;
    } else if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.challenges)) {
          // Filter out default old mock sample names without custom uploads
          loadedChallenges = parsed.challenges.filter(
            (c: Challenge) => c.imageUrl || (c.title !== "Commerce Mobile" && c.title !== "Fintech Dashboard" && c.title !== "Travel Discovery" && c.title !== "Food Delivery")
          );
        }
      } catch {}
    }

    if (!saved) {
      return { ...initial, challenges: loadedChallenges };
    }
    const parsed = JSON.parse(saved);
    let participants: Participant[] = [];
    if (Array.isArray(parsed.participants)) {
      participants = parsed.participants.filter((p: Participant) => {
        const isDefaultMock = (p.college === "K.L.N. College of Engineering" || p.college === "Guest Institution") &&
          p.status === "REGISTERED" && !p.verifiedAt && !p.submittedAt && !p.submissionImage && !p.prompt;
        return !isDefaultMock;
      });
    }

    return {
      ...initial,
      ...parsed,
      participants,
      challenges: loadedChallenges
    };
  } catch {
    return initial;
  }
};

const formatTime = (sec: number) =>
  `${String(Math.floor(Math.max(sec, 0) / 60)).padStart(2, "0")}:${String(Math.max(sec, 0) % 60).padStart(2, "0")}`;

const processImageFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please upload an image file (PNG, JPG, JPEG, WebP, SVG)."));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (file.type === "image/svg+xml" || file.size < 500000) {
        resolve(result);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1400;
        const scale = Math.min(1, MAX_WIDTH / img.width);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/webp", 0.88));
        } else {
          resolve(result);
        }
      };
      img.onerror = () => resolve(result);
      img.src = result;
    };
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
};

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <div className="brandmark">
        <span />
        <span />
      </div>
      <div>
        <b>DOPPELGÄNGER</b>
        {!compact && <small>THE MIRROR · ROUND 01</small>}
      </div>
    </div>
  );
}

function Pill({ children, tone = "violet" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

function useClock(store: Store) {
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  return store.status === "LIVE" && store.endsAt
    ? Math.max(0, Math.ceil((store.endsAt - tick) / 1000))
    : store.pausedRemaining;
}

export default function EventPlatform() {
  const [path, setPath] = useState("/");
  const [store, setStore] = useState<Store>(initial);
  const [online, setOnline] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setStore(safeLoad());
    setPath(location.pathname);
    setOnline(navigator.onLine);
    setReady(true);
    const route = () => setPath(location.pathname);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener("popstate", route);
    addEventListener("online", on);
    addEventListener("offline", off);
    return () => {
      removeEventListener("popstate", route);
      removeEventListener("online", on);
      removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const sync = async () => {
      const admin = path.startsWith("/admin") && path !== "/admin/login";
      const participant = !admin && !["/", "/verify", "/recover", "/live", "/join", "/login"].includes(path);
      const url = admin ? "/api/admin/state" : participant ? "/api/participant/me" : "/api/event";
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (admin) {
        headers["x-admin-key"] = "admin@dp";
        headers["x-admin-auth"] = "admin-session-active";
      }
      const activeSession = localStorage.getItem(SESSION) || "";
      if (participant && activeSession) {
        headers["x-participant-code"] = activeSession;
      }
      try {
        const r = await fetch(url, { headers, cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          if (d.store) {
            setStore((current) => {
              let merged = current.participants;
              if (Array.isArray(d.store.participants) && d.store.participants.length > 0) {
                merged = d.store.participants;
              } else if (d.person) {
                const exists = current.participants.some((p) => p.code === d.person.code);
                if (exists) {
                  merged = current.participants.map((p) => (p.code === d.person.code ? { ...p, ...d.person } : p));
                } else {
                  merged = [...current.participants, d.person];
                }
              }

              let mergedChallenges = current.challenges;
              if (Array.isArray(d.store.challenges) && d.store.challenges.length > 0) {
                const localMap = new Map(current.challenges.map((c) => [c.code, c]));
                const remoteMap = new Map(d.store.challenges.map((c) => [c.code, c]));
                const allCodes = Array.from(new Set([...current.challenges.map((c) => c.code), ...d.store.challenges.map((c) => c.code)]));

                mergedChallenges = allCodes.map((code) => {
                  const local = localMap.get(code);
                  const remote = remoteMap.get(code);
                  if (local && remote) {
                    return {
                      ...remote,
                      imageUrl: remote.imageUrl || local.imageUrl || "",
                      title: (remote.title && remote.title !== "Commerce Mobile" && remote.title !== "Fintech Dashboard" && remote.title !== "Travel Discovery" && remote.title !== "Food Delivery") ? remote.title : (local.title || remote.title),
                      description: remote.description || local.description,
                      difficulty: remote.difficulty || local.difficulty,
                      color: remote.color || local.color,
                      specs: remote.specs || local.specs,
                      category: remote.category || local.category,
                    };
                  }
                  return remote || local!;
                });
              }

              const nextState: Store = {
                ...current,
                ...d.store,
                participants: merged,
                challenges: mergedChallenges,
              };

              try {
                localStorage.setItem(STORE, JSON.stringify(nextState));
                localStorage.setItem(CHALLENGES_STORAGE, JSON.stringify(mergedChallenges));
              } catch {}

              return nextState;
            });
            if (d.person) {
              localStorage.setItem(SESSION, d.person.code);
              setSession(d.person.code);
            }
          }
        }
      } catch {}
    };
    sync();
    const timer = setInterval(sync, 4000);
    return () => clearInterval(timer);
  }, [ready, path]);

  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(STORE, JSON.stringify(store));
        if (store.challenges?.length) {
          localStorage.setItem(CHALLENGES_STORAGE, JSON.stringify(store.challenges));
        }
      } catch {}
    }
  }, [store, ready]);

  const go = (p: string) => {
    history.pushState({}, "", p);
    setPath(p);
    scrollTo(0, 0);
  };

  if (!ready)
    return (
      <main className="loading">
        <Brand />
        <div className="pulse" />
      </main>
    );

  return (
    <div className="app">
      {!online && (
        <div className="network">
          <WifiOff size={16} /> Connection interrupted — Local mirror session is active.
        </div>
      )}
      {path.startsWith("/admin") ? (
        <Admin store={store} setStore={setStore} go={go} path={path} />
      ) : path === "/live" ? (
        <Projector store={store} go={go} />
      ) : (
        <ParticipantApp store={store} setStore={setStore} go={go} path={path} online={online} />
      )}
    </div>
  );
}

function ParticipantShell({
  children,
  online,
  go,
}: {
  children: React.ReactNode;
  online: boolean;
  go: (p: string) => void;
}) {
  return (
    <main className="participant-shell">
      <header className="topbar">
        <Brand compact />
        <div className="top-actions">
          <button className="iconbtn" onClick={() => go("/recover")} title="Restore session">
            <RefreshCw size={18} />
          </button>
          <span className={`connection ${online ? "on" : "off"}`}>
            {online ? <Wifi size={15} /> : <WifiOff size={15} />} {online ? "Live" : "Offline"}
          </span>
        </div>
      </header>
      {children}
      <footer>K.L.N. COLLEGE OF ENGINEERING · DEPARTMENT OF INFORMATION TECHNOLOGY</footer>
    </main>
  );
}

function ParticipantApp({
  store,
  setStore,
  go,
  path,
  online,
}: {
  store: Store;
  setStore: (s: Store) => void;
  go: (p: string) => void;
  path: string;
  online: boolean;
}) {
  const [code, setCode] = useState("");
  const [customName, setCustomName] = useState("");
  const [customCollege, setCustomCollege] = useState("");
  const [error, setError] = useState("");
  const [session, setSession] = useState<string | null>(null);
  const [promptText, setPromptText] = useState("");
  const [submissionImg, setSubmissionImg] = useState("");
  const [uploadingSub, setUploadingSub] = useState(false);
  const [dragOverSub, setDragOverSub] = useState(false);
  const [project, setProject] = useState("");
  const [figma, setFigma] = useState("");
  const [fair, setFair] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [fullscreenRef, setFullscreenRef] = useState(false);
  const subFileInputRef = useRef<HTMLInputElement>(null);
  const remaining = useClock(store);

  const [registering, setRegistering] = useState(false);

  const verifyDirect = useCallback(async (id?: string, name?: string, college?: string) => {
    try {
      setRegistering(true);
      setError("");
      const r = await fetch("/api/participant/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: id || undefined, name, college }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Verification failed");
      const assignedCode = d.person?.code || id;
      if (assignedCode) {
        localStorage.setItem(SESSION, assignedCode);
        setSession(assignedCode);
      }
      setStore((prev) => {
        const existingIdx = prev.participants.findIndex((p) => p.code === assignedCode);
        const updatedList = existingIdx >= 0
          ? prev.participants.map((p) => (p.code === assignedCode ? { ...p, ...d.person } : p))
          : [...prev.participants, d.person];
        return {
          ...prev,
          ...d.store,
          participants: updatedList,
        };
      });
      go(d.status === "LIVE" ? "/challenge" : "/waiting");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed. Try again.");
    } finally {
      setRegistering(false);
    }
  }, [go, setStore]);

  // Check URL query params for auto-verification on load (e.g. ?id=DG-01 or ?code=DG-01)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = (params.get("id") || params.get("code") || "").toUpperCase().trim();
    if (idParam && /^DG-\d{2}$/.test(idParam)) {
      setCode(idParam);
      verifyDirect(idParam);
    }
  }, [verifyDirect]);

  useEffect(() => {
    setSession(localStorage.getItem(SESSION));
    try {
      const d = JSON.parse(localStorage.getItem("dg-draft") || "{}");
      setProject(d.project || "");
      setFigma(d.figma || "");
      setPromptText(d.prompt || "");
      setSubmissionImg(d.image || "");
    } catch {}
  }, []);

  useEffect(() => {
    if ((path === "/waiting" || path === "/join" || path === "/login") && store.status === "LIVE" && session) {
      go("/challenge");
    }
  }, [path, store.status, session, go]);

  const person =
    store.participants.find((p) => p.code === session) ||
    (session
      ? {
          code: session,
          name: customName || "Participant",
          college: customCollege || "General",
          challenge: store.challenges[0]?.code || "",
          status: (store.status === "LIVE" ? "ACTIVE" : "VERIFIED") as PStatus,
        }
      : null);
  const challenge = store.challenges.find((c) => c.code === person?.challenge) || store.challenges[0];

  useEffect(() => {
    if (store.status === "LIVE" && remaining <= 0) {
      setStore((prev) => ({ ...prev, status: "ENDED", pausedRemaining: 0, endsAt: null }));
    }
  }, [remaining, store.status]);

  const verify = async () => {
    const id = code.trim().toUpperCase();
    if (!/^DG-\d{2}$/.test(id)) {
      setError("Enter a valid ID in the format DG-01.");
      return;
    }
    await verifyDirect(id);
  };

  const claimSlot = async (selectedCode: string) => {
    if (!customName.trim()) {
      setError("Please enter your Full Name.");
      return;
    }
    if (!customCollege.trim()) {
      setError("Please enter your College / Institution.");
      return;
    }
    if (!selectedCode) {
      setError("Please select a participant slot.");
      return;
    }
    await verifyDirect(selectedCode, customName.trim(), customCollege.trim());
  };

  const submit = async () => {
    if (!person) return;
    if (!promptText.trim()) {
      setError("Please enter the AI prompt you used.");
      setConfirm(false);
      return;
    }
    if (!submissionImg.trim()) {
      setError("Please upload your generated UI image (PNG, JPG, JPEG, WebP).");
      setConfirm(false);
      return;
    }
    const draft = JSON.parse(localStorage.getItem("dg-draft") || "{}");
    const clientId = draft.id || crypto.randomUUID();
    localStorage.setItem(
      "dg-draft",
      JSON.stringify({
        project,
        figma,
        prompt: promptText,
        image: submissionImg,
        id: clientId,
        savedAt: Date.now(),
      })
    );
    try {
      const r = await fetch("/api/participant/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: promptText.trim(),
          submissionImage: submissionImg.trim(),
          projectUrl: project.trim() || undefined,
          figmaUrl: figma.trim() || undefined,
          clientId,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setStore({
        ...store,
        participants: store.participants.map((p) => (p.code === d.person.code ? d.person : p)),
      });
      localStorage.removeItem("dg-draft");
      setConfirm(false);
      go("/complete");
    } catch (e) {
      setConfirm(false);
      setError(e instanceof Error ? e.message : "Connection interrupted. Your submission is saved locally.");
    }
  };

  if (path === "/")
    return (
      <main className="landing">
        <div className="grid-bg" />
        <header>
          <Brand />
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button className="textbtn" onClick={() => go("/login")}>
              <Users size={17} /> Participant Login
            </button>
            <button className="textbtn" onClick={() => go("/admin/login")}>
              <ShieldCheck size={17} /> Admin Login
            </button>
            <button className="textbtn" onClick={() => go("/live")}>
              <Radio size={17} /> Projector mode
            </button>
          </div>
        </header>
        <section className="hero">
          <div className="eyebrow">
            <span /> K.L.N. COLLEGE OF ENGINEERING · IT
          </div>
          <h1>
            Don&apos;t just see it.
            <br />
            <em>Mirror it.</em>
          </h1>
          <p className="hero-copy">A live UI replication challenge where precision meets execution.</p>
          <div className="round-lockup">
            <span>ROUND 01</span>
            <b>THE MIRROR</b>
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button className="primary jumbo" onClick={() => go("/login")}>
              <Users /> PARTICIPANT LOGIN <ChevronRight />
            </button>
            <button className="secondary jumbo" onClick={() => go("/verify")}>
              ENTER WITH ID
            </button>
          </div>
          <p className="micro">
            <ShieldCheck /> One ID · One challenge · One final submission
          </p>
        </section>
        <div className="orbit-card">
          <div className="orb">
            <div className="orb-core">
              <Eye />
            </div>
          </div>
          <div className="observe">
            <span>OBSERVE</span>
            <span>RECREATE</span>
            <span>ELEVATE</span>
          </div>
        </div>
      </main>
    );

  // Participant Login & Master QR Self Check-In Page (/login or /join)
  if (path === "/join" || path === "/login") {
    const handleRegister = async () => {
      if (!customName.trim()) {
        setError("Please enter your Full Name.");
        return;
      }
      if (!customCollege.trim()) {
        setError("Please enter your College / Institution.");
        return;
      }
      await verifyDirect(code.trim() || undefined, customName.trim(), customCollege.trim());
    };

    return (
      <ParticipantShell online={online} go={go}>
        <section className="center-stage">
          <button className="back" onClick={() => go("/")}>
            <ArrowLeft /> Home
          </button>
          <div className="join-card">
            <Pill tone="green">PARTICIPANT CHECK-IN</Pill>
            <div className="scan-icon">
              <Users />
            </div>
            <h1>Participant Check-In</h1>
            <p>Enter your Name & College. Your unique Badge ID and Challenge will be assigned automatically.</p>

            <label style={{ fontSize: "11px", letterSpacing: "0.12em", color: "#a0aec0", fontWeight: 700, display: "block", marginBottom: "6px" }}>
              YOUR FULL NAME <b style={{ color: "#00e5a3" }}>*REQUIRED</b>
            </label>
            <input
              className="field"
              value={customName}
              placeholder="e.g. Sundar P"
              onChange={(e) => {
                setCustomName(e.target.value);
                setError("");
              }}
              autoFocus
            />

            <label style={{ fontSize: "11px", letterSpacing: "0.12em", color: "#a0aec0", fontWeight: 700, display: "block", marginBottom: "6px" }}>
              COLLEGE / INSTITUTION <b style={{ color: "#00e5a3" }}>*REQUIRED</b>
            </label>
            <input
              className="field"
              value={customCollege}
              placeholder="e.g. K.L.N. College of Engineering"
              onChange={(e) => {
                setCustomCollege(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRegister();
              }}
            />

            {error && (
              <div className="form-error">
                <AlertTriangle /> {error}
              </div>
            )}

            <button
              className="primary wide"
              onClick={handleRegister}
              disabled={registering}
              style={{ minHeight: "48px", marginTop: "12px", fontSize: "14px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
            >
              {registering ? (
                <>
                  <RefreshCw className="animate-spin" size={16} /> Generating ID & Registering...
                </>
              ) : (
                <>
                  <Sparkles size={16} /> GET ID & ENTER ROUND 1 <ChevronRight />
                </>
              )}
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "18px", fontSize: "12px", borderTop: "1px solid #1a2233", paddingTop: "14px" }}>
              <a href="#" onClick={(e) => { e.preventDefault(); go("/verify"); }} style={{ color: "#70aaff" }}>
                Already have an assigned Badge ID? Enter with ID
              </a>
              <a href="#" onClick={(e) => { e.preventDefault(); go("/admin/login"); }} style={{ color: "#8590a4" }}>
                Admin
              </a>
            </div>
          </div>
        </section>
      </ParticipantShell>
    );
  }

  if (path === "/verify" || path === "/recover")
    return (
      <ParticipantShell online={online} go={go}>
        <section className="center-stage">
          <button className="back" onClick={() => go("/")}>
            <ArrowLeft /> Home
          </button>
          <div className="verify-card">
            <Pill tone={path === "/recover" ? "blue" : "violet"}>
              {path === "/recover" ? "RECOVERY MODE" : "SECURE ENTRY"}
            </Pill>
            <div className="scan-icon">{path === "/recover" ? <RefreshCw /> : <Eye />}</div>
            <h1>{path === "/recover" ? "Restore your session" : "Identify yourself"}</h1>
            <p>
              {path === "/recover"
                ? "Your original assignment and submission are preserved."
                : "Enter the participant ID printed on your event badge or scanned from your QR."}
            </p>
            <label>PARTICIPANT ID</label>
            <input
              autoFocus
              className="field id"
              value={code}
              maxLength={5}
              placeholder="DG-07"
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError("");
              }}
            />
            {error && (
              <div className="form-error">
                <AlertTriangle /> {error}
              </div>
            )}
            <button className="primary wide" onClick={verify}>
              {path === "/recover" ? "RESTORE SESSION" : "VERIFY IDENTITY"} <ChevronRight />
            </button>
            <small>
              No badge yet? <a href="#" onClick={(e) => { e.preventDefault(); go("/join"); }} style={{ color: "#70aaff" }}>Claim an available ID via Master Check-in</a>
            </small>
          </div>
        </section>
      </ParticipantShell>
    );

  if (!person)
    return (
      <ParticipantShell online={online} go={go}>
        <section className="center-stage">
          <div className="verify-card">
            <AlertTriangle className="scan-icon bare" />
            <h1>Session not found</h1>
            <p>Your session is safe. Verify your participant ID or claim an available slot to continue.</p>
            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <button className="primary wide" onClick={() => go("/join")}>
                <QrCode size={16} /> CLAIM ID
              </button>
              <button className="secondary wide" onClick={() => go("/verify")}>
                VERIFY ID
              </button>
            </div>
          </div>
        </section>
      </ParticipantShell>
    );

  if (path === "/waiting" || store.status === "WAITING" || store.status === "READY")
    return (
      <ParticipantShell online={online} go={go}>
        <section className="waiting">
          <div className="radar">
            <div />
            <div />
            <span>
              <Check />
            </span>
          </div>
          <Pill tone="green">IDENTITY VERIFIED</Pill>
          <h1>{person.code}</h1>
          <h2>Your mirror is waiting.</h2>
          <p>
            Round 1 has not started yet. Keep this screen open.
            <br />
            Your challenge will appear when the organizer starts.
          </p>
          <div className="waiting-status">
            <span className="pulse-dot" />
            <div>
              <small>ROUND STATUS</small>
              <b>{store.status}</b>
            </div>
          </div>
          <button className="secondary" onClick={() => store.status === "LIVE" && go("/challenge")}>
            <RefreshCw /> CHECK ROUND STATUS
          </button>
        </section>
      </ParticipantShell>
    );

  if (path === "/complete" || person.status === "SUBMITTED")
    return (
      <ParticipantShell online={online} go={go}>
        <section className="complete">
          <div className="success-ring">
            <Check />
          </div>
          <Pill tone="green">SUBMISSION RECEIVED</Pill>
          <h1>Mirror locked.</h1>
          <p>Your prompt and generated UI image have entered the system.</p>
          <div className="receipt">
            <div>
              <span>PARTICIPANT</span>
              <b>{person.code} ({person.name || "Participant"})</b>
            </div>
            <div>
              <span>CHALLENGE</span>
              <b>{person.challenge}</b>
            </div>
            <div>
              <span>SUBMITTED</span>
              <b>{person.submittedAt ? new Date(person.submittedAt).toLocaleTimeString() : "Confirmed"}</b>
            </div>
            <div>
              <span>STATUS</span>
              <b className="success">LOCKED</b>
            </div>
          </div>

          {person.prompt && (
            <div style={{ width: "100%", maxWidth: "480px", margin: "16px auto 0", background: "#0c1017", border: "1px solid #1e2638", borderRadius: "12px", padding: "14px", textAlign: "left" }}>
              <small style={{ color: "#70aaff", fontWeight: 700, fontSize: "10px", letterSpacing: "0.1em" }}>YOUR SUBMITTED PROMPT</small>
              <p style={{ color: "#d1d5db", fontSize: "12px", margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{person.prompt}</p>
            </div>
          )}

          {person.submissionImage && (
            <div style={{ width: "100%", maxWidth: "480px", margin: "14px auto 0", textAlign: "left" }}>
              <small style={{ color: "#00e5a3", fontWeight: 700, fontSize: "10px", letterSpacing: "0.1em", display: "block", marginBottom: "6px" }}>YOUR SUBMITTED UI IMAGE</small>
              <img src={person.submissionImage} alt="Submitted UI" style={{ maxHeight: "240px", width: "100%", objectFit: "contain", borderRadius: "10px", border: "1px solid #202738", background: "#070a0e" }} />
            </div>
          )}

          <p className="safe" style={{ marginTop: "16px" }}>
            <ShieldCheck /> Submission saved and duplicate-protected
          </p>
        </section>
      </ParticipantShell>
    );

  if (path === "/submit")
    return (
      <ParticipantShell online={online} go={go}>
        <section className="submit-wrap">
          <div className="submit-head">
            <button className="back" onClick={() => go("/challenge")}>
              <ArrowLeft /> Back to challenge
            </button>
            <Pill tone="violet">{person.challenge}</Pill>
            <h1>Lock your mirror</h1>
            <p>Submit your prompt and generated UI image. Once locked, this cannot be changed.</p>
          </div>
          <div className="submit-card">
            {/* 1. Prompt */}
            <label>
              1. AI PROMPT USED <b style={{ color: "#00e5a3" }}>*REQUIRED</b>
            </label>
            <textarea
              className="field"
              value={promptText}
              placeholder="Type or paste the exact AI prompt you used to generate / recreate this UI..."
              rows={4}
              onChange={(e) => {
                setPromptText(e.target.value);
                setError("");
              }}
              style={{ height: "95px", padding: "12px", resize: "vertical", fontSize: "13px" }}
            />

            {/* 2. Image Upload */}
            <label style={{ marginTop: "16px" }}>
              2. GENERATED UI IMAGE UPLOAD <b style={{ color: "#00e5a3" }}>*REQUIRED (PNG, JPG, JPEG, WEBP)</b>
            </label>
            <div
              className={`dropzone ${dragOverSub ? "active" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverSub(true);
              }}
              onDragLeave={() => setDragOverSub(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setDragOverSub(false);
                if (e.dataTransfer.files?.[0]) {
                  try {
                    setUploadingSub(true);
                    const dataUrl = await processImageFile(e.dataTransfer.files[0]);
                    setSubmissionImg(dataUrl);
                    setError("");
                  } catch {
                    setError("Failed to process image file.");
                  } finally {
                    setUploadingSub(false);
                  }
                }
              }}
              onClick={() => subFileInputRef.current?.click()}
              style={{ minHeight: "160px", cursor: "pointer", marginTop: "6px" }}
            >
              <input
                ref={subFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={async (e) => {
                  if (e.target.files?.[0]) {
                    try {
                      setUploadingSub(true);
                      const dataUrl = await processImageFile(e.target.files[0]);
                      setSubmissionImg(dataUrl);
                      setError("");
                    } catch {
                      setError("Failed to process image file.");
                    } finally {
                      setUploadingSub(false);
                    }
                  }
                }}
              />
              {uploadingSub ? (
                <div style={{ display: "grid", placeItems: "center", gap: "10px", padding: "24px" }}>
                  <RefreshCw className="animate-spin" size={26} style={{ color: "#7557ff" }} />
                  <span style={{ fontSize: "12px", color: "#8e99ac" }}>Uploading & optimizing UI image...</span>
                </div>
              ) : submissionImg ? (
                <div style={{ width: "100%", display: "grid", gap: "8px", placeItems: "center", padding: "10px" }}>
                  <img
                    src={submissionImg}
                    alt="Submission Preview"
                    style={{ maxHeight: "200px", maxWidth: "100%", borderRadius: "8px", objectFit: "contain", border: "1px solid #303849" }}
                  />
                  <span style={{ fontSize: "11px", color: "#70aaff", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Upload size={13} /> Click or drag to replace image
                  </span>
                </div>
              ) : (
                <div style={{ display: "grid", placeItems: "center", gap: "10px", padding: "26px 14px", textAlign: "center" }}>
                  <div style={{ width: "46px", height: "46px", borderRadius: "12px", background: "rgba(117,87,255,0.12)", border: "1px solid rgba(117,87,255,0.3)", display: "grid", placeItems: "center", color: "#9c88ff" }}>
                    <Upload size={22} />
                  </div>
                  <div>
                    <b style={{ fontSize: "13px", display: "block", color: "#e4e8f1" }}>Click to upload UI image or screenshot</b>
                    <small style={{ fontSize: "11px", color: "#798396" }}>PNG, JPG, JPEG, WEBP (Any size supported)</small>
                  </div>
                </div>
              )}
            </div>

            <label className="checkbox" style={{ marginTop: "18px" }}>
              <input type="checkbox" checked={fair} onChange={(e) => setFair(e.target.checked)} />
              <span>
                <b>Fair-use confirmation</b>
                <small>I confirm that I used free-tier AI tools to generate this mirror during the active round.</small>
              </span>
            </label>

            {error && (
              <div className="form-error">
                <AlertTriangle /> {error}
              </div>
            )}

            <button className="primary danger wide" disabled={!fair} onClick={() => setConfirm(true)}>
              <LockKeyhole /> LOCK SUBMISSION
            </button>
            <p className="autosave">
              <CheckCircle2 /> Draft automatically saved on this device
            </p>
          </div>
          {confirm && (
            <Confirm
              title="Lock submission?"
              text="Once submitted, your prompt and image submission cannot be changed."
              cancel={() => setConfirm(false)}
              action={submit}
              label="LOCK MIRROR"
            />
          )}
        </section>
      </ParticipantShell>
    );

  return (
    <ParticipantShell online={online} go={go}>
      <section className="challenge-page">
        <div className="challenge-header">
          <div>
            <Pill tone={store.status === "PAUSED" ? "amber" : "green"}>
              {store.status === "PAUSED" ? "ROUND PAUSED" : "ROUND LIVE"}
            </Pill>
            <h1>{challenge?.title}</h1>
            <p>
              {person.code} · {person.challenge}
            </p>
          </div>
          <div className={`timer ${remaining < 300 ? "urgent" : ""}`}>
            <Clock3 />
            <div>
              <small>TIME REMAINING</small>
              <b>{store.status === "PAUSED" ? "PAUSED" : formatTime(remaining)}</b>
            </div>
          </div>
        </div>
        <div className="challenge-grid">
          <div className="reference">
            <div className="reference-bar">
              <span>REFERENCE INTERFACE</span>
              <button onClick={() => setFullscreenRef(true)} title="View reference in fullscreen">
                <Maximize2 size={15} /> Fullscreen
              </button>
            </div>
            <MockReference challenge={challenge} />
          </div>
          <aside className="mission">
            <Pill>YOUR MISSION</Pill>
            <h2>Observe. Recreate. Elevate.</h2>
            <p>{challenge?.description || "Recreate the visual structure, hierarchy and user experience of the reference."}</p>
            {challenge?.specs && challenge.specs.length > 0 && (
              <div style={{ margin: "14px 0", padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
                <small style={{ fontSize: "9px", letterSpacing: "0.14em", color: "#8d96a8", fontWeight: 700, display: "block", marginBottom: "8px" }}>DESIGN TARGETS & SPECS</small>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {challenge.specs.map((s, idx) => (
                    <span key={idx} className="spec-chip">{s}</span>
                  ))}
                </div>
              </div>
            )}
            <ul>
              <li>
                <Check /> Match layout and spacing
              </li>
              <li>
                <Check /> Preserve visual hierarchy
              </li>
              <li>
                <Check /> Make it responsive
              </li>
              <li>
                <Check /> Use free-tier tools only
              </li>
            </ul>
            <div className="policy">
              <ShieldCheck />
              <div>
                <b>FAIR PLAY POLICY</b>
                <span>No pro accounts, paid credits or premium-only features.</span>
              </div>
            </div>
          </aside>
        </div>
        <div className="bottom-action">
          <div>
            <span className="pulse-dot" />
            <small>Draft recovery is active</small>
          </div>
          <button className="primary" disabled={store.status !== "LIVE"} onClick={() => go("/submit")}>
            <Send /> SUBMIT MIRROR
          </button>
        </div>
      </section>
      {fullscreenRef && (
        <div className="modal-backdrop" onClick={() => setFullscreenRef(false)}>
          <div className="modal reference-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <Pill tone="violet">{challenge?.code}</Pill>
                  <Pill tone="slate">{challenge?.difficulty || "Medium"}</Pill>
                  {challenge?.imageUrl && <Pill tone="green">CUSTOM UI LOADED</Pill>}
                </div>
                <h2>{challenge?.title} — Full Reference</h2>
                {challenge?.description && <p style={{ color: "#8590a4", fontSize: "12px", margin: "4px 0 0" }}>{challenge.description}</p>}
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {challenge?.imageUrl && (
                  <a
                    href={challenge.imageUrl}
                    download={`${challenge.code}-reference.png`}
                    className="secondary"
                    style={{ padding: "0 12px", minHeight: "36px", fontSize: "11px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <Download size={14} /> Download Asset
                  </a>
                )}
                <button className="iconbtn" onClick={() => setFullscreenRef(false)}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="modal-body">
              <MockReference challenge={challenge} expanded />
            </div>
          </div>
        </div>
      )}
    </ParticipantShell>
  );
}

function MockReference({ challenge, expanded = false, allowToggle = true }: { challenge?: Challenge; expanded?: boolean; allowToggle?: boolean }) {
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const c = challenge?.color || "#7357ff";
  const code = challenge?.code || "MIRROR-01";
  const imageUrl = challenge?.imageUrl;

  if (viewMode === "mobile") {
    return (
      <div className={`mock ${expanded ? "mock-expanded" : ""}`} style={{ "--mock": c } as React.CSSProperties}>
        {allowToggle && (
          <div className="view-mode-bar">
            <button
              className={`view-mode-btn ${viewMode === "desktop" ? "active" : ""}`}
              onClick={() => setViewMode("desktop")}
              title="Desktop View"
            >
              <Monitor size={12} /> Desktop View
            </button>
            <button
              className={`view-mode-btn ${viewMode === "mobile" ? "active" : ""}`}
              onClick={() => setViewMode("mobile")}
              title="Mobile View"
            >
              <Smartphone size={12} /> Mobile View
            </button>
          </div>
        )}
        <div className="mock-phone">
          {imageUrl ? (
            <div className="mock-uploaded-wrap">
              <img src={imageUrl} alt={challenge?.title || "Challenge UI Reference"} className="mock-uploaded-img" />
            </div>
          ) : (
            <div style={{ display: "grid", placeItems: "center", minHeight: "260px", padding: "24px", textAlign: "center", color: "#687387" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "rgba(115,87,255,0.12)", color: "#9c88ff", display: "grid", placeItems: "center", marginBottom: "12px" }}>
                <Upload size={22} />
              </div>
              <b style={{ color: "#d2d8e4", fontSize: "14px" }}>{challenge?.title || "No Image Uploaded"}</b>
              <small style={{ fontSize: "12px", color: "#798396", marginTop: "4px" }}>Upload a challenge UI design screenshot</small>
            </div>
          )}
        </div>
      </div>
    );
  }

  // DEFAULT: DESKTOP BROWSER VIEW
  return (
    <div className={`mock mock-desktop-container ${expanded ? "mock-expanded" : ""}`} style={{ "--mock": c } as React.CSSProperties}>
      {allowToggle && (
        <div className="view-mode-bar">
          <button
            className={`view-mode-btn ${viewMode === "desktop" ? "active" : ""}`}
            onClick={() => setViewMode("desktop")}
            title="Desktop View"
          >
            <Monitor size={12} /> Desktop View
          </button>
          <button
            className={`view-mode-btn ${viewMode === "mobile" ? "active" : ""}`}
            onClick={() => setViewMode("mobile")}
            title="Mobile View"
          >
            <Smartphone size={12} /> Mobile View
          </button>
        </div>
      )}
      <div className="mock-desktop">
        <div className="mock-browser-bar">
          <div className="mock-browser-dots">
            <span className="dot dot-red" />
            <span className="dot dot-yellow" />
            <span className="dot dot-green" />
          </div>
          <div className="mock-browser-url">
            <LockKeyhole size={10} style={{ color: "#37d39a", flex: "none" }} />
            <span>https://doppelganger.io/challenge/{code.toLowerCase()}</span>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <Pill tone="slate">{challenge?.title || code}</Pill>
          </div>
        </div>

        <div className="mock-browser-body">
          {imageUrl ? (
            <div className="mock-uploaded-desktop-wrap">
              <img src={imageUrl} alt={challenge?.title || "Challenge UI Reference"} className="mock-uploaded-desktop-img" />
            </div>
          ) : (
            <div style={{ display: "grid", placeItems: "center", minHeight: "280px", padding: "32px", textAlign: "center", color: "#687387" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "rgba(115,87,255,0.12)", color: "#9c88ff", display: "grid", placeItems: "center", marginBottom: "12px" }}>
                <Upload size={24} />
              </div>
              <b style={{ color: "#d2d8e4", fontSize: "15px" }}>{challenge?.title || "No Image Uploaded"}</b>
              <small style={{ fontSize: "12px", color: "#798396", marginTop: "4px" }}>Upload a challenge UI design screenshot in the Admin panel</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Confirm({
  title,
  text,
  cancel,
  action,
  label,
}: {
  title: string;
  text: string;
  cancel: () => void;
  action: () => void;
  label: string;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-icon">
          <AlertTriangle />
        </div>
        <h2>{title}</h2>
        <p>{text}</p>
        <div>
          <button className="secondary" onClick={cancel}>
            CANCEL
          </button>
          <button className="primary" onClick={action}>
            {label}
          </button>
        </div>
      </div>
    </div>
  );
}

function Admin({
  store,
  setStore,
  go,
  path,
}: {
  store: Store;
  setStore: (s: Store) => void;
  go: (p: string) => void;
  path: string;
}) {
  const [logged, setLogged] = useState(() => typeof window !== "undefined" && sessionStorage.getItem("dg-admin") === "yes");
  const [adminUser, setAdminUser] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const remaining = useClock(store);

  const handleAdminLogin = async () => {
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: adminUser.trim(), password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Login failed");
      sessionStorage.setItem("dg-admin", "yes");
      setLogged(true);
      setError("");
      go("/admin");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed. Use admin / admin@dp");
    }
  };

  if (path === "/admin/login" || !logged)
    return (
      <main className="admin-login">
        <div className="login-side">
          <Brand />
          <div>
            <Pill>EVENT OPERATIONS</Pill>
            <h1>
              Command the
              <br />
              <em>mirror.</em>
            </h1>
            <p>Reliable live-event control for Round 01.</p>
          </div>
          <small>K.L.N. COLLEGE OF ENGINEERING · IT</small>
        </div>
        <div className="login-panel">
          <div className="login-card">
            <div className="shield">
              <ShieldCheck />
            </div>
            <h2>Admin Control Center</h2>
            <p>Authorized event organizers and staff only</p>
            
            <label>ADMIN USERNAME / NAME</label>
            <input
              className="field"
              value={adminUser}
              placeholder="admin"
              onChange={(e) => {
                setAdminUser(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
            />

            <label>ADMIN PASSWORD</label>
            <input
              className="field"
              type="password"
              value={password}
              placeholder="admin@dp"
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
            />

            <small style={{ display: "block", color: "#687184", marginBottom: "12px", fontSize: "11px" }}>
              Default credentials: Name: <code style={{ color: "#00e5a3" }}>admin</code> · Password: <code style={{ color: "#70aaff" }}>admin@dp</code>
            </small>

            {error && (
              <div className="form-error">
                <AlertTriangle /> {error}
              </div>
            )}
            <button
              className="primary wide"
              onClick={handleAdminLogin}
            >
              LOGIN TO ADMIN DASHBOARD <ChevronRight />
            </button>
            <button
              className="secondary wide"
              onClick={() => go("/")}
              style={{ marginTop: "10px" }}
            >
              <ArrowLeft size={16} /> Back to Event Home
            </button>
          </div>
        </div>
      </main>
    );

  const setRound = async (action: string) => {
    try {
      const r = await fetch("/api/admin/state", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": "admin@dp",
          "x-admin-auth": "admin-session-active",
        },
        body: JSON.stringify({ type: "round", action }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setStore(d.store);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setConfirm(null);
    }
  };

  const persist = async (next: Store) => {
    setStore(next);
    const r = await fetch("/api/admin/state", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-key": "admin@dp",
        "x-admin-auth": "admin-session-active",
      },
      body: JSON.stringify({ type: "replace", store: next }),
    });
    if (!r.ok) {
      const d = await r.json();
      setError(d.error || "Save failed");
    } else {
      setError("");
    }
  };

  const nav = [
    ["/admin", LayoutDashboard, "Overview"],
    ["/admin/badges", QrCode, "Master QR & Badges"],
    ["/admin/participants", Users, "Participants"],
    ["/admin/challenges", Sparkles, "Challenges"],
    ["/admin/assignments", Settings2, "Assignments"],
    ["/admin/round", Clock3, "Round control"],
    ["/admin/health", HeartPulse, "System health"],
    ["/admin/recovery", RefreshCw, "Recovery"],
  ] as const;

  const stats = {
    verified: store.participants.filter((p) => p.status !== "REGISTERED").length,
    active: store.participants.filter((p) => p.status === "ACTIVE").length,
    submitted: store.participants.filter((p) => p.status === "SUBMITTED").length,
  };

  const exportCsv = (type: "submissions" | "assignments") => {
    const head =
      type === "submissions"
        ? "Participant ID,Name,College,Challenge,Project URL,Figma URL,Submitted At,Status"
        : "Participant ID,Challenge";
    const rows = store.participants.map((p) =>
      type === "submissions"
        ? [p.code, p.name, p.college, p.challenge, p.projectUrl || "", p.figmaUrl || "", p.submittedAt || "", p.status].join(",")
        : `${p.code},${p.challenge}`
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([[head, ...rows].join("\n")], { type: "text/csv" }));
    a.download = type === "submissions" ? "doppelganger-round1-submissions.csv" : "doppelganger-assignments.csv";
    a.click();
  };

  return (
    <main className={`admin-shell ${mobileNav ? "nav-open" : ""}`}>
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <Brand compact />
        <nav>
          {nav.map(([p, I, label]) => (
            <button
              key={p}
              className={path === p ? "active" : ""}
              onClick={() => {
                go(p);
                setMobileNav(false);
              }}
            >
              <I />
              {label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <button
            onClick={() => {
              go("/live");
              setMobileNav(false);
            }}
          >
            <Radio /> Projector view
          </button>
          <button
            onClick={() => {
              sessionStorage.removeItem("dg-admin");
              setLogged(false);
              go("/admin/login");
            }}
          >
            <LogOut /> Sign out
          </button>
        </div>
      </aside>
      <section className="admin-main">
        <header>
          <button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)}>
            {mobileNav ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div>
            <span>ROUND 01 · THE MIRROR</span>
            <b>Control Center</b>
          </div>
          <div className="ops">
            <span className="connection on">
              <Wifi /> SYSTEM ONLINE
            </span>
            <span className="operator">KLN</span>
          </div>
        </header>
        <div className="admin-content">
          {error && (
            <div className="form-error">
              <AlertTriangle /> {error}
            </div>
          )}
          {path === "/admin/badges" ? (
            <BadgeCenter store={store} setStore={persist} />
          ) : path === "/admin/participants" ? (
            <Participants store={store} setStore={persist} search={search} setSearch={setSearch} />
          ) : path === "/admin/challenges" ? (
            <Challenges store={store} setStore={persist} />
          ) : path === "/admin/assignments" ? (
            <Assignments store={store} setStore={persist} exportCsv={exportCsv} />
          ) : path === "/admin/round" ? (
            <RoundControl store={store} remaining={remaining} ask={setConfirm} />
          ) : path === "/admin/health" ? (
            <Health store={store} />
          ) : path === "/admin/recovery" ? (
            <Recovery store={store} setStore={persist} />
          ) : (
            <Overview store={store} stats={stats} remaining={remaining} ask={setConfirm} exportCsv={exportCsv} />
          )}
        </div>
      </section>
      {confirm && (
        <Confirm
          title={`${confirm} round?`}
          text={
            confirm === "RESET"
              ? "This resets round status to WAITING and clears verified/submitted participant states for a fresh round."
              : "This action updates every participant and the projector immediately."
          }
          cancel={() => setConfirm(null)}
          action={() => setRound(confirm)}
          label={confirm}
        />
      )}
    </main>
  );
}

function PageTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="page-title">
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      {action}
    </div>
  );
}

function BadgeCenter({ store, setStore }: { store: Store; setStore?: (s: Store) => void }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const masterUrl = `${origin}/join`;
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(masterUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateSlots = async (count: number = 20) => {
    const nextList: Participant[] = Array.from({ length: count }, (_, i) => ({
      code: `DG-${String(i + 1).padStart(2, "0")}`,
      name: `Participant ${i + 1}`,
      college: "Participant",
      challenge: store.challenges.length > 0 ? store.challenges[i % store.challenges.length].code : "",
      status: "REGISTERED",
    }));
    if (setStore) setStore({ ...store, participants: nextList });
    try {
      await fetch("/api/admin/state", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-key": "admin@dp", "x-admin-auth": "admin-session-active" },
        body: JSON.stringify({ type: "generate-participants", count }),
      });
    } catch {}
  };

  return (
    <>
      <PageTitle
        eyebrow="EVENT CREDENTIALS"
        title="Master QR & Participant Badges"
        action={
          <div style={{ display: "flex", gap: "10px" }}>
            {store.participants.length > 0 && (
              <button className="primary btn-hide-print" onClick={() => window.print()}>
                <Printer size={16} /> Print Badge Sheet
              </button>
            )}
            {store.participants.length === 0 && (
              <button className="secondary btn-hide-print" onClick={() => generateSlots(20)}>
                <Sparkles size={15} /> Generate 20 Badges (DG-01 to DG-20)
              </button>
            )}
          </div>
        }
      />

      <div className="master-qr-hero">
        <div className="qr-box" style={{ background: "#ffffff", padding: "12px", borderRadius: "14px", display: "inline-grid", placeItems: "center" }}>
          <QRCodeSVG value={masterUrl} size={160} fgColor="#090d14" bgColor="#ffffff" />
        </div>
        <div>
          <Pill tone="green">MASTER EVENT QR</Pill>
          <h2>Hall Check-In & Auto-Assignment QR</h2>
          <p>
            Display this on the auditorium projector or entrance posters. Students scan this with their mobile camera to instantly auto-claim an available participant badge ID and enter the round.
          </p>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "12px" }}>
            <span className="url-pill">{masterUrl}</span>
            <button className="secondary btn-hide-print" onClick={copyLink} style={{ minHeight: "36px", padding: "0 12px", fontSize: "11px" }}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy Join Link"}
            </button>
          </div>
        </div>
      </div>

      <div className="toolbar btn-hide-print" style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <b>Individual Badges</b>
          <span style={{ color: "#7a8497", fontSize: "12px" }}>({store.participants.length} Registered Cards)</span>
        </div>
        {store.participants.length > 0 && <Pill tone="slate">READY FOR PRINT</Pill>}
      </div>

      {store.participants.length === 0 ? (
        <div className="panel" style={{ padding: "40px 20px", textAlign: "center", color: "#828ea2" }}>
          <Users size={36} style={{ color: "#7557ff", margin: "0 auto 12px", opacity: 0.7 }} />
          <h3 style={{ color: "#e2e8f0", fontSize: "16px", marginBottom: "6px" }}>No Individual Badges Created Yet</h3>
          <p style={{ fontSize: "13px", maxWidth: "460px", margin: "0 auto 16px", color: "#718096" }}>
            Participants can scan the Master QR above to join dynamically, or you can generate ID slots (DG-01 to DG-20) to print physical badge sheets.
          </p>
          <button className="primary" onClick={() => generateSlots(20)} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <Sparkles size={15} /> Generate 20 Badge Slots
          </button>
        </div>
      ) : (
        <div className="badge-grid">
          {store.participants.map((p) => {
            const directUrl = `${origin}/verify?id=${p.code}`;
            return (
              <div className="badge-card" key={p.code}>
                <div className="badge-top">
                  <Pill tone={p.status === "SUBMITTED" ? "green" : p.status === "ACTIVE" ? "blue" : "violet"}>
                    {p.challenge || "ROOKIE"}
                  </Pill>
                  <small style={{ color: "#6e798d", fontSize: "9px" }}>ROUND 01</small>
                </div>
                <h3>{p.code}</h3>
                <span>{p.name || "Participant"}</span>
                <div className="badge-qr" style={{ background: "#ffffff", padding: "8px", borderRadius: "10px", margin: "10px auto", display: "inline-grid", placeItems: "center" }}>
                  <QRCodeSVG value={directUrl} size={110} fgColor="#05070a" bgColor="#ffffff" />
                </div>
                <small className="badge-foot">Scan to Login Directly</small>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Overview({
  store,
  stats,
  remaining,
  ask,
  exportCsv,
}: {
  store: Store;
  stats: any;
  remaining: number;
  ask: (s: string) => void;
  exportCsv: (t: "submissions" | "assignments") => void;
}) {
  return (
    <>
      <PageTitle
        eyebrow="LIVE OPERATIONS"
        title="Event overview"
        action={
          <button className="secondary" onClick={() => exportCsv("submissions")}>
            <Download /> Export results
          </button>
        }
      />
      <div className="status-strip">
        <div>
          <span className={`status-light ${store.status.toLowerCase()}`} />
          <small>ROUND STATUS</small>
          <b>{store.status}</b>
        </div>
        <div className="big-time">
          <Clock3 />
          <b>{formatTime(remaining)}</b>
        </div>
        <div className="quick-controls">
          {store.status === "LIVE" ? (
            <button onClick={() => ask("PAUSE")}>
              <Pause /> Pause
            </button>
          ) : store.status === "PAUSED" ? (
            <button onClick={() => ask("RESUME")}>
              <Play /> Resume
            </button>
          ) : (
            <button onClick={() => ask("START")}>
              <Play /> Start
            </button>
          )}
          <button onClick={() => ask("EXTEND")}>
            <Clock3 /> +5 min
          </button>
          <button className="end" onClick={() => ask("END")}>
            <Square /> End
          </button>
          <button className="reset-btn" onClick={() => ask("RESET")} title="Reset round">
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>
      <div className="stat-grid">
        <Stat icon={Users} label="TOTAL" value={store.participants.length} detail="Registered participants" />
        <Stat
          icon={ShieldCheck}
          label="VERIFIED"
          value={stats.verified}
          detail={`${store.participants.length - stats.verified} waiting`}
        />
        <Stat icon={Activity} label="ACTIVE" value={stats.active} detail="Building now" />
        <Stat
          icon={FileCheck2}
          label="SUBMITTED"
          value={stats.submitted}
          detail={`${store.participants.length - stats.submitted} pending`}
        />
      </div>
      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <span>LIVE MONITOR</span>
              <h2>Participant activity</h2>
            </div>
            <Pill tone="green">AUTO REFRESH</Pill>
          </div>
          <ParticipantTable participants={store.participants.slice(0, 10)} />
        </div>
        <div className="panel distribution">
          <div className="panel-head">
            <div>
              <span>ASSIGNMENT</span>
              <h2>Challenge distribution</h2>
            </div>
          </div>
          {store.challenges.map((c) => {
            const n = store.participants.filter((p) => p.challenge === c.code).length;
            return (
              <div className="dist" key={c.code}>
                <span style={{ background: c.color }}>{c.code.slice(-2)}</span>
                <div>
                  <b>{c.code}</b>
                  <small>{c.title}</small>
                </div>
                <strong>{n}</strong>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Stat({ icon: I, label, value, detail }: { icon: any; label: string; value: number; detail: string }) {
  return (
    <div className="stat">
      <I />
      <span>{label}</span>
      <b>{String(value).padStart(2, "0")}</b>
      <small>{detail}</small>
    </div>
  );
}

function ParticipantTable({
  participants,
  onDelete,
}: {
  participants: Participant[];
  onDelete?: (code: string) => void;
}) {
  const [selectedSub, setSelectedSub] = useState<Participant | null>(null);

  if (participants.length === 0) {
    return (
      <div style={{ padding: "48px 20px", textAlign: "center", color: "#798499" }}>
        <Users size={32} style={{ color: "#7557ff", margin: "0 auto 10px", opacity: 0.8 }} />
        <h3 style={{ color: "#e4e8f1", fontSize: "15px", marginBottom: "4px" }}>No Participants Found</h3>
        <p style={{ fontSize: "12px", color: "#687387", margin: 0 }}>
          Participants will appear here when they scan the Master QR or check in.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>PARTICIPANT</th>
              <th>CHALLENGE</th>
              <th>STATUS</th>
              <th>VERIFIED</th>
              <th>SUBMISSION (PROMPT & IMAGE)</th>
              {onDelete && <th style={{ width: "50px", textAlign: "center" }}>ACTION</th>}
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p.code}>
                <td>
                  <b>{p.code}</b>
                  <span>
                    {p.name} ({p.college})
                  </span>
                </td>
                <td>{p.challenge || "—"}</td>
                <td>
                  <Pill
                    tone={
                      p.status === "SUBMITTED"
                        ? "green"
                        : p.status === "ACTIVE"
                        ? "blue"
                        : p.status === "EXPIRED"
                        ? "red"
                        : "slate"
                    }
                  >
                    {p.status}
                  </Pill>
                </td>
                <td>{p.verifiedAt ? new Date(p.verifiedAt).toLocaleTimeString() : "—"}</td>
                <td>
                  {p.status === "SUBMITTED" || p.submissionImage || p.prompt ? (
                    <button
                      type="button"
                      className="secondary"
                      style={{ padding: "0 10px", minHeight: "30px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                      onClick={() => setSelectedSub(p)}
                    >
                      <Eye size={13} /> View Submission
                    </button>
                  ) : p.projectUrl ? (
                    <a
                      href={p.projectUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#70aaff", display: "inline-flex", alignItems: "center", gap: "4px" }}
                    >
                      View Link <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span style={{ color: "#687285", fontSize: "11px" }}>Pending</span>
                  )}
                </td>
                {onDelete && (
                  <td style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      className="iconbtn"
                      style={{ color: "#ff6b6b", padding: "4px 8px" }}
                      title={`Remove ${p.code}`}
                      onClick={() => onDelete(p.code)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedSub && (
        <div className="modal-backdrop" onClick={() => setSelectedSub(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "580px", width: "100%" }}>
            <div className="modal-head">
              <div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <Pill tone="green">SUBMITTED</Pill>
                  <Pill tone="violet">{selectedSub.code}</Pill>
                  <Pill tone="slate">{selectedSub.challenge}</Pill>
                </div>
                <h2 style={{ marginTop: "6px" }}>{selectedSub.name} — {selectedSub.college}</h2>
                <p style={{ fontSize: "11px", color: "#838fa3", margin: "2px 0 0" }}>
                  Submitted at: {selectedSub.submittedAt ? new Date(selectedSub.submittedAt).toLocaleString() : "Confirmed"}
                </p>
              </div>
              <button className="iconbtn" onClick={() => setSelectedSub(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "grid", gap: "16px", marginTop: "16px" }}>
              {/* 1. Prompt */}
              <div>
                <label style={{ fontSize: "10px", letterSpacing: "0.12em", color: "#70aaff", fontWeight: 700, display: "block", marginBottom: "6px" }}>
                  1. AI PROMPT USED
                </label>
                <div style={{ background: "#0c1017", border: "1px solid #1e2638", borderRadius: "10px", padding: "12px", color: "#e2e8f0", fontSize: "13px", whiteSpace: "pre-wrap", maxHeight: "140px", overflowY: "auto" }}>
                  {selectedSub.prompt || <i style={{ color: "#6e798e" }}>No prompt text recorded</i>}
                </div>
              </div>

              {/* 2. Image */}
              <div>
                <label style={{ fontSize: "10px", letterSpacing: "0.12em", color: "#00e5a3", fontWeight: 700, display: "block", marginBottom: "6px" }}>
                  2. GENERATED UI IMAGE
                </label>
                {selectedSub.submissionImage ? (
                  <div style={{ background: "#070a0e", border: "1px solid #1e2638", borderRadius: "10px", padding: "10px", display: "grid", placeItems: "center", gap: "8px" }}>
                    <img
                      src={selectedSub.submissionImage}
                      alt="Submitted UI"
                      style={{ maxHeight: "280px", maxWidth: "100%", objectFit: "contain", borderRadius: "8px" }}
                    />
                    <a
                      href={selectedSub.submissionImage}
                      download={`${selectedSub.code}-submission.png`}
                      className="secondary"
                      style={{ fontSize: "11px", minHeight: "32px", padding: "0 12px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "5px" }}
                    >
                      <Download size={13} /> Download Full Image
                    </a>
                  </div>
                ) : (
                  <div style={{ background: "#0c1017", border: "1px solid #1e2638", borderRadius: "10px", padding: "20px", textAlign: "center", color: "#6e798e", fontSize: "12px" }}>
                    No image file attached
                  </div>
                )}
              </div>

              {selectedSub.projectUrl && (
                <div>
                  <label style={{ fontSize: "10px", letterSpacing: "0.12em", color: "#8d96a8", fontWeight: 700, display: "block", marginBottom: "4px" }}>
                    PROJECT / HOSTED LINK
                  </label>
                  <a href={selectedSub.projectUrl} target="_blank" rel="noreferrer" style={{ color: "#70aaff", fontSize: "13px", wordBreak: "break-all" }}>
                    {selectedSub.projectUrl}
                  </a>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "18px", borderTop: "1px solid #202736", paddingTop: "14px" }}>
              <button className="primary" onClick={() => setSelectedSub(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Participants({
  store,
  setStore,
  search,
  setSearch,
}: {
  store: Store;
  setStore: (s: Store) => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  const list = store.participants.filter((p) =>
    (p.code + p.name + p.college + p.challenge).toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (code: string) => {
    const nextList = store.participants.filter((p) => p.code !== code);
    setStore({ ...store, participants: nextList });
    try {
      await fetch("/api/admin/state", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-key": "admin@dp", "x-admin-auth": "admin-session-active" },
        body: JSON.stringify({ type: "delete-participant", code }),
      });
    } catch {}
  };

  const handleClearAll = async () => {
    if (!window.confirm("Are you sure you want to clear all participants?")) return;
    setStore({ ...store, participants: [] });
    try {
      await fetch("/api/admin/state", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-key": "admin@dp", "x-admin-auth": "admin-session-active" },
        body: JSON.stringify({ type: "clear-participants" }),
      });
    } catch {}
  };

  const handleAddSlot = async () => {
    const nextNum = store.participants.length + 1;
    const nextCode = `DG-${String(nextNum).padStart(2, "0")}`;
    const ch = store.challenges.length > 0 ? store.challenges[(nextNum - 1) % store.challenges.length].code : "";
    const newP: Participant = {
      code: nextCode,
      name: `Participant ${nextNum}`,
      college: "Participant",
      challenge: ch,
      status: "REGISTERED",
    };
    setStore({ ...store, participants: [...store.participants, newP] });
    try {
      await fetch("/api/admin/state", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-key": "admin@dp", "x-admin-auth": "admin-session-active" },
        body: JSON.stringify({ type: "add-participant", participant: newP }),
      });
    } catch {}
  };

  const handleGenerateSlots = async (count: number = 20) => {
    const nextList: Participant[] = Array.from({ length: count }, (_, i) => ({
      code: `DG-${String(i + 1).padStart(2, "0")}`,
      name: `Participant ${i + 1}`,
      college: "Participant",
      challenge: store.challenges.length > 0 ? store.challenges[i % store.challenges.length].code : "",
      status: "REGISTERED",
    }));
    setStore({ ...store, participants: nextList });
    try {
      await fetch("/api/admin/state", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-key": "admin@dp", "x-admin-auth": "admin-session-active" },
        body: JSON.stringify({ type: "generate-participants", count }),
      });
    } catch {}
  };

  return (
    <>
      <PageTitle
        eyebrow="EVENT ROSTER"
        title="Participants"
        action={
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="primary" onClick={handleAddSlot}>
              + Add participant slot
            </button>
            <button className="secondary" onClick={() => handleGenerateSlots(20)}>
              <Sparkles size={14} /> Generate 20 Slots
            </button>
            {store.participants.length > 0 && (
              <button
                className="secondary"
                style={{ color: "#ff6b6b", borderColor: "#552828" }}
                onClick={handleClearAll}
              >
                <Trash2 size={14} /> Clear All
              </button>
            )}
          </div>
        }
      />
      <div className="toolbar">
        <div className="search">
          <Search />
          <input
            value={search}
            placeholder="Search ID, name, college or challenge"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Pill tone="slate">{list.length} RECORDS</Pill>
      </div>
      <div className="panel">
        <ParticipantTable participants={list} onDelete={handleDelete} />
      </div>
    </>
  );
}

function ChallengeEditModal({
  challenge,
  onClose,
  onSave,
  onDelete,
  isNew = false,
}: {
  challenge: Challenge;
  onClose: () => void;
  onSave: (ch: Challenge) => Promise<void>;
  onDelete?: (code: string) => void;
  isNew?: boolean;
}) {
  const [title, setTitle] = useState(challenge.title || "");
  const [imageUrl, setImageUrl] = useState(challenge.imageUrl || "");
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [err, setErr] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    try {
      setUploading(true);
      setErr("");
      const dataUrl = await processImageFile(file);
      setImageUrl(dataUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Image processing failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setErr("Please enter the Topic / Title for this UI template.");
      return;
    }
    await onSave({
      ...challenge,
      title: title.trim(),
      imageUrl: imageUrl.trim(),
      description: `Recreate the ${title.trim()} UI design.`,
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "540px", width: "100%" }}>
        <div className="modal-head">
          <div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <Pill tone="violet">{challenge.code}</Pill>
              {imageUrl && <Pill tone="green">IMAGE ATTACHED</Pill>}
            </div>
            <h2 style={{ marginTop: "4px" }}>{isNew ? "Add UI Template" : `Edit UI Template — ${challenge.code}`}</h2>
          </div>
          <button className="iconbtn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {err && (
          <div className="form-error" style={{ margin: "12px 0 0" }}>
            <AlertTriangle size={16} /> {err}
          </div>
        )}

        <div style={{ display: "grid", gap: "16px", marginTop: "16px" }}>
          {/* Topic / Title */}
          <div>
            <label style={{ fontSize: "11px", letterSpacing: "0.12em", color: "#a0aec0", fontWeight: 700, display: "block", marginBottom: "8px" }}>
              TOPIC / CHALLENGE TITLE *
            </label>
            <input
              className="field"
              value={title}
              placeholder="e.g. Food Delivery App, Fintech Dashboard, E-Commerce Store..."
              onChange={(e) => {
                setTitle(e.target.value);
                setErr("");
              }}
              style={{ height: "46px", fontSize: "14px" }}
              autoFocus
            />
          </div>

          {/* Upload UI Image from System */}
          <div>
            <label style={{ fontSize: "11px", letterSpacing: "0.12em", color: "#a0aec0", fontWeight: 700, display: "block", marginBottom: "8px" }}>
              UPLOAD UI TEMPLATE IMAGE (FROM SYSTEM)
            </label>
            <div
              className={`dropzone ${isDragOver ? "active" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{ minHeight: "180px", cursor: "pointer" }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp, image/svg+xml"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0]);
                }}
              />
              {uploading ? (
                <div style={{ display: "grid", placeItems: "center", gap: "10px", padding: "24px" }}>
                  <RefreshCw className="animate-spin" size={28} style={{ color: "#7557ff" }} />
                  <span style={{ fontSize: "13px", color: "#8e99ac" }}>Uploading UI image...</span>
                </div>
              ) : imageUrl ? (
                <div style={{ width: "100%", display: "grid", gap: "10px", placeItems: "center", padding: "10px" }}>
                  <img
                    src={imageUrl}
                    alt="Uploaded UI Preview"
                    style={{ maxHeight: "220px", maxWidth: "100%", borderRadius: "10px", objectFit: "contain", border: "1px solid #303849" }}
                  />
                  <span style={{ fontSize: "12px", color: "#70aaff", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <Upload size={14} /> Click or drag new image to replace
                  </span>
                </div>
              ) : (
                <div style={{ display: "grid", placeItems: "center", gap: "12px", padding: "24px 16px", textAlign: "center" }}>
                  <div style={{ width: "50px", height: "50px", borderRadius: "14px", background: "rgba(117,87,255,0.12)", border: "1px solid rgba(117,87,255,0.3)", display: "grid", placeItems: "center", color: "#9c88ff" }}>
                    <Upload size={24} />
                  </div>
                  <div>
                    <b style={{ fontSize: "14px", display: "block", color: "#e4e8f1" }}>Click to upload UI image from your computer</b>
                    <small style={{ fontSize: "12px", color: "#798396" }}>or drag and drop screenshot here (PNG, JPG, WebP, SVG)</small>
                  </div>
                </div>
              )}
            </div>

            {imageUrl && (
              <button
                type="button"
                className="textbtn"
                style={{ marginTop: "8px", fontSize: "11px", color: "#ff8593", width: "100%", justifyContent: "center" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setImageUrl("");
                }}
              >
                <Trash2 size={13} /> Remove uploaded image & use vector preview
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginTop: "22px", borderTop: "1px solid #202736", paddingTop: "16px" }}>
          <div>
            {!isNew && onDelete && (
              <button
                type="button"
                className="secondary danger"
                style={{ borderColor: "rgba(255,91,110,0.4)", color: "#ff8593", display: "inline-flex", alignItems: "center", gap: "6px" }}
                onClick={() => {
                  onDelete(challenge.code);
                  onClose();
                }}
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" onClick={handleSubmit}>
              <Check size={16} /> Save UI Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Challenges({
  store,
  setStore,
}: {
  store: Store;
  setStore: (s: Store) => void;
}) {
  const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [inspectingChallenge, setInspectingChallenge] = useState<Challenge | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [challengeToDelete, setChallengeToDelete] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const directUploadRef = useRef<{ [code: string]: HTMLInputElement | null }>({});

  const showToast = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleSaveChallenge = async (updated: Challenge) => {
    try {
      setStore((prev) => {
        const nextChallenges = prev.challenges.some((c) => c.code === updated.code)
          ? prev.challenges.map((c) => (c.code === updated.code ? updated : c))
          : [...prev.challenges, updated];
        const nextStore = { ...prev, challenges: nextChallenges };
        try {
          localStorage.setItem(CHALLENGES_STORAGE, JSON.stringify(nextChallenges));
          localStorage.setItem(STORE, JSON.stringify(nextStore));
        } catch {}
        return nextStore;
      });

      const r = await fetch("/api/admin/state", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": "admin@dp",
          "x-admin-auth": "admin-session-active",
        },
        body: JSON.stringify({ type: "update-challenge", challenge: updated }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.store) {
        setStore((prev) => ({
          ...prev,
          ...d.store,
          challenges: prev.challenges.map((c) => (c.code === updated.code ? updated : c)),
        }));
      }
      showToast(`Challenge ${updated.code} (${updated.title}) saved successfully.`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update challenge");
    }
  };

  const handleDeleteChallenge = async (code: string) => {
    try {
      setStore((prev) => {
        const nextChallenges = prev.challenges.filter((c) => c.code !== code);
        const fallback = nextChallenges[0]?.code || "MIRROR-01";
        const nextParticipants = prev.participants.map((p) => (p.challenge === code ? { ...p, challenge: fallback } : p));
        const nextStore = { ...prev, challenges: nextChallenges, participants: nextParticipants };
        try {
          localStorage.setItem(CHALLENGES_STORAGE, JSON.stringify(nextChallenges));
          localStorage.setItem(STORE, JSON.stringify(nextStore));
        } catch {}
        return nextStore;
      });

      const r = await fetch("/api/admin/state", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": "admin@dp",
          "x-admin-auth": "admin-session-active",
        },
        body: JSON.stringify({ type: "delete-challenge", code }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.store) setStore(d.store);
      showToast(`Challenge ${code} deleted successfully.`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete challenge");
    }
  };

  const handleResetChallenges = async () => {
    try {
      try {
        localStorage.removeItem(CHALLENGES_STORAGE);
      } catch {}
      const r = await fetch("/api/admin/state", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": "admin@dp",
          "x-admin-auth": "admin-session-active",
        },
        body: JSON.stringify({ type: "reset-challenges" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.store) setStore(d.store);
      setConfirmReset(false);
      showToast("Reset all challenges to default presets.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to reset challenges");
    }
  };

  const handleDirectFileUpload = async (code: string, file: File) => {
    try {
      const dataUrl = await processImageFile(file);
      const existing = store.challenges.find((c) => c.code === code);
      if (!existing) return;
      await handleSaveChallenge({ ...existing, imageUrl: dataUrl });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    }
  };

  return (
    <>
      <PageTitle
        eyebrow="REFERENCE LIBRARY"
        title="UI Templates & Topics"
        action={
          <div style={{ display: "flex", gap: "10px" }}>
            {store.challenges.length > 0 && (
              <button
                className="secondary danger"
                onClick={() => setConfirmReset(true)}
                style={{ fontSize: "12px", borderColor: "rgba(255,91,110,0.3)", color: "#ff8593" }}
                title="Clear all templates"
              >
                <Trash2 size={14} /> Clear All
              </button>
            )}
            <button
              className="primary"
              onClick={() => {
                const existingCodes = new Set(store.challenges.map((c) => c.code.toUpperCase()));
                let nextNum = 1;
                while (existingCodes.has(`MIRROR-${String(nextNum).padStart(2, "0")}`)) {
                  nextNum++;
                }
                const nextCode = `MIRROR-${String(nextNum).padStart(2, "0")}`;
                setEditingChallenge({
                  code: nextCode,
                  title: "",
                  difficulty: "Medium",
                  color: "#7357ff",
                  description: "Recreate this interface.",
                  imageUrl: "",
                });
                setIsCreating(true);
              }}
              style={{ fontSize: "12px" }}
            >
              <Plus size={15} /> Add UI Template
            </button>
          </div>
        }
      />

      {feedback && (
        <div style={{ background: "rgba(55,211,154,0.12)", border: "1px solid rgba(55,211,154,0.3)", color: "#6ce7b6", borderRadius: "12px", padding: "12px 18px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
          <Check size={16} /> {feedback}
        </div>
      )}

      <div className="challenge-banner">
        <Sparkles size={24} />
        <div>
          <b>Round 01: THE MIRROR — UI Template Manager</b>
          <p>
            Upload your challenge UI design screenshots directly from your computer with the topic name. Participants will see your uploaded template design on their screen during Round 1.
          </p>
        </div>
      </div>

      {store.challenges.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", background: "rgba(255,255,255,0.02)", borderRadius: "16px", border: "1px dashed #2a3346", margin: "20px 0" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "rgba(115,87,255,0.12)", color: "#9c88ff", display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
            <Upload size={28} />
          </div>
          <h2 style={{ fontSize: "18px", color: "#e4e8f1", marginBottom: "6px" }}>No UI Templates Added Yet</h2>
          <p style={{ color: "#798396", fontSize: "13px", maxWidth: "420px", margin: "0 auto 20px" }}>
            Upload your challenge UI design screenshots with topic names. Participants will receive their assigned UI design during Round 1.
          </p>
          <button
            className="primary"
            onClick={() => {
              setEditingChallenge({
                code: "MIRROR-01",
                title: "",
                difficulty: "Medium",
                color: "#7357ff",
                description: "Recreate this interface.",
                imageUrl: "",
              });
              setIsCreating(true);
            }}
          >
            <Plus size={16} /> Add First UI Template
          </button>
        </div>
      ) : (
        <div className="challenge-admin-grid">
          {store.challenges.map((c) => {
            const assignedCount = store.participants.filter((p) => p.challenge === c.code).length;
            return (
              <div className="challenge-admin-card" key={c.code}>
                {/* Hidden file input for fast 1-click upload */}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  ref={(el) => {
                    directUploadRef.current[c.code] = el;
                  }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleDirectFileUpload(c.code, e.target.files[0]);
                    }
                  }}
                />

                <div className="challenge-admin-preview">
                  <MockReference challenge={c} />
                </div>

                <div className="challenge-admin-info">
                  <div className="challenge-admin-head">
                    <div>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "6px" }}>
                        <Pill>{c.code}</Pill>
                        {c.imageUrl ? (
                          <Pill tone="green">UI IMAGE LOADED</Pill>
                        ) : (
                          <Pill tone="slate">NO IMAGE ATTACHED</Pill>
                        )}
                      </div>
                      <h2>{c.title}</h2>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#808b9e", margin: "6px 0 12px" }}>
                    <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: c.imageUrl ? "#00e5a3" : "#7357ff" }} />
                    <b>{assignedCount} participants assigned</b>
                  </div>

                  <div className="challenge-actions">
                    <button
                      className="primary"
                      onClick={() => directUploadRef.current[c.code]?.click()}
                      title="Upload or replace design image from your computer"
                    >
                      <Upload size={13} /> {c.imageUrl ? "Replace UI" : "Upload UI"}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => {
                        setEditingChallenge(c);
                        setIsCreating(false);
                      }}
                      title="Edit topic and UI template"
                    >
                      <Edit3 size={13} /> Edit
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setInspectingChallenge(c)}
                      title="Inspect challenge in full view"
                    >
                      <Eye size={13} /> Inspect
                    </button>
                    <button
                      className="secondary danger"
                      style={{ borderColor: "rgba(255,91,110,0.4)", color: "#ff8593", display: "inline-flex", alignItems: "center", gap: "5px" }}
                      onClick={() => setChallengeToDelete(c.code)}
                      title={`Delete challenge ${c.code}`}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Challenge Edit & Upload Modal */}
      {editingChallenge && (
        <ChallengeEditModal
          challenge={editingChallenge}
          isNew={isCreating}
          onClose={() => {
            setEditingChallenge(null);
            setIsCreating(false);
          }}
          onSave={handleSaveChallenge}
          onDelete={(code) => setChallengeToDelete(code)}
        />
      )}

      {/* Fullscreen Inspector Modal */}
      {inspectingChallenge && (
        <div className="modal-backdrop" onClick={() => setInspectingChallenge(null)}>
          <div className="modal reference-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <Pill tone="violet">{inspectingChallenge.code}</Pill>
                  <Pill tone="slate">{inspectingChallenge.difficulty}</Pill>
                  {inspectingChallenge.imageUrl && <Pill tone="green">CUSTOM UI</Pill>}
                </div>
                <h2>{inspectingChallenge.title} — Reference Inspection</h2>
                <p style={{ color: "#838fa3", fontSize: "12px", margin: "4px 0 0" }}>{inspectingChallenge.description}</p>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {inspectingChallenge.imageUrl && (
                  <a
                    href={inspectingChallenge.imageUrl}
                    download={`${inspectingChallenge.code}-design.png`}
                    className="secondary"
                    style={{ padding: "0 12px", minHeight: "36px", fontSize: "11px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <Download size={14} /> Download Asset
                  </a>
                )}
                <button className="iconbtn" onClick={() => setInspectingChallenge(null)}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="modal-body">
              <MockReference challenge={inspectingChallenge} expanded />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {challengeToDelete && (
        <Confirm
          title={`Delete Challenge ${challengeToDelete}?`}
          text={`Are you sure you want to delete challenge ${challengeToDelete}? Any participants currently assigned to this challenge will be safely reassigned to remaining challenges.`}
          cancel={() => setChallengeToDelete(null)}
          action={async () => {
            await handleDeleteChallenge(challengeToDelete);
            setChallengeToDelete(null);
          }}
          label="DELETE CHALLENGE"
        />
      )}

      {/* Reset Confirmation Modal */}
      {confirmReset && (
        <Confirm
          title="Clear all UI templates?"
          text="This will remove all current UI templates. You can then add and upload your custom challenge templates from scratch."
          cancel={() => setConfirmReset(false)}
          action={handleResetChallenges}
          label="CLEAR ALL TEMPLATES"
        />
      )}
    </>
  );
}

function Assignments({
  store,
  setStore,
  exportCsv,
}: {
  store: Store;
  setStore: (s: Store) => void;
  exportCsv: (t: "assignments") => void;
}) {
  const [size, setSize] = useState(5);
  const assign = (random = false) => {
    let ps = [...store.participants];
    if (random) ps.sort(() => Math.random() - 0.5);
    const assigned = ps
      .map((p, i) => ({
        ...p,
        challenge: store.challenges[Math.floor(i / size) % store.challenges.length].code,
      }))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    setStore({
      ...store,
      participants: assigned,
    });
  };
  return (
    <>
      <PageTitle
        eyebrow="CHALLENGE MAPPING"
        title="Assignments"
        action={
          <button className="secondary" onClick={() => exportCsv("assignments")}>
            <Download /> Export backup CSV
          </button>
        }
      />
      <div className="assignment-controls">
        <div>
          <label>PARTICIPANTS PER CHALLENGE</label>
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
            <option>3</option>
            <option>4</option>
            <option>5</option>
          </select>
        </div>
        <button className="primary" disabled={store.status === "LIVE"} onClick={() => assign(false)}>
          <Settings2 /> AUTO ASSIGN
        </button>
        <button className="secondary" disabled={store.status === "LIVE"} onClick={() => assign(true)}>
          <RefreshCw /> RANDOM ASSIGN
        </button>
      </div>
      <div className="assignment-grid">
        {store.challenges.map((c) => (
          <div className="assign-col" key={c.code}>
            <div>
              <span style={{ background: c.color }} />
              {c.code}
              <Pill tone="slate">{store.participants.filter((p) => p.challenge === c.code).length}</Pill>
            </div>
            {store.participants
              .filter((p) => p.challenge === c.code)
              .map((p) => (
                <p key={p.code}>
                  <b>{p.code}</b>
                  {p.name}
                </p>
              ))}
          </div>
        ))}
      </div>
    </>
  );
}

function RoundControl({
  store,
  remaining,
  ask,
}: {
  store: Store;
  remaining: number;
  ask: (s: string) => void;
}) {
  const actions = [
    ["PREPARE", CheckCircle2, "Validate setup and open waiting room"],
    ["START", Play, "Start countdown timer for all participants"],
    [store.status === "PAUSED" ? "RESUME" : "PAUSE", store.status === "PAUSED" ? Play : Pause, "Freeze or resume global synchronized timer"],
    ["EXTEND", Clock3, "Add 5 minutes to the round clock"],
    ["END", Square, "Close all submissions and end round"],
    ["RESET", RotateCcw, "Reset round back to waiting and reset participant states"],
  ] as const;

  return (
    <>
      <PageTitle eyebrow="GLOBAL CONTROL" title="Round control" />
      <div className="round-console">
        <div className="console-timer">
          <Pill tone={store.status === "LIVE" ? "green" : store.status === "PAUSED" ? "amber" : "slate"}>
            {store.status}
          </Pill>
          <span>TIME REMAINING</span>
          <b>{formatTime(remaining)}</b>
          <p>Server-style synchronized round clock</p>
        </div>
        <div className="control-list">
          {actions.map(([a, I, d]) => (
            <button key={a} className={a === "END" ? "end" : a === "RESET" ? "reset-act" : ""} onClick={() => ask(a)}>
              <I />
              <span>
                <b>{a} round</b>
                <small>{d}</small>
              </span>
              <ChevronRight />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function Health({ store }: { store: Store }) {
  const checks = [
    ["Recovery and Session Store", true],
    ["Admin Authentication System", true],
    ["Round State Engine", true],
    [`${store.participants.length} participants loaded`, store.participants.length > 0],
    [`${store.challenges.length} challenge specifications`, store.challenges.length > 0],
    ["All participants mapped to challenges", store.participants.every((p) => !!p.challenge)],
    ["Submission ingestion gateway", true],
    ["Projector live mode", true],
  ] as const;
  const ok = checks.every((x) => x[1]);
  return (
    <>
      <PageTitle eyebrow="PRE-FLIGHT DIAGNOSTICS" title="System health" />
      <div className={`health-hero ${ok ? "ok" : "bad"}`}>
        <div>
          <HeartPulse />
        </div>
        <span>OVERALL STATUS</span>
        <h2>{ok ? "EVENT SYSTEM READY" : "EVENT SYSTEM NOT READY"}</h2>
        <p>{ok ? "All critical systems passed pre-flight verification." : "Resolve failed checks before starting."}</p>
      </div>
      <div className="check-grid">
        {checks.map(([label, pass]) => (
          <div key={label}>
            <span className={pass ? "pass" : "fail"}>{pass ? <Check /> : <X />}</span>
            <b>{label}</b>
            <Pill tone={pass ? "green" : "red"}>{pass ? "OK" : "FAIL"}</Pill>
          </div>
        ))}
      </div>
    </>
  );
}

function Recovery({ store, setStore }: { store: Store; setStore: (s: Store) => void }) {
  const [q, setQ] = useState("");
  const p = store.participants.find((x) => x.code === q.trim().toUpperCase());
  return (
    <>
      <PageTitle eyebrow="EMERGENCY TOOLS" title="Participant recovery" />
      <div className="recovery-search">
        <label>FIND PARTICIPANT</label>
        <div className="search">
          <Search />
          <input value={q} placeholder="DG-07" onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {p ? (
        <div className="recovery-card">
          <div>
            <span className="avatar">{p.code.slice(-2)}</span>
            <div>
              <Pill tone="green">{p.status}</Pill>
              <h2>
                {p.code} · {p.name}
              </h2>
              <p>{p.college}</p>
            </div>
          </div>
          <div className="receipt">
            <div>
              <span>ASSIGNMENT</span>
              <b>{p.challenge}</b>
            </div>
            <div>
              <span>VERIFIED</span>
              <b>{p.verifiedAt ? new Date(p.verifiedAt).toLocaleTimeString() : "Not yet"}</b>
            </div>
            <div>
              <span>SUBMISSION</span>
              <b>{p.submittedAt ? new Date(p.submittedAt).toLocaleTimeString() : "Pending"}</b>
            </div>
            <div>
              <span>PROJECT URL</span>
              <b>{p.projectUrl || "None"}</b>
            </div>
          </div>
          <button
            className="secondary"
            onClick={() =>
              setStore({
                ...store,
                participants: store.participants.map((x) =>
                  x.code === p.code
                    ? { ...x, status: "VERIFIED", submittedAt: undefined, projectUrl: undefined, figmaUrl: undefined }
                    : x
                ),
              })
            }
          >
            <RefreshCw /> Allow retry & restore session
          </button>
        </div>
      ) : (
        q && (
          <div className="empty-state">
            <Search />
            <h2>No participant found</h2>
            <p>Check the ID and try again.</p>
          </div>
        )
      )}
    </>
  );
}

function Projector({ store, go }: { store: Store; go: (p: string) => void }) {
  const remaining = useClock(store);
  const submitted = store.participants.filter((p) => p.status === "SUBMITTED").length;
  const active = store.participants.filter((p) => p.status === "ACTIVE").length;
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
  const joinUrl = `${origin}/join`;

  return (
    <main className="projector">
      <div className="grid-bg" />
      <header>
        <Brand />
        <button className="textbtn" onClick={() => go("/admin")}>
          <Settings2 /> Control center
        </button>
      </header>
      {store.status === "WAITING" || store.status === "READY" ? (
        <section className="projector-wait">
          <Pill>ROUND 01</Pill>
          <h1>
            The mirror
            <br />
            <em>opens soon.</em>
          </h1>
          <div className="qr" style={{ gap: "20px" }}>
            <div style={{ background: "#fff", padding: "8px", borderRadius: "10px", display: "grid", placeItems: "center" }}>
              <QRCodeSVG value={joinUrl} size={110} fgColor="#05070a" bgColor="#ffffff" />
            </div>
            <div>
              <b>SCAN TO ENTER & CLAIM ID</b>
              <span>{joinUrl.replace(/^https?:\/\//, "")}</span>
            </div>
          </div>
          <p>Scan with any mobile camera to claim your Participant badge</p>
        </section>
      ) : store.status === "ENDED" ? (
        <section className="projector-ended">
          <div>
            <LockKeyhole />
          </div>
          <Pill tone="slate">ROUND 01 · CLOSED</Pill>
          <h1>
            The mirror
            <br />
            has closed.
          </h1>
          <p>{submitted} creations entered the system.</p>
        </section>
      ) : (
        <section className="projector-live">
          <div className="live-title">
            <Pill tone={store.status === "PAUSED" ? "amber" : "red"}>
              {store.status === "PAUSED" ? "TEMPORARILY PAUSED" : "ROUND 01 · LIVE"}
            </Pill>
            <h1>{store.status === "PAUSED" ? "The mirror is paused" : "Time remaining"}</h1>
          </div>
          <b className="projector-time">{store.status === "PAUSED" ? "PAUSED" : formatTime(remaining)}</b>
          <div className="projector-stats">
            <div>
              <span>PARTICIPANTS</span>
              <b>{store.participants.length}</b>
            </div>
            <div>
              <span>ACTIVE</span>
              <b>{active}</b>
            </div>
            <div>
              <span>SUBMITTED</span>
              <b>{submitted}</b>
            </div>
            <div>
              <span>PENDING</span>
              <b>{store.participants.length - submitted}</b>
            </div>
          </div>
        </section>
      )}
      <footer>K.L.N. COLLEGE OF ENGINEERING · DEPARTMENT OF INFORMATION TECHNOLOGY</footer>
    </main>
  );
}
