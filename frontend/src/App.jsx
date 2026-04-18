import { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload, Play, Activity, AlertTriangle, Users, Clock,
  MapPin, Zap, Eye, Timer, BarChart3, Video, Cpu,
  Target, TrendingUp, CheckCircle2, Circle, Loader2,
  Film, X, FileVideo, RefreshCw, Shield, WifiOff,
  ChevronDown, ChevronUp, List, Package, Layers,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE     = "http://localhost:8000";
const API_ENDPOINT = `${API_BASE}/run`;          // ← correct FastAPI route

const FEAT_KEY_MAP = {
  movement: "paths",
  speed:    "speed",
  zone:     "zone",
  alerts:   "alert",
  time:     "time",
};

// Cosmetic pipeline step advance delays (ms) — purely visual.
// Completion is ONLY driven by the backend fetch response.
const STEP_ADVANCE_MS = [2500, 5500];

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE NORMALISER
// Maps every plausible FastAPI response shape into a single internal shape.
// ─────────────────────────────────────────────────────────────────────────────

function resolveVideoUrl(data) {
  const raw =
    data?.video            ??
    data?.video_url        ??
    data?.output_video     ??
    data?.video_path       ??
    data?.processed_video  ??
    data?.output_path      ??
    data?.result_video     ??
    data?.output_video_url ??
    data?.file_url         ??
    data?.url              ??
    data?.result?.video_url    ??
    data?.result?.output_video ??
    data?.data?.video_url      ??
    data?.output?.video_url    ??
    null;

  if (!raw) return null;
  if (raw.startsWith("http") || raw.startsWith("blob:")) return raw;
  return `${API_BASE}/${raw.replace(/^\//, "")}`;
}

function resolveStats(data) {
  const src =
    data?.stats     ??
    data?.report    ??
    data?.analytics ??
    data?.summary   ??
    data            ??
    {};

  return {
    objects_detected:
      src.objects_detected  ?? src.total_objects ??
      src.object_count      ?? src.detections    ??
      src.num_objects       ?? "—",

    active_alerts:
      src.active_alerts ?? src.alerts        ??
      src.alert_count   ?? src.total_alerts  ?? "—",

    objects_in_zone:
      src.objects_in_zone ?? src.zone_count ??
      src.in_zone         ?? "—",

    avg_dwell_time:
      src.avg_dwell_time  ?? src.dwell_time  ??
      src.average_dwell   ?? src.avg_time    ?? "—",
  };
}

// Normalise the per-object rows from any array the backend might return.
// Expected shape: [{ id, time, speed, loitering, ... }]
function resolveObjects(data) {
  const arr =
    data?.objects         ??
    data?.tracked_objects ??
    data?.object_list     ??
    data?.tracks          ??
    data?.detections      ??
    data?.report?.objects ??
    data?.result?.objects ??
    [];

  if (!Array.isArray(arr)) return [];

  return arr.map((o, i) => ({
    id:        o.id         ?? o.object_id  ?? o.track_id   ?? `OBJ-${String(i + 1).padStart(3, "0")}`,
    label:     o.label      ?? o.class      ?? o.class_name ?? o.type ?? "—",
    time:      o.time       ?? o.timestamp  ?? o.first_seen ?? "—",
    speed:     o.speed      != null ? (typeof o.speed === "number" ? `${o.speed.toFixed(1)} m/s` : o.speed) : "—",
    loitering: o.loitering  ?? o.is_loitering ?? o.loiter ?? false,
    zone:      o.zone       ?? o.zone_name  ?? o.in_zone   ?? "—",
    frames:    o.frames     ?? o.frame_count ?? o.num_frames ?? "—",
    conf:      o.confidence ?? o.conf       ?? o.score     ?? null,
  }));
}

function resolveFps(data) {
  return (
    data?.fps         ??
    data?.processing_fps ??
    data?.avg_fps     ??
    data?.report?.fps ??
    null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STATIC UI DATA
// ─────────────────────────────────────────────────────────────────────────────

const FEATURES = [
  { id: "movement", label: "Movement Paths",  icon: TrendingUp,    color: "#22d3ee", accent: "rgba(34,211,238,.12)"  },
  { id: "speed",    label: "Speed Detection", icon: Zap,           color: "#fbbf24", accent: "rgba(251,191,36,.12)"  },
  { id: "zone",     label: "Zone Detection",  icon: MapPin,        color: "#a78bfa", accent: "rgba(167,139,250,.12)" },
  { id: "alerts",   label: "Event Alerts",    icon: AlertTriangle, color: "#f87171", accent: "rgba(248,113,113,.12)" },
  { id: "time",     label: "Time Tracking",   icon: Timer,         color: "#34d399", accent: "rgba(52,211,153,.12)"  },
];

const PIPELINE_STEPS = [
  { id: "detect", label: "Detection Running",  sub: "YOLOv8 inference active",  icon: Cpu       },
  { id: "track",  label: "Tracking Objects",   sub: "DeepSORT multi-object",    icon: Target    },
  { id: "report", label: "Generating Report",  sub: "Compiling analytics data", icon: BarChart3 },
];

const STAT_META = [
  { key: "objects_detected", label: "Objects Detected", icon: Users,        color: "#22d3ee", bg: "rgba(34,211,238,.08)"  },
  { key: "active_alerts",    label: "Active Alerts",    icon: AlertTriangle,color: "#f87171", bg: "rgba(248,113,113,.08)" },
  { key: "objects_in_zone",  label: "Objects in Zone",  icon: Shield,       color: "#a78bfa", bg: "rgba(167,139,250,.08)" },
  { key: "avg_dwell_time",   label: "Avg Dwell Time",   icon: Clock,        color: "#34d399", bg: "rgba(52,211,153,.08)"  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL CSS
// ─────────────────────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body { font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif; }

  @keyframes spin   { to { transform: rotate(360deg); } }
  @keyframes pulse  { 0%,100%{opacity:1;} 50%{opacity:.3;} }
  @keyframes fadeUp { from{opacity:0;transform:translateY(10px);} to{opacity:1;transform:translateY(0);} }
  @keyframes ripple { 0%{transform:scale(.8);opacity:.6;} 100%{transform:scale(2.3);opacity:0;} }
  @keyframes shake  { 0%,100%{transform:translateX(0);} 25%{transform:translateX(-6px);} 75%{transform:translateX(6px);} }
  @keyframes slideDown { from{opacity:0;transform:translateY(-8px);} to{opacity:1;transform:translateY(0);} }

  .spin      { animation: spin    1.1s linear infinite; }
  .pulse-dot { animation: pulse   1.3s ease-in-out infinite; }
  .fade-up   { animation: fadeUp  .4s ease-out both; }
  .shake     { animation: shake   .35s ease; }
  .slide-dn  { animation: slideDown .3s ease-out both; }

  ::-webkit-scrollbar       { width:4px; height:4px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:#1e293b; border-radius:4px; }

  .feat-btn                        { transition: background .15s, border-color .15s, opacity .15s; }
  .feat-btn:not(:disabled):hover   { background: rgba(34,211,238,.07) !important; }
  .start-btn                       { transition: filter .15s, transform .15s; }
  .start-btn:not(:disabled):hover  { filter: brightness(1.12); transform: translateY(-1px); }
  .drop-zone                       { transition: border-color .2s, background .2s; }
  .drop-zone.over                  { border-color:#22d3ee !important; background:rgba(34,211,238,.06) !important; }

  .obj-row:hover { background: rgba(34,211,238,.04) !important; }
  .obj-row { transition: background .12s; }

  video { display:block; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const hexToRgb = hex => {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : "255,255,255";
};

const fmtBytes = n => {
  if (n >= 1073741824) return (n/1073741824).toFixed(1)+" GB";
  if (n >= 1048576)    return (n/1048576).toFixed(1)+" MB";
  return                     (n/1024).toFixed(0)+" KB";
};

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ icon: Icon, children, pill }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:"7px", marginBottom:"12px" }}>
      <Icon size={13} color="#22d3ee" />
      <span style={{ fontSize:"10px", fontWeight:700, color:"#64748b", letterSpacing:".1em", textTransform:"uppercase" }}>
        {children}
      </span>
      {pill != null && (
        <span style={{ marginLeft:"auto", fontSize:"10px", padding:"2px 7px", borderRadius:"20px",
          background:"rgba(34,211,238,.1)", color:"#67e8f9", fontFamily:"JetBrains Mono" }}>
          {pill}
        </span>
      )}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{ borderRadius:"14px", border:"1px solid rgba(30,41,59,.9)", background:"rgba(8,12,24,.6)", ...style }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECTED OBJECTS TABLE (shown below video after analysis)
// ─────────────────────────────────────────────────────────────────────────────

const OBJ_COLS_COMPACT = ["ID","Class","Time","Speed","Loitering"];
const OBJ_COLS_FULL    = ["ID","Class","Time","Speed","Zone","Frames","Conf","Loitering"];

function ObjectsTable({ objects }) {
  const [expanded, setExpanded] = useState(false);
  const [showAll,  setShowAll]  = useState(false);

  if (!objects || objects.length === 0) return null;

  // Deduplicate by label for a class summary
  const classSummary = objects.reduce((acc, o) => {
    const k = o.label === "—" ? "Unknown" : o.label;
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const cols   = expanded ? OBJ_COLS_FULL : OBJ_COLS_COMPACT;
  const rows   = showAll ? objects : objects.slice(0, 8);
  const hasMore = objects.length > 8;

  // grid column template based on mode
  const colTemplate = expanded
    ? "1.4fr 1.2fr 1.2fr 1.1fr 1.1fr 0.9fr 0.8fr 0.85fr"
    : "1.4fr 1.2fr 1.3fr 1.2fr 1fr";

  return (
    <div className="slide-dn" style={{ marginTop:"16px" }}>
      {/* Section header */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        marginBottom:"10px",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
          <List size={14} color="#22d3ee" />
          <span style={{ fontSize:"11px", fontWeight:700, color:"#64748b",
            letterSpacing:".1em", textTransform:"uppercase" }}>
            All Detected Objects
          </span>
          <span style={{
            fontSize:"10px", padding:"2px 8px", borderRadius:"20px",
            background:"rgba(34,211,238,.1)", color:"#67e8f9", fontFamily:"JetBrains Mono",
          }}>
            {objects.length} total
          </span>
        </div>

        {/* Toggle full columns */}
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            display:"flex", alignItems:"center", gap:"5px",
            padding:"5px 11px", borderRadius:"7px", cursor:"pointer",
            border:"1px solid rgba(34,211,238,.25)",
            background: expanded ? "rgba(34,211,238,.1)" : "rgba(8,14,28,.6)",
            color: expanded ? "#67e8f9" : "#64748b",
            fontSize:"11px", fontFamily:"'Space Grotesk',sans-serif",
          }}
        >
          <Layers size={11} />
          {expanded ? "Compact view" : "Show all object info"}
          {expanded ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
        </button>
      </div>

      {/* Class summary pills */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:"5px", marginBottom:"10px" }}>
        {Object.entries(classSummary).map(([cls, cnt]) => (
          <span key={cls} style={{
            fontSize:"11px", padding:"3px 9px", borderRadius:"20px", fontWeight:500,
            background:"rgba(34,211,238,.07)", border:"1px solid rgba(34,211,238,.18)",
            color:"#67e8f9",
          }}>
            <span style={{ color:"#22d3ee", fontFamily:"JetBrains Mono" }}>{cnt}</span>
            &nbsp;{cls}
          </span>
        ))}
      </div>

      {/* Table */}
      <Card style={{ overflow:"hidden" }}>
        {/* Header */}
        <div style={{
          display:"grid", gridTemplateColumns: colTemplate,
          padding:"8px 14px", borderBottom:"1px solid rgba(30,41,59,.7)",
          background:"rgba(4,8,18,.8)",
        }}>
          {cols.map(h => (
            <span key={h} style={{
              fontSize:"9px", fontWeight:700, color:"#334155",
              letterSpacing:".09em", textTransform:"uppercase", fontFamily:"JetBrains Mono",
            }}>
              {h}
            </span>
          ))}
        </div>

        {/* Rows */}
        {rows.map((obj, i) => (
          <div key={obj.id} className="obj-row" style={{
            display:"grid", gridTemplateColumns: colTemplate,
            padding:"9px 14px", alignItems:"center",
            background: i % 2 === 0 ? "rgba(8,14,28,.45)" : "transparent",
            borderBottom: i < rows.length - 1 ? "1px solid rgba(30,41,59,.25)" : "none",
          }}>
            {/* ID */}
            <span style={{ fontSize:"11px", color:"#22d3ee", fontFamily:"JetBrains Mono", fontWeight:500 }}>
              {obj.id}
            </span>
            {/* Class/Label */}
            <span style={{
              fontSize:"11px", padding:"2px 7px", borderRadius:"4px",
              background:"rgba(167,139,250,.1)", color:"#a78bfa",
              fontFamily:"JetBrains Mono", display:"inline-block", maxWidth:"fit-content",
            }}>
              {obj.label}
            </span>
            {/* Time */}
            <span style={{ fontSize:"11px", color:"#64748b", fontFamily:"JetBrains Mono" }}>
              {obj.time}
            </span>
            {/* Speed */}
            <span style={{ fontSize:"11px", color:"#94a3b8", fontFamily:"JetBrains Mono" }}>
              {obj.speed}
            </span>

            {/* ─ Extra columns shown only in expanded mode ─ */}
            {expanded && (
              <>
                {/* Zone */}
                <span style={{ fontSize:"11px", color:"#64748b", fontFamily:"JetBrains Mono" }}>
                  {String(obj.zone)}
                </span>
                {/* Frames */}
                <span style={{ fontSize:"11px", color:"#475569", fontFamily:"JetBrains Mono" }}>
                  {String(obj.frames)}
                </span>
                {/* Confidence */}
                <span style={{ fontSize:"11px", fontFamily:"JetBrains Mono",
                  color: obj.conf != null ? "#fbbf24" : "#334155" }}>
                  {obj.conf != null ? `${(obj.conf * 100).toFixed(0)}%` : "—"}
                </span>
              </>
            )}

            {/* Loitering badge — always last */}
            <span style={{
              fontSize:"10px", padding:"2px 6px", borderRadius:"4px",
              background: obj.loitering ? "rgba(248,113,113,.15)" : "rgba(52,211,153,.1)",
              color:      obj.loitering ? "#f87171"               : "#34d399",
              fontFamily:"JetBrains Mono", fontWeight:600,
              display:"inline-block", maxWidth:"fit-content",
            }}>
              {obj.loitering ? "YES" : "NO"}
            </span>
          </div>
        ))}

        {/* Show all / collapse footer */}
        {hasMore && (
          <div style={{
            padding:"10px 14px", borderTop:"1px solid rgba(30,41,59,.5)",
            background:"rgba(4,8,18,.6)", display:"flex", alignItems:"center",
            justifyContent:"space-between",
          }}>
            <span style={{ fontSize:"11px", color:"#334155", fontFamily:"JetBrains Mono" }}>
              {showAll
                ? `Showing all ${objects.length} objects`
                : `Showing 8 of ${objects.length} — ${objects.length - 8} hidden`}
            </span>
            <button
              onClick={() => setShowAll(v => !v)}
              style={{
                display:"flex", alignItems:"center", gap:"5px",
                padding:"5px 12px", borderRadius:"7px", cursor:"pointer",
                border:"1px solid rgba(34,211,238,.28)",
                background:"rgba(34,211,238,.07)", color:"#67e8f9",
                fontSize:"11px", fontFamily:"'Space Grotesk',sans-serif",
              }}
            >
              {showAll ? <><ChevronUp size={11}/> Show less</> : <><ChevronDown size={11}/> Show all {objects.length} objects</>}
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  // ── File
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isDragging,   setIsDragging]   = useState(false);

  // ── Feature toggles
  const [selectedFeats, setSelectedFeats] = useState(new Set(["movement","speed"]));

  // ── Status machine: "idle" | "running" | "completed" | "error"
  const [status,   setStatus]   = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // ── Backend result — set exclusively when fetch resolves successfully
  const [result,     setResult]     = useState(null);
  const [videoSrc,   setVideoSrc]   = useState(null);
  const [stats,      setStats]      = useState(null);
  const [objectRows, setObjectRows] = useState([]);
  const [fpsValue,   setFpsValue]   = useState("—");
  const [rawDebug,   setRawDebug]   = useState(null); // for debugging response shape

  // ── Cosmetic visual step index (0–2, purely UI)
  const [visualStep, setVisualStep] = useState(0);

  const abortRef = useRef(null);
  const fileRef  = useRef(null);

  // ── Cosmetic pipeline animation — timer only changes visual step, NEVER sets completed ──
  useEffect(() => {
    if (status !== "running") { setVisualStep(0); return; }
    const t1 = setTimeout(() => setVisualStep(1), STEP_ADVANCE_MS[0]);
    const t2 = setTimeout(() => setVisualStep(2), STEP_ADVANCE_MS[1]);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [status]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const resetAll = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
    setResult(null);
    setVideoSrc(null);
    setStats(null);
    setObjectRows([]);
    setFpsValue("—");
    setErrorMsg("");
    setVisualStep(0);
    setRawDebug(null);
  }, []);

  const clearFile = useCallback(() => {
    resetAll();
    setUploadedFile(null);
  }, [resetAll]);

  const handleDrop = useCallback(e => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { resetAll(); setUploadedFile(f); }
  }, [resetAll]);

  const handleFileInput = useCallback(e => {
    const f = e.target.files[0];
    if (f) { resetAll(); setUploadedFile(f); }
  }, [resetAll]);

  const toggleFeat = useCallback(id => {
    setSelectedFeats(prev => {
      const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
    });
  }, []);

  // ── Core: POST to /run ────────────────────────────────────────────────────
  const startAnalysis = useCallback(async () => {
    if (!uploadedFile || selectedFeats.size === 0 || status === "running") return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setStatus("running");
    setResult(null); setVideoSrc(null); setStats(null);
    setObjectRows([]); setFpsValue("—"); setErrorMsg(""); setRawDebug(null);

    const backendKeys = [...selectedFeats].map(id => FEAT_KEY_MAP[id]).filter(Boolean);

    const form = new FormData();
    form.append("video",         uploadedFile, uploadedFile.name);
    form.append(
      "features",
      JSON.stringify({
        paths: selectedFeats.has("movement"),
        speed: selectedFeats.has("speed"),
        zone: selectedFeats.has("zone"),
        alert: selectedFeats.has("alerts"),
        time: selectedFeats.has("time")
      })
      );

    try {
      const res = await fetch(API_ENDPOINT, {
        method: "POST",
        body:   form,
        signal: abortRef.current.signal,
      });

      // ── Parse response body robustly ──
      let data = null;
      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        // Backend returned non-JSON — try parsing the text anyway
        const text = await res.text();
        try { data = JSON.parse(text); } catch { data = { raw_text: text }; }
      }

      console.log("RAW RESPONSE =", data);
      setRawDebug(data);

      if (!res.ok) {
        const detail = data?.detail ?? data?.error ?? data?.message ?? `Server error ${res.status}`;
        throw new Error(String(detail));
      }

      // ── Normalise response fields ──
      const url     = resolveVideoUrl(data);
      const st      = resolveStats(data);
      const objs    = resolveObjects(data);
      const fps     = resolveFps(data);

      console.log("API RESPONSE =", { url, st, objs, fps });

      if (!url) {
        throw new Error(
          "Backend response is missing a video URL.\n" +
          "Expected field: video_url, output_video, or output_path.\n" +
          `Got keys: ${Object.keys(data ?? {}).join(", ") || "(empty body)"}`
        );
      }

      setVideoSrc(url);
      setStats(st);
      setObjectRows(objs);
      setFpsValue(fps != null ? String(fps) : "—");
      setResult(data);

      // ↓ Status → "completed" ONLY here, driven by backend response.
      setStatus("completed");

    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("Analysis error:", err);
      setErrorMsg(err.message ?? "Analysis failed. Check backend connection.");
      setStatus("error");
    }
  }, [uploadedFile, selectedFeats, status]);

  // ── Derived flags ────────────────────────────────────────────────────────

  const canStart  = !!uploadedFile && selectedFeats.size > 0 && status !== "running";
  const isRunning = status === "running";
  const isDone    = status === "completed";
  const isError   = status === "error";

  const stepVisual = idx => {
    if (isDone)    return "done";
    if (!isRunning) return "idle";
    if (idx < visualStep) return "done";
    if (idx === Math.min(visualStep, 2)) return "active";
    return "pending";
  };

  const resolvedStats = STAT_META.map(m => ({
    ...m,
    value: isDone ? String(stats?.[m.key] ?? "—") : "—",
  }));

  const sidebarObjRows = isDone ? objectRows.slice(0, 5) : [];

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight:"100vh", display:"flex", flexDirection:"column",
      background:"linear-gradient(160deg,#020818 0%,#060d1a 60%,#030710 100%)",
      color:"#e2e8f0",
    }}>
      <style>{CSS}</style>

      {/* ══════════════════════════════════════════ HEADER ══════════════════ */}
      <header style={{
        height:"58px", display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 24px", borderBottom:"1px solid rgba(30,41,59,.8)",
        background:"rgba(4,8,18,.8)", backdropFilter:"blur(20px)",
        position:"sticky", top:0, zIndex:200, flexShrink:0,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:"11px" }}>
          <div style={{
            width:"34px", height:"34px", borderRadius:"9px",
            background:"linear-gradient(135deg,#0891b2,#2563eb)",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"0 0 14px rgba(8,145,178,.35)",
          }}>
            <Eye size={16} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize:"15px", fontWeight:700, color:"#f1f5f9", letterSpacing:"-.3px", lineHeight:1.2 }}>
              AI Video Analytics System
            </h1>
            <p style={{ fontSize:"11px", color:"#475569", lineHeight:1 }}>
              Upload · Configure · Analyze · Visualize
            </p>
          </div>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:"20px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"7px" }}>
            <div
              className={isRunning ? "pulse-dot" : ""}
              style={{
                width:"7px", height:"7px", borderRadius:"50%", flexShrink:0,
                background: isRunning ? "#f59e0b" : isDone ? "#10b981" : isError ? "#ef4444" : "#1e293b",
              }}
            />
            <span style={{ fontSize:"11px", color:"#475569", fontFamily:"JetBrains Mono", letterSpacing:".06em" }}>
              {isRunning ? "PROCESSING" : isDone ? "COMPLETE" : isError ? "ERROR" : "STANDBY"}
            </span>
          </div>
          <div style={{ display:"flex", gap:"5px" }}>
            {["#ef4444","#f59e0b","#10b981"].map((c,i) => (
              <div key={i} style={{ width:"9px", height:"9px", borderRadius:"50%", background:c, opacity:.5 }} />
            ))}
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════ 3-COL GRID ══════════════ */}
      <div style={{
        flex:1, display:"grid",
        gridTemplateColumns:"272px 1fr 292px",
        overflow:"hidden",
      }}>

        {/* ════════════════════════════════ LEFT PANEL ════════════════════ */}
        <div style={{
          borderRight:"1px solid rgba(30,41,59,.7)",
          padding:"20px 15px", overflowY:"auto",
          display:"flex", flexDirection:"column", gap:"22px",
        }}>

          {/* Video Upload */}
          <div>
            <SectionLabel icon={FileVideo}>Video Input</SectionLabel>
            {!uploadedFile ? (
              <div
                className={`drop-zone${isDragging ? " over" : ""}`}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onClick={() => fileRef.current?.click()}
                style={{
                  border:"2px dashed #1e293b", borderRadius:"13px",
                  padding:"30px 16px", textAlign:"center", cursor:"pointer",
                  background:"rgba(8,14,28,.5)",
                }}
              >
                <div style={{
                  width:"48px", height:"48px", borderRadius:"12px", margin:"0 auto 13px",
                  background:"rgba(34,211,238,.07)", border:"1px solid rgba(34,211,238,.18)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <Upload size={21} color="#22d3ee" />
                </div>
                <p style={{ fontSize:"13px", fontWeight:500, color:"#94a3b8", marginBottom:"4px" }}>
                  Drop video here
                </p>
                <p style={{ fontSize:"11px", color:"#334155" }}>MP4, MOV, AVI</p>
              </div>
            ) : (
              <div style={{
                borderRadius:"12px", border:"1px solid rgba(34,211,238,.25)",
                background:"rgba(34,211,238,.05)", padding:"11px 12px",
                display:"flex", alignItems:"center", gap:"10px",
              }}>
                <div style={{
                  width:"38px", height:"38px", borderRadius:"9px", flexShrink:0,
                  background:"rgba(34,211,238,.1)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <Film size={17} color="#22d3ee" />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{
                    fontSize:"12px", fontWeight:600, color:"#e2e8f0",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginBottom:"2px",
                  }}>
                    {uploadedFile.name}
                  </p>
                  <p style={{ fontSize:"11px", color:"#475569", fontFamily:"JetBrains Mono" }}>
                    {fmtBytes(uploadedFile.size)} · Ready
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); clearFile(); }}
                  disabled={isRunning}
                  style={{
                    background:"none", border:"none", padding:"3px", display:"flex",
                    cursor: isRunning ? "not-allowed" : "pointer",
                    color:"#475569", opacity: isRunning ? .3 : 1,
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="video/*" onChange={handleFileInput} style={{ display:"none" }} />
          </div>

          {/* Feature Checkboxes */}
          <div>
            <SectionLabel icon={Activity}>Analytics Features</SectionLabel>
            <div style={{ display:"flex", flexDirection:"column", gap:"5px" }}>
              {FEATURES.map(f => {
                const checked = selectedFeats.has(f.id);
                return (
                  <button key={f.id} className="feat-btn"
                    onClick={() => !isRunning && toggleFeat(f.id)}
                    disabled={isRunning}
                    style={{
                      display:"flex", alignItems:"center", gap:"10px",
                      padding:"9px 11px", borderRadius:"10px",
                      cursor: isRunning ? "not-allowed" : "pointer",
                      border:`1px solid ${checked ? `rgba(${hexToRgb(f.color)},.38)` : "rgba(30,41,59,.7)"}`,
                      background: checked ? f.accent : "rgba(8,14,28,.4)",
                      width:"100%", textAlign:"left",
                      opacity: isRunning ? .6 : 1,
                    }}
                  >
                    <div style={{
                      width:"17px", height:"17px", borderRadius:"4px", flexShrink:0,
                      border:`2px solid ${checked ? f.color : "#1e293b"}`,
                      background: checked ? f.color : "transparent",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      transition:"all .15s",
                    }}>
                      {checked && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5L3.2 5.8L8 1" stroke="#000" strokeWidth="1.7"
                            strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <f.icon size={14} color={checked ? f.color : "#475569"} />
                    <span style={{
                      fontSize:"13px", fontWeight: checked ? 500 : 400,
                      color: checked ? "#f1f5f9" : "#64748b",
                      transition:"color .15s", flex:1,
                    }}>
                      {f.label}
                    </span>
                    <span style={{
                      fontSize:"9px", fontFamily:"JetBrains Mono",
                      color: checked ? `rgba(${hexToRgb(f.color)},.55)` : "#1e293b",
                    }}>
                      {FEAT_KEY_MAP[f.id]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payload summary */}
          {selectedFeats.size > 0 && (
            <Card style={{ padding:"12px" }}>
              <p style={{
                fontSize:"10px", color:"#475569", fontWeight:700,
                letterSpacing:".08em", textTransform:"uppercase", marginBottom:"8px",
              }}>
                Payload · {selectedFeats.size}/{FEATURES.length} modules
              </p>
              <div style={{ display:"flex", flexWrap:"wrap", gap:"4px" }}>
                {[...selectedFeats].map(id => {
                  const f = FEATURES.find(x => x.id === id);
                  return (
                    <span key={id} style={{
                      fontSize:"11px", padding:"3px 8px", borderRadius:"20px", fontWeight:500,
                      background:f.accent, border:`1px solid rgba(${hexToRgb(f.color)},.28)`, color:f.color,
                    }}>
                      {FEAT_KEY_MAP[id]}
                    </span>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Start button */}
          <button
            className="start-btn"
            onClick={canStart ? startAnalysis : undefined}
            disabled={!canStart}
            style={{
              padding:"13px", borderRadius:"11px", border:"none",
              background: !canStart
                ? "rgba(30,41,59,.4)"
                : "linear-gradient(135deg,#0891b2 0%,#1d4ed8 100%)",
              color: !canStart ? "#334155" : "white",
              fontSize:"14px", fontWeight:700,
              cursor: canStart ? "pointer" : "not-allowed",
              display:"flex", alignItems:"center", justifyContent:"center", gap:"8px",
              fontFamily:"'Space Grotesk',sans-serif",
              boxShadow: canStart ? "0 4px 20px rgba(8,145,178,.22)" : "none",
            }}
          >
            {isRunning
              ? <><Loader2 size={16} className="spin" /> Analyzing…</>
              : <><Play size={15} /> Start Analysis</>}
          </button>

          {/* Error */}
          {isError && (
            <div className="shake fade-up" style={{
              padding:"12px", borderRadius:"10px",
              border:"1px solid rgba(239,68,68,.35)",
              background:"rgba(239,68,68,.07)",
              display:"flex", alignItems:"flex-start", gap:"9px",
            }}>
              <WifiOff size={14} color="#f87171" style={{ flexShrink:0, marginTop:"1px" }} />
              <div style={{ flex:1 }}>
                <p style={{ fontSize:"12px", fontWeight:600, color:"#f87171", marginBottom:"3px" }}>
                  Analysis failed
                </p>
                <p style={{ fontSize:"11px", color:"#64748b", lineHeight:1.45, whiteSpace:"pre-wrap" }}>
                  {errorMsg}
                </p>
              </div>
              <button onClick={resetAll} style={{
                background:"none", border:"none", cursor:"pointer",
                color:"#475569", flexShrink:0, padding:"2px", display:"flex",
              }}>
                <X size={13} />
              </button>
            </div>
          )}
        </div>

        {/* ════════════════════════════════ CENTER ════════════════════════ */}
        <div style={{ padding:"20px", overflowY:"auto", display:"flex", flexDirection:"column", gap:"0" }}>

          {/* ── Output card ── */}
          <Card style={{ display:"flex", flexDirection:"column", overflow:"hidden" }}>
            {/* Card top bar */}
            <div style={{
              padding:"13px 18px", borderBottom:"1px solid rgba(30,41,59,.6)",
              background:"rgba(4,8,18,.7)", flexShrink:0,
              display:"flex", alignItems:"center", justifyContent:"space-between",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:"9px" }}>
                <Video size={15} color="#22d3ee" />
                <span style={{ fontSize:"13px", fontWeight:600, color:"#94a3b8" }}>Analysis Output</span>
                {isDone && (
                  <span style={{
                    fontSize:"10px", padding:"2px 7px", borderRadius:"4px",
                    background:"rgba(16,185,129,.12)", color:"#6ee7b7", fontFamily:"JetBrains Mono",
                  }}>
                    AI PROCESSED
                  </span>
                )}
              </div>
              {(isDone || isError) && (
                <button onClick={resetAll} style={{
                  display:"flex", alignItems:"center", gap:"5px", padding:"5px 10px",
                  borderRadius:"7px", border:"1px solid rgba(30,41,59,.7)",
                  background:"rgba(8,14,28,.6)", color:"#64748b", fontSize:"11px",
                  cursor:"pointer", fontFamily:"'Space Grotesk',sans-serif",
                }}>
                  <RefreshCw size={11} /> New analysis
                </button>
              )}
            </div>

            {/* Body */}
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"center",
              padding: isDone ? "20px 24px 0" : "40px 24px",
              minHeight: isDone ? "auto" : "400px",
            }}>

              {/* ── IDLE ── */}
              {status === "idle" && (
                <div style={{ textAlign:"center", opacity:.38 }}>
                  <Video size={52} color="#1e293b" style={{ marginBottom:"14px" }} />
                  <p style={{ fontSize:"16px", fontWeight:500, color:"#334155", marginBottom:"6px" }}>
                    No analysis running
                  </p>
                  <p style={{ fontSize:"12px", color:"#1e293b" }}>
                    {uploadedFile ? "Select features and press Start Analysis" : "Upload a video to get started"}
                  </p>
                </div>
              )}

              {/* ── RUNNING ── */}
              {isRunning && (
                <div className="fade-up" style={{ width:"100%", maxWidth:"500px" }}>
                  <div style={{ textAlign:"center", marginBottom:"36px" }}>
                    <div style={{ position:"relative", width:"84px", height:"84px", margin:"0 auto 18px" }}>
                      <div style={{
                        position:"absolute", inset:0, borderRadius:"50%",
                        border:"2px solid rgba(34,211,238,.18)",
                        animation:"ripple 2.2s ease-out infinite",
                      }} />
                      <div style={{
                        position:"absolute", inset:0, borderRadius:"50%",
                        border:"2px solid rgba(34,211,238,.12)",
                        animation:"ripple 2.2s ease-out infinite .85s",
                      }} />
                      <div style={{
                        position:"absolute", inset:"8px", borderRadius:"50%",
                        border:"2.5px solid rgba(34,211,238,.12)",
                        borderTop:"2.5px solid #22d3ee",
                        animation:"spin 1s linear infinite",
                      }} />
                      <div style={{
                        position:"absolute", inset:"19px", borderRadius:"50%",
                        border:"2px solid rgba(8,145,178,.15)",
                        borderRight:"2px solid #0891b2",
                        animation:"spin .75s linear infinite reverse",
                      }} />
                    </div>
                    <h2 style={{ fontSize:"22px", fontWeight:700, color:"#f1f5f9", letterSpacing:"-.5px", marginBottom:"5px" }}>
                      Analyzing…
                    </h2>
                    <p style={{ fontSize:"13px", color:"#64748b" }}>
                      Waiting for backend · {selectedFeats.size} module{selectedFeats.size !== 1 ? "s" : ""} queued
                    </p>
                  </div>

                  <div style={{ display:"flex", flexDirection:"column", gap:"9px" }}>
                    {PIPELINE_STEPS.map((step, idx) => {
                      const sv = stepVisual(idx);
                      return (
                        <div key={step.id} className="fade-up" style={{
                          animationDelay:`${idx * .08}s`,
                          display:"flex", alignItems:"center", gap:"13px",
                          padding:"14px 16px", borderRadius:"12px", transition:"all .45s ease",
                          border:`1px solid ${sv === "done" ? "rgba(16,185,129,.28)" : sv === "active" ? "rgba(34,211,238,.22)" : "rgba(30,41,59,.5)"}`,
                          background: sv === "done" ? "rgba(16,185,129,.06)" : sv === "active" ? "rgba(34,211,238,.05)" : "rgba(8,14,28,.35)",
                        }}>
                          <div style={{ flexShrink:0 }}>
                            {sv === "done" ? <CheckCircle2 size={22} color="#10b981" />
                              : sv === "active" ? (
                                <div style={{
                                  width:"22px", height:"22px", borderRadius:"50%",
                                  border:"2px solid rgba(34,211,238,.28)", borderTop:"2px solid #22d3ee",
                                  animation:"spin 1s linear infinite",
                                }} />
                              ) : <Circle size={22} color="#1e293b" />}
                          </div>
                          <step.icon size={15} color={sv === "done" ? "#10b981" : sv === "active" ? "#22d3ee" : "#1e293b"} />
                          <div style={{ flex:1 }}>
                            <p style={{
                              fontSize:"13px", fontWeight:500, marginBottom:"2px",
                              color: sv === "done" ? "#6ee7b7" : sv === "active" ? "#67e8f9" : "#334155",
                            }}>
                              {step.label}
                            </p>
                            <p style={{ fontSize:"11px", color:"#334155", fontFamily:"JetBrains Mono" }}>
                              {step.sub}
                            </p>
                          </div>
                          {sv === "active" && (
                            <span className="pulse-dot" style={{
                              fontSize:"10px", padding:"3px 8px", borderRadius:"20px",
                              background:"rgba(34,211,238,.14)", color:"#67e8f9", fontFamily:"JetBrains Mono",
                            }}>ACTIVE</span>
                          )}
                          {sv === "done" && (
                            <span style={{
                              fontSize:"10px", padding:"3px 8px", borderRadius:"20px",
                              background:"rgba(16,185,129,.12)", color:"#6ee7b7", fontFamily:"JetBrains Mono",
                            }}>DONE</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── COMPLETED — real video from backend ── */}
              {isDone && (
                <div className="fade-up" style={{ width:"100%" }}>
                  {/* Success banner */}
                  <div style={{
                    display:"flex", alignItems:"center", flexWrap:"wrap", gap:"8px",
                    marginBottom:"14px", padding:"9px 14px", borderRadius:"10px",
                    background:"rgba(16,185,129,.08)", border:"1px solid rgba(16,185,129,.25)",
                  }}>
                    <CheckCircle2 size={15} color="#10b981" />
                    <span style={{ fontSize:"13px", fontWeight:600, color:"#6ee7b7" }}>
                      Backend analysis complete
                    </span>
                    <div style={{ marginLeft:"auto", display:"flex", gap:"5px", flexWrap:"wrap" }}>
                      {[...selectedFeats].map(id => {
                        const f = FEATURES.find(x => x.id === id);
                        return (
                          <span key={id} style={{
                            fontSize:"10px", padding:"2px 7px", borderRadius:"20px",
                            background:f.accent, color:f.color, fontWeight:500,
                          }}>
                            {FEAT_KEY_MAP[id]}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Video player — URL from backend */}
                  <div style={{
                    position:"relative", borderRadius:"12px", overflow:"hidden",
                    border:"1px solid rgba(30,41,59,.8)", background:"#000",
                    boxShadow:"0 8px 32px rgba(0,0,0,.5)",
                  }}>
                    <div style={{
                      position:"absolute", top:"10px", left:"10px", zIndex:10,
                      display:"flex", gap:"5px", pointerEvents:"none",
                    }}>
                      <span style={{
                        fontSize:"10px", padding:"3px 8px", borderRadius:"4px",
                        background:"rgba(239,68,68,.82)", color:"white",
                        fontFamily:"JetBrains Mono", fontWeight:600,
                      }}>● REC</span>
                      <span style={{
                        fontSize:"10px", padding:"3px 8px", borderRadius:"4px",
                        background:"rgba(0,0,0,.6)", color:"#67e8f9", fontFamily:"JetBrains Mono",
                      }}>CAM-01</span>
                    </div>
                    {stats?.objects_detected && stats.objects_detected !== "—" && (
                      <div style={{
                        position:"absolute", top:"10px", right:"10px", zIndex:10, pointerEvents:"none",
                      }}>
                        <span style={{
                          fontSize:"10px", padding:"3px 8px", borderRadius:"4px",
                          background:"rgba(0,0,0,.6)", color:"#34d399", fontFamily:"JetBrains Mono",
                        }}>
                          {stats.objects_detected} OBJ
                        </span>
                      </div>
                    )}
                    <video
                      key={videoSrc}
                      src={videoSrc}
                      controls
                      style={{ width:"100%", maxHeight:"380px", borderRadius:"12px" }}
                    />
                  </div>
                </div>
              )}

              {/* ── ERROR ── */}
              {isError && (
                <div className="fade-up" style={{ textAlign:"center", maxWidth:"400px" }}>
                  <WifiOff size={46} color="#1e293b" style={{ marginBottom:"14px" }} />
                  <p style={{ fontSize:"16px", fontWeight:600, color:"#f87171", marginBottom:"8px" }}>
                    Connection failed
                  </p>
                  <p style={{
                    fontSize:"12px", color:"#475569", lineHeight:1.6,
                    marginBottom:"16px", whiteSpace:"pre-wrap",
                  }}>
                    {errorMsg}
                  </p>
                  <button onClick={resetAll} style={{
                    padding:"9px 20px", borderRadius:"9px", cursor:"pointer",
                    border:"1px solid rgba(248,113,113,.3)",
                    background:"rgba(248,113,113,.07)", color:"#f87171",
                    fontSize:"13px", fontFamily:"'Space Grotesk',sans-serif",
                  }}>
                    Try again
                  </button>
                </div>
              )}
            </div>

            {/* ── All Objects Table — rendered inside the card, below video ── */}
            {isDone && objectRows.length > 0 && (
              <div style={{ padding:"0 24px 24px" }}>
                <ObjectsTable objects={objectRows} />
              </div>
            )}
          </Card>
        </div>

        {/* ════════════════════════════════ RIGHT SIDEBAR ═════════════════ */}
        <div style={{
          borderLeft:"1px solid rgba(30,41,59,.7)",
          padding:"20px 15px", overflowY:"auto",
          display:"flex", flexDirection:"column", gap:"22px",
        }}>

          {/* Stats */}
          <div>
            <SectionLabel icon={BarChart3}>Analytics Summary</SectionLabel>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
              {resolvedStats.map((s, i) => (
                <div key={i} style={{
                  padding:"13px 11px", borderRadius:"12px",
                  border:`1px solid ${isDone ? `rgba(${hexToRgb(s.color)},.22)` : "rgba(30,41,59,.5)"}`,
                  background: isDone ? s.bg : "rgba(8,14,28,.28)",
                  opacity: isDone ? 1 : .32,
                  transition:"all .5s ease",
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"5px", marginBottom:"9px" }}>
                    <s.icon size={12} color={isDone ? s.color : "#1e293b"} />
                    <span style={{ fontSize:"10px", color:"#475569", fontWeight:600, lineHeight:1 }}>
                      {s.label}
                    </span>
                  </div>
                  <p style={{
                    fontSize:"22px", fontWeight:700, letterSpacing:"-.5px",
                    fontFamily:"JetBrains Mono",
                    color: isDone ? s.color : "#1e293b",
                    transition:"color .5s",
                  }}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Object Tracking — compact top-5 */}
          <div>
            <SectionLabel icon={Target} pill={isDone ? `${objectRows.length} total` : undefined}>
              Object Tracking
            </SectionLabel>

            <Card style={{ overflow:"hidden", opacity: isDone ? 1 : .25, transition:"opacity .5s" }}>
              <div style={{
                display:"grid", gridTemplateColumns:"1.6fr 1.5fr 1.4fr 40px",
                padding:"8px 12px", borderBottom:"1px solid rgba(30,41,59,.6)",
                background:"rgba(4,8,18,.7)",
              }}>
                {["OBJ ID","TIME","SPEED","LOI"].map((h,i) => (
                  <span key={i} style={{
                    fontSize:"9px", fontWeight:700, color:"#334155",
                    letterSpacing:".09em", textTransform:"uppercase", fontFamily:"JetBrains Mono",
                  }}>
                    {h}
                  </span>
                ))}
              </div>

              {sidebarObjRows.length > 0 ? sidebarObjRows.map((row, i) => (
                <div key={row.id ?? i} style={{
                  display:"grid", gridTemplateColumns:"1.6fr 1.5fr 1.4fr 40px",
                  padding:"9px 12px", alignItems:"center",
                  background: i % 2 === 0 ? "rgba(8,14,28,.4)" : "transparent",
                  borderBottom: i < sidebarObjRows.length - 1 ? "1px solid rgba(30,41,59,.25)" : "none",
                }}>
                  <span style={{ fontSize:"11px", color:"#22d3ee", fontFamily:"JetBrains Mono", fontWeight:500 }}>
                    {row.id}
                  </span>
                  <span style={{ fontSize:"11px", color:"#64748b", fontFamily:"JetBrains Mono" }}>
                    {row.time}
                  </span>
                  <span style={{ fontSize:"11px", color:"#94a3b8", fontFamily:"JetBrains Mono" }}>
                    {row.speed}
                  </span>
                  <span style={{
                    fontSize:"10px", padding:"2px 5px", borderRadius:"4px", textAlign:"center",
                    background: row.loitering ? "rgba(248,113,113,.15)" : "rgba(52,211,153,.1)",
                    color:      row.loitering ? "#f87171"               : "#34d399",
                    fontFamily:"JetBrains Mono", fontWeight:600,
                  }}>
                    {row.loitering ? "YES" : "NO"}
                  </span>
                </div>
              )) : (
                <div style={{ padding:"20px 12px", textAlign:"center" }}>
                  <p style={{ fontSize:"12px", color:"#1e293b", fontFamily:"JetBrains Mono" }}>
                    {isDone ? "No object data returned" : "Awaiting backend…"}
                  </p>
                </div>
              )}

              {isDone && objectRows.length > 5 && (
                <div style={{
                  padding:"8px 12px", borderTop:"1px solid rgba(30,41,59,.4)",
                  background:"rgba(4,8,18,.5)", textAlign:"center",
                }}>
                  <span style={{ fontSize:"10px", color:"#334155", fontFamily:"JetBrains Mono" }}>
                    +{objectRows.length - 5} more · see full table below video
                  </span>
                </div>
              )}
            </Card>
          </div>

          {/* System info */}
          <div style={{
            padding:"12px", borderRadius:"10px",
            border:"1px solid rgba(30,41,59,.5)", background:"rgba(8,14,28,.4)",
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:"7px", marginBottom:"8px" }}>
              <Cpu size={12} color="#475569" />
              <span style={{ fontSize:"10px", color:"#334155", fontWeight:700, letterSpacing:".08em", textTransform:"uppercase" }}>
                System
              </span>
            </div>
            {[
              ["Endpoint", `POST /run`],
              ["Model",    "YOLOv8x-seg"],
              ["Tracker",  "DeepSORT v4"],
              ["Backend",  "GPU · CUDA 12"],
              ["FPS",      fpsValue],
            ].map(([k, v]) => (
              <div key={k} style={{
                display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"4px 0", borderBottom:"1px solid rgba(30,41,59,.28)",
              }}>
                <span style={{ fontSize:"11px", color:"#475569", flexShrink:0 }}>{k}</span>
                <span style={{
                  fontSize:"11px", color:"#64748b", fontFamily:"JetBrains Mono",
                  maxWidth:"155px", overflow:"hidden", textOverflow:"ellipsis",
                  whiteSpace:"nowrap", textAlign:"right",
                }}>
                  {v}
                </span>
              </div>
            ))}
          </div>

          {/* Raw debug accordion — helpful during integration */}
          {rawDebug && (
            <details style={{ cursor:"pointer" }}>
              <summary style={{
                fontSize:"10px", color:"#334155", fontFamily:"JetBrains Mono",
                letterSpacing:".07em", textTransform:"uppercase", userSelect:"none",
                padding:"6px 0",
              }}>
                Raw response (debug)
              </summary>
              <pre style={{
                marginTop:"6px", padding:"10px", borderRadius:"8px",
                background:"rgba(4,8,18,.8)", border:"1px solid rgba(30,41,59,.6)",
                fontSize:"10px", color:"#475569", fontFamily:"JetBrains Mono",
                overflow:"auto", maxHeight:"200px", whiteSpace:"pre-wrap", wordBreak:"break-all",
              }}>
                {JSON.stringify(rawDebug, null, 2)}
              </pre>
            </details>
          )}

        </div>
      </div>
    </div>
  );
}