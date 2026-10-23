import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radio,
  UserCheck,
  Search,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCw,
  X,
  Check,
  ArrowRight,
  ShieldAlert,
  CreditCard,
  RefreshCw,
  Clock,
  User,
  Stethoscope,
  Sparkles,
} from "lucide-react";
import {
  lookupStudent,
  fetchReceptionDoctors,
  receptionCheckIn,
  resolveRfidCard,
} from "../../api";
import { isWebNfcSupported, startNfcScan, normalizeUid } from "../../utils/nfcReader";

const EASE_SPRING = [0.32, 0.72, 0, 1];

const QUICK_SYMPTOMS = [
  "Fever",
  "Cold & Cough",
  "Severe Headache",
  "Sports Injury",
  "Hostel Clearance",
  "Acidity",
  "Eye Irritation",
];

const pad = (n) => String(n).padStart(2, "0");

/**
 * NFC & Manual Check-in Desk Component (Phase NFC-4)
 *
 * Implements the 6 required UI states:
 * 1. Ready: Selection between Scan NFC Smart Card and Manual Roll Number
 * 2. Scanning: Visual feedback to tap physical card, with cancellation
 * 3. Resolving: Querying backend for student match with transient UID
 * 4. Matched: Student identity previewed for receptionist confirmation and doctor assignment
 * 5. Confirmed: Check-in confirmed with queue sequence token and doctor cabin
 * 6. Error: Granular error feedback for unsupported NFC, permissions, unknown card, or duplicate visits
 */
export default function NfcCheckInDesk({ flash, setPage }) {
  // 6 Primary UI States: "ready" | "scanning" | "resolving" | "matched" | "confirmed" | "error"
  const [uiState, setUiState] = useState("ready");

  // Mode: "NFC" | "MANUAL"
  const [mode, setMode] = useState("NFC");

  // Active student identity matched from backend
  const [student, setStudent] = useState(null);

  // Doctors directory & assignment
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState(null);
  const [reason, setReason] = useState("");

  // Manual roll number search input
  const [rollInput, setRollInput] = useState("");

  // Transient card UID input (wiped immediately after resolution)
  const [cardUidTransient, setCardUidTransient] = useState("");

  // Resolution & Check-in Result
  const [checkInResult, setCheckInResult] = useState(null);
  const [viaMethod, setViaMethod] = useState("RFID"); // "RFID" | "MANUAL"

  // Error details: { title, message, type: "UNSUPPORTED" | "PERMISSION" | "NOT_FOUND" | "REVOKED" | "DUPLICATE" | "SERVER" }
  const [errorDetails, setErrorDetails] = useState(null);

  // Prevent repeated submissions while check-in request is in progress
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Web NFC Scan Controller reference
  const nfcSessionRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (nfcSessionRef.current) {
        nfcSessionRef.current.stop();
        nfcSessionRef.current = null;
      }
    };
  }, []);

  // Fetch doctors on mount
  useEffect(() => {
    fetchReceptionDoctors()
      .then((d) => {
        if (Array.isArray(d)) {
          setDoctors(d);
          const firstAvail = d.find((x) => x.available)?.doctorId ?? null;
          setDoctorId(firstAvail);
        }
      })
      .catch((err) => {
        flash?.("Could not load doctor directory: " + err.message);
      });
  }, [flash]);

  // Stop active NFC scan
  const cancelNfcScan = useCallback(() => {
    if (nfcSessionRef.current) {
      nfcSessionRef.current.stop();
      nfcSessionRef.current = null;
    }
    setCardUidTransient("");
    setUiState("ready");
  }, []);

  // Resolve Card UID with Backend (State 3 -> State 4 or State 6)
  const resolveCard = useCallback(async (rawUid) => {
    const clean = normalizeUid(rawUid);
    if (!clean) return;

    // Immediately stop scanner listener
    if (nfcSessionRef.current) {
      nfcSessionRef.current.stop();
      nfcSessionRef.current = null;
    }

    setUiState("resolving");
    setErrorDetails(null);

    try {
      // Pure POST body resolution without creating a visit
      const res = await resolveRfidCard(clean);

      if (res.matched && res.student) {
        setCardUidTransient(clean); // keep transient UID strictly in memory until confirmed or cancelled
        setStudent({
          rollNumber: res.student.roll_number || res.student.rollNumber,
          name: res.student.name || res.student.full_name,
          bloodGroup: res.student.blood_group || res.student.bloodGroup,
          email: res.student.email,
          program: "B.Tech",
          allergies: "None recorded",
        });
        setViaMethod("RFID");
        setUiState("matched");
        flash?.(`Student matched: ${res.student.name} (${res.student.roll_number})`);
      } else if (res.status === "REVOKED") {
        setCardUidTransient("");
        setErrorDetails({
          title: "Revoked Smart Card",
          type: "REVOKED",
          message:
            res.message ||
            `This card is marked as ${res.card_status || "REVOKED"} and cannot be used for check-in. Please issue a replacement card.`,
        });
        setUiState("error");
      } else {
        setCardUidTransient("");
        setErrorDetails({
          title: "Unknown Smart Card",
          type: "NOT_FOUND",
          message:
            res.message ||
            "This card is not registered to any student in the university database. Please register it at the Smart Card Desk.",
        });
        setUiState("error");
      }
    } catch (err) {
      setCardUidTransient("");
      const status = err.status;
      const msg = err.detail || err.message || "Failed to resolve card identity";

      if (status === 401) {
        setErrorDetails({
          title: "Session Expired",
          type: "PERMISSION",
          message: "Receptionist session has expired. Please log in again.",
        });
      } else if (status === 403) {
        setErrorDetails({
          title: "Access Restricted",
          type: "PERMISSION",
          message: "Receptionist privileges are required to perform card check-in.",
        });
      } else {
        setErrorDetails({
          title: "Server Communication Error",
          type: "SERVER",
          message: msg,
        });
      }
      setUiState("error");
    }
  }, [flash]);

  // Trigger Web NFC Scanner (State 1 -> State 2)
  const triggerWebNfcScan = async () => {
    setErrorDetails(null);

    if (!isWebNfcSupported()) {
      setErrorDetails({
        title: "Web NFC Not Available",
        type: "UNSUPPORTED",
        message:
          "Web NFC is supported on Android devices running Chrome over HTTPS. On Windows/Desktop reception terminals, tap the card on your USB RFID reader or use Manual Roll Number.",
      });
      setUiState("error");
      return;
    }

    setUiState("scanning");

    try {
      const session = await startNfcScan({
        onReading: ({ normalizedUid }) => {
          if (isMountedRef.current) {
            resolveCard(normalizedUid);
          }
        },
        onError: (err) => {
          if (!isMountedRef.current) return;
          if (err.isPermissionDenied) {
            setErrorDetails({
              title: "NFC Permission Denied",
              type: "PERMISSION",
              message: "NFC access was blocked. Please enable NFC permissions in browser settings.",
            });
            setUiState("error");
          } else if (err.isReadingError) {
            flash?.("NFC reading error: Please hold the card steady against the reader.");
          }
        },
      });

      nfcSessionRef.current = session;
    } catch (err) {
      if (err.name === "AbortError") return;
      if (err.isPermissionDenied) {
        setErrorDetails({
          title: "NFC Permission Denied",
          type: "PERMISSION",
          message: "NFC access was blocked. Please enable NFC permissions in browser settings.",
        });
        setUiState("error");
      } else {
        setErrorDetails({
          title: "NFC Hardware Error",
          type: "UNSUPPORTED",
          message: err.message || "Could not activate NFC scanner.",
        });
        setUiState("error");
      }
    }
  };

  // Manual Roll Number Search
  const handleManualSearch = async (e) => {
    e?.preventDefault();
    const clean = rollInput.trim();
    if (!clean) return;

    setUiState("resolving");
    setErrorDetails(null);

    try {
      const s = await lookupStudent(clean);
      setStudent({
        rollNumber: s.rollNumber,
        name: s.name,
        bloodGroup: s.bloodGroup || s.blood,
        program: s.program || "B.Tech",
        allergies: s.allergies || "None recorded",
      });
      setViaMethod("MANUAL");
      setUiState("matched");
      flash?.(`Student verified: ${s.name} (${s.rollNumber})`);
    } catch (err) {
      if (err.status === 404 || String(err.message).includes("404")) {
        setErrorDetails({
          title: "Student Not Found",
          type: "NOT_FOUND",
          message: `No student with roll number '${clean}' found in university records.`,
        });
      } else {
        setErrorDetails({
          title: "Lookup Error",
          type: "SERVER",
          message: err.detail || err.message || "Failed to retrieve student profile.",
        });
      }
      setUiState("error");
    }
  };

  // Confirm Check-in & Issue Token (State 4 -> State 5 or State 6)
  const confirmCheckIn = async () => {
    if (isSubmitting || !student || !doctorId) return;

    setIsSubmitting(true);
    setUiState("resolving");
    setErrorDetails(null);

    try {
      const result = await receptionCheckIn({
        roll_number: student.rollNumber,
        doctor_id: doctorId,
        complaint: reason.trim() || "General Consultation",
        via: viaMethod,
        card_identifier: viaMethod === "RFID" && cardUidTransient ? cardUidTransient : undefined,
      });

      // Clear transient card UID immediately after successful check-in
      setCardUidTransient("");
      setCheckInResult(result);
      setUiState("confirmed");
      flash?.(`Token #${result.queueNo || result.sequence || "01"} issued for ${student.name}`);
    } catch (err) {
      // Clear transient card UID on failure so it cannot be reused
      setCardUidTransient("");
      const msg = err.detail || err.message || "Failed to complete check-in";
      const status = err.status;

      if (status === 409 || msg.toLowerCase().includes("active visit")) {
        setErrorDetails({
          title: "Duplicate Active Visit (409)",
          type: "DUPLICATE",
          message: "Student already has an active visit in progress. Duplicate check-ins are not permitted.",
        });
      } else if (status === 409 || msg.toLowerCase().includes("unavailable")) {
        setErrorDetails({
          title: "Doctor Unavailable",
          type: "SERVER",
          message: "The selected doctor is currently marked unavailable today. Please select another doctor cabin.",
        });
      } else if (status === 400 && (msg.toLowerCase().includes("card") || msg.toLowerCase().includes("smart card"))) {
        setErrorDetails({
          title: "Smart Card Inactive or Revoked",
          type: "REVOKED",
          message: msg || "This card is no longer active or authorized. Please re-verify or link a new card.",
        });
      } else {
        setErrorDetails({
          title: "Check-in Failed",
          type: "SERVER",
          message: msg,
        });
      }
      setUiState("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset to Ready State
  const resetToReady = () => {
    if (nfcSessionRef.current) {
      nfcSessionRef.current.stop();
      nfcSessionRef.current = null;
    }
    setStudent(null);
    setReason("");
    setRollInput("");
    setCardUidTransient("");
    setCheckInResult(null);
    setErrorDetails(null);
    setUiState("ready");
  };

  const selectedDoctor = doctors.find((d) => d.doctorId === doctorId);

  return (
    <div className="max-w-2xl mx-auto py-2">
      {/* ── DOUBLE-BEZEL OUTER ENCLOSURE ── */}
      <div className="bg-slate-100/70 p-2 sm:p-2.5 rounded-[2rem] border border-slate-200/90 shadow-xs">
        <div className="bg-white rounded-[calc(2rem-0.625rem)] border border-slate-200/60 p-6 sm:p-8 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)] space-y-6">

          {/* ── HEADER ── */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200/80 text-[10px] font-bold text-teal-800 uppercase tracking-widest mb-1.5">
                <Sparkles className="w-3 h-3 text-teal-600" />
                <span>Front Desk Check-in</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Student Express Check-in</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Scan physical smart card or enter roll number to assign live consultation token
              </p>
            </div>

            {/* Visual Indicator of current state */}
            <div className="hidden sm:flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  uiState === "ready"
                    ? "bg-slate-300"
                    : uiState === "scanning"
                    ? "bg-amber-500 animate-pulse"
                    : uiState === "resolving"
                    ? "bg-teal-500 animate-spin"
                    : uiState === "matched"
                    ? "bg-emerald-500"
                    : uiState === "confirmed"
                    ? "bg-emerald-600"
                    : "bg-rose-500"
                }`}
              />
              <span className="text-[11px] font-bold text-slate-600 uppercase font-mono tracking-wider">
                {uiState}
              </span>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════
              STATE 1: READY (Mode selection: NFC or Manual Roll Number)
             ══════════════════════════════════════════════════════════════ */}
          {uiState === "ready" && (
            <motion.div
              key="state-ready"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE_SPRING }}
              className="space-y-6"
            >
              {/* Segmented Mode Selector */}
              <div className="flex p-1 bg-slate-100/90 rounded-2xl border border-slate-200/60">
                <button
                  type="button"
                  onClick={() => setMode("NFC")}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    mode === "NFC"
                      ? "bg-white text-teal-900 shadow-xs ring-1 ring-slate-200/60"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Radio className="w-4 h-4 text-teal-700" />
                  <span>Scan NFC Smart Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("MANUAL")}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    mode === "MANUAL"
                      ? "bg-white text-teal-900 shadow-xs ring-1 ring-slate-200/60"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <UserCheck className="w-4 h-4 text-teal-700" />
                  <span>Manual Roll Number</span>
                </button>
              </div>

              {/* NFC Mode Console */}
              {mode === "NFC" ? (
                <div className="space-y-6 text-center py-4">
                  <div className="relative inline-flex items-center justify-center mx-auto">
                    <div className="h-24 w-24 rounded-full bg-teal-50 border-2 border-dashed border-teal-400/80 flex items-center justify-center text-teal-700 shadow-sm">
                      <CreditCard className="w-10 h-10" />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900">NFC Smart Card Reader</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                      Tap the student's physical Thapar ID card on your USB RFID scanner, or click below to activate mobile Web NFC.
                    </p>
                  </div>

                  {/* USB Wedge Reader Auto-Listen Input */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      resolveCard(cardUidTransient);
                    }}
                    className="max-w-sm mx-auto space-y-3"
                  >
                    <div className="relative">
                      <input
                        type="text"
                        value={cardUidTransient}
                        onChange={(e) => setCardUidTransient(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            resolveCard(cardUidTransient);
                          }
                        }}
                        autoFocus
                        placeholder="Tap card on USB scanner or type UID..."
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/70 text-xs font-mono uppercase text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white transition-all text-center"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={!cardUidTransient.trim()}
                        className="flex-1 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>Resolve Card</span>
                      </button>

                      {isWebNfcSupported() && (
                        <button
                          type="button"
                          onClick={triggerWebNfcScan}
                          className="px-4 py-2.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                        >
                          <Radio className="w-3.5 h-3.5 text-teal-600" />
                          <span>Start Web NFC</span>
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              ) : (
                /* Manual Roll Number Mode */
                <div className="space-y-6 py-4">
                  <div className="text-center">
                    <div className="h-20 w-20 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-700 shadow-sm mx-auto mb-3">
                      <UserCheck className="w-8 h-8" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900">Enter University Roll Number</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Lookup student profile manually to allocate an OPD consultation token.
                    </p>
                  </div>

                  <form onSubmit={handleManualSearch} className="max-w-md mx-auto space-y-3">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={rollInput}
                        onChange={(e) => setRollInput(e.target.value)}
                        placeholder="e.g. 102409981 or CS21B045"
                        autoFocus
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/70 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white transition-all"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!rollInput.trim()}
                      className="w-full py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span>Find Student Record</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              )}
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STATE 2: SCANNING (Web NFC active with radar animation)
             ══════════════════════════════════════════════════════════════ */}
          {uiState === "scanning" && (
            <motion.div
              key="state-scanning"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE_SPRING }}
              className="py-8 text-center space-y-6"
            >
              {/* Concentric Pulsing Radar */}
              <div className="relative flex items-center justify-center py-6">
                <span className="absolute animate-ping inline-flex h-32 w-32 rounded-full bg-teal-400 opacity-20" />
                <span className="absolute animate-pulse inline-flex h-24 w-24 rounded-full bg-teal-500 opacity-25" />
                <div className="relative h-20 w-20 rounded-full bg-teal-600 text-white flex items-center justify-center shadow-xl shadow-teal-600/30">
                  <Radio className="w-9 h-9 animate-pulse" />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900">Ready to Scan Card</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
                  Hold the physical student smart card against the back of this device until a confirmation chime sounds.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={cancelNfcScan}
                  className="px-6 py-2.5 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel Scan</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STATE 3: RESOLVING (Backend query in progress)
             ══════════════════════════════════════════════════════════════ */}
          {uiState === "resolving" && (
            <motion.div
              key="state-resolving"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-12 text-center space-y-4"
            >
              <div className="h-16 w-16 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center mx-auto">
                <RotateCw className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Verifying Identity</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Resolving card mapping against university records...
                </p>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STATE 4: MATCHED (Student profile verified; request confirmation)
             ══════════════════════════════════════════════════════════════ */}
          {uiState === "matched" && student && (
            <motion.div
              key="state-matched"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE_SPRING }}
              className="space-y-6"
            >
              {/* Verified Identity Banner */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-teal-50/80 border border-teal-200/80">
                <div className="flex items-center gap-2.5">
                  <div className="h-6 w-6 rounded-full bg-teal-700 text-white flex items-center justify-center shadow-xs">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-teal-950">Student Profile Verified</span>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 flex items-center gap-1 font-mono">
                  {viaMethod === "RFID" ? <Radio className="w-3 h-3" /> : <User className="w-3 h-3" />}
                  <span>via {viaMethod}</span>
                </span>
              </div>

              {/* Student Details Card */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{student.name}</h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {student.rollNumber} • {student.program || "B.Tech"}
                    </p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                    Blood: {student.bloodGroup || "—"}
                  </span>
                </div>

                <div className="border-t border-slate-200/60 pt-2.5 text-xs text-slate-600 flex justify-between">
                  <div>
                    <span className="font-semibold text-slate-700">Allergies: </span>
                    <span className={student.allergies && student.allergies !== "None recorded" ? "text-rose-600 font-medium" : "text-slate-500"}>
                      {student.allergies || "None recorded"}
                    </span>
                  </div>
                  {student.email && (
                    <span className="text-slate-400 text-[11px] font-mono">{student.email}</span>
                  )}
                </div>
              </div>

              {/* Doctor Cabin Selection */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-800 block">
                  Assign Doctor Cabin <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {doctors.map((d) => {
                    const isSelected = doctorId === d.doctorId;
                    return (
                      <button
                        key={d.doctorId}
                        type="button"
                        disabled={!d.available}
                        onClick={() => setDoctorId(d.doctorId)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          !d.available
                            ? "opacity-40 cursor-not-allowed bg-slate-50 border-slate-200"
                            : isSelected
                            ? "border-teal-600 bg-teal-50/50 ring-2 ring-teal-500/20"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-slate-900">{d.name}</p>
                          <span
                            className={`h-2 w-2 rounded-full ${
                              d.available ? "bg-emerald-500" : "bg-slate-300"
                            }`}
                          />
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{d.specialty || "General OPD"}</p>
                        <p className="text-[10px] text-slate-400 mt-1 font-mono">{d.waiting ?? 0} in queue</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Chief Complaint / Reason */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 block">
                  Chief Complaint / Symptoms
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {QUICK_SYMPTOMS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setReason(s)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                        reason === s
                          ? "bg-teal-700 text-white border-teal-700 font-semibold"
                          : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Or enter custom reason for visit..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={resetToReady}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel & Return to Scan</span>
                </button>
                <button
                  type="button"
                  disabled={!doctorId || isSubmitting}
                  onClick={confirmCheckIn}
                  className="px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      <span>Confirming & Issuing Token...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirm Check-in & Issue Token</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STATE 5: CHECK-IN CONFIRMED (Success with queue sequence)
             ══════════════════════════════════════════════════════════════ */}
          {uiState === "confirmed" && checkInResult && student && (
            <motion.div
              key="state-confirmed"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE_SPRING }}
              className="py-4 text-center space-y-6"
            >
              <div className="h-16 w-16 rounded-full bg-emerald-50 border-2 border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-mono">
                  OPD Token Issued
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-3">{student.name}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{student.rollNumber}</p>
              </div>

              <div className="p-5 rounded-2xl border border-teal-200 bg-teal-50/60 max-w-sm mx-auto space-y-3">
                <div>
                  <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider block">Queue Token Sequence</span>
                  <span className="text-4xl font-extrabold text-teal-950 font-mono">
                    #{pad(checkInResult.queueNo ?? checkInResult.queue_number ?? checkInResult.sequence ?? 1)}
                  </span>
                </div>

                <div className="border-t border-teal-200/60 pt-3 text-xs space-y-1.5 text-slate-700">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Assigned Doctor:</span>
                    <span className="font-bold text-slate-900">{selectedDoctor?.name || "Assigned Doctor"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Doctor Room:</span>
                    <span className="font-semibold text-slate-800">{selectedDoctor?.room || "General OPD"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Check-in Mode:</span>
                    <span className="font-semibold text-teal-900 font-mono">{viaMethod}</span>
                  </div>
                  {checkInResult.position != null && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Live Position:</span>
                      <span className="font-bold text-emerald-800">#{checkInResult.position} in line</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetToReady}
                  className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  Check in Next Student
                </button>
                <button
                  type="button"
                  onClick={() => setPage?.("queue")}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  View Live Queue
                </button>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STATE 6: ERROR (Granular error feedback)
             ══════════════════════════════════════════════════════════════ */}
          {uiState === "error" && errorDetails && (
            <motion.div
              key="state-error"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE_SPRING }}
              className="py-4 space-y-6"
            >
              <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm text-rose-800">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>{errorDetails.title}</span>
                </div>
                <p className="text-xs text-rose-700 leading-relaxed pl-7">
                  {errorDetails.message}
                </p>
              </div>

              {/* Suggestions based on error type */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1.5">
                <p className="font-bold text-slate-800">Suggested Action:</p>
                {errorDetails.type === "NOT_FOUND" && (
                  <p>
                    Verify the physical card UID or link the card to the student at the{" "}
                    <button
                      type="button"
                      onClick={() => setPage?.("rfid")}
                      className="text-teal-700 underline font-bold cursor-pointer"
                    >
                      Smart Card Desk
                    </button>
                    .
                  </p>
                )}
                {errorDetails.type === "REVOKED" && (
                  <p>
                    This card was marked as lost or deactivated. Issue a new replacement card at the Smart Card Desk.
                  </p>
                )}
                {errorDetails.type === "DUPLICATE" && (
                  <p>
                    The student is already registered in today's OPD queue. Open the{" "}
                    <button
                      type="button"
                      onClick={() => setPage?.("queue")}
                      className="text-teal-700 underline font-bold cursor-pointer"
                    >
                      Live Queue
                    </button>{" "}
                    to view their status.
                  </p>
                )}
                {errorDetails.type === "UNSUPPORTED" && (
                  <p>
                    Web NFC is restricted to mobile Android Chrome over HTTPS. Switch to <strong>Manual Roll Number</strong> or connect a USB RFID reader.
                  </p>
                )}
                {errorDetails.type === "PERMISSION" && (
                  <p>
                    Please grant NFC permissions in browser site settings or log in with Receptionist credentials.
                  </p>
                )}
                {errorDetails.type === "SERVER" && (
                  <p>
                    Check network connectivity and ensure the CampusCare backend server is running.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetToReady}
                  className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetToReady();
                    setMode("MANUAL");
                  }}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  Use Roll Number
                </button>
              </div>
            </motion.div>
          )}

        </div>
      </div>
    </div>
  );
}

