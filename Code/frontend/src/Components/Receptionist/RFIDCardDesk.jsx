import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard,
  Radio,
  Search,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCw,
  Trash2,
  History,
  Smartphone,
  ShieldCheck,
  UserCheck,
  Check,
  X,
  RefreshCw,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import {
  lookupStudent,
  fetchStudentRfidCard,
  enrollRfidCard,
  revokeRfidCard,
  lookupRfidCard,
  resolveRfidCard,
  registerRfidCard,
  revokeRfidCardById,
  fetchStudentCards,
} from "../../api";
import {
  isWebNfcSupported,
  getNfcEnvironmentStatus,
  startNfcScan as startGlobalNfcScan,
  normalizeUid,
  playNfcBeep,
  triggerNfcHaptic,
} from "../../utils/nfcReader";

export default function RFIDCardDesk({ flash }) {
  const [rollNumber, setRollNumber] = useState("");
  const [cardUid, setCardUid] = useState("");
  const [student, setStudent] = useState(null);
  const [studentCardData, setStudentCardData] = useState(null);
  const [loadingStudent, setLoadingStudent] = useState(false);
  const [studentError, setStudentError] = useState(null);

  // Card check/enroll state
  const [submitting, setSubmitting] = useState(false);
  const [conflictError, setConflictError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Web NFC State
  const [nfcSupported, setNfcSupported] = useState(false);
  const [scanningNfc, setScanningNfc] = useState(false);
  const [nfcStatusText, setNfcStatusText] = useState("");
  const [envStatus, setEnvStatus] = useState(() => getNfcEnvironmentStatus());
  const nfcSessionRef = useRef(null);

  // Revocation modal state
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeReason, setRevokeReason] = useState("DEACTIVATED");
  const [revoking, setRevoking] = useState(false);

  // Card Quick Lookup state
  const [quickSearchUid, setQuickSearchUid] = useState("");
  const [quickLookupResult, setQuickLookupResult] = useState(null);
  const [quickLookupLoading, setQuickLookupLoading] = useState(false);
  const [quickLookupError, setQuickLookupError] = useState(null);

  // Check Web NFC support and pickup pending scanned UID on mount
  useEffect(() => {
    setNfcSupported(isWebNfcSupported());
    setEnvStatus(getNfcEnvironmentStatus());

    const pendingUid = sessionStorage.getItem("pending_enroll_uid");
    if (pendingUid) {
      setCardUid(pendingUid);
      sessionStorage.removeItem("pending_enroll_uid");
      flash?.(`Pre-filled scanned card UID: ${pendingUid}`);
    }

    return () => {
      if (nfcSessionRef.current) {
        nfcSessionRef.current.stop();
        nfcSessionRef.current = null;
      }
    };
  }, [flash]);

  // Student lookup handler
  const handleLookupStudent = useCallback(async (targetRoll) => {
    const cleanRoll = (targetRoll || rollNumber).trim();
    if (!cleanRoll) {
      setStudent(null);
      setStudentCardData(null);
      setStudentError(null);
      return;
    }

    setLoadingStudent(true);
    setStudentError(null);
    setConflictError(null);
    setSuccessMessage(null);

    try {
      // Fetch both basic student info and card mapping history
      const [stInfo, cardInfo] = await Promise.allSettled([
        lookupStudent(cleanRoll),
        fetchStudentRfidCard(cleanRoll),
      ]);

      if (stInfo.status === "fulfilled") {
        setStudent(stInfo.value);
      } else {
        setStudent(null);
        setStudentError(stInfo.reason?.message || "Student record not found in university directory.");
      }

      if (cardInfo.status === "fulfilled") {
        setStudentCardData(cardInfo.value);
      } else {
        setStudentCardData(null);
      }
    } catch (err) {
      setStudentError(err.message || "Failed to query student record.");
    } finally {
      setLoadingStudent(false);
    }
  }, [rollNumber]);

  // Debounced auto-lookup on typing roll number (6+ characters)
  useEffect(() => {
    const trimmed = rollNumber.trim();
    if (trimmed.length >= 6) {
      const timer = setTimeout(() => {
        handleLookupStudent(trimmed);
      }, 400);
      return () => clearTimeout(timer);
    } else {
      setStudent(null);
      setStudentCardData(null);
      setStudentError(null);
    }
  }, [rollNumber, handleLookupStudent]);

  // Web NFC Reader Trigger
  const startNfcScan = async () => {
    if (!isWebNfcSupported()) {
      const env = getNfcEnvironmentStatus();
      flash?.(env.message || "Web NFC is not supported in this browser environment.");
      return;
    }

    try {
      setScanningNfc(true);
      setNfcStatusText("Hold student ID card against the back of your NFC phone...");
      playNfcBeep("arm");

      const session = await startGlobalNfcScan({
        onReading: ({ normalizedUid }) => {
          if (normalizedUid) {
            setCardUid(normalizedUid);
            setScanningNfc(false);
            setNfcStatusText("");
            playNfcBeep("success");
            triggerNfcHaptic("success");
            flash?.(`Card UID Captured: ${normalizedUid}`);
          }
        },
        onError: (err) => {
          setScanningNfc(false);
          setNfcStatusText("");
          flash?.(`NFC reading failed: ${err.message}`);
        },
      });

      nfcSessionRef.current = session;
    } catch (err) {
      setScanningNfc(false);
      setNfcStatusText("");
      flash?.(`NFC activation failed: ${err.message}`);
    }
  };

  const cancelNfcScan = () => {
    if (nfcSessionRef.current) {
      nfcSessionRef.current.stop();
      nfcSessionRef.current = null;
    }
    setScanningNfc(false);
    setNfcStatusText("");
  };

  // Card Enrollment / Linking
  const handleEnrollCard = async (e) => {
    e?.preventDefault();
    const cleanRoll = rollNumber.trim();
    const cleanUid = normalizeUid(cardUid);

    if (!cleanRoll) {
      setConflictError("Please provide student roll number.");
      return;
    }
    if (!cleanUid) {
      setConflictError("Please provide or scan an NFC/RFID card UID.");
      return;
    }

    setSubmitting(true);
    setConflictError(null);
    setSuccessMessage(null);

    try {
      const res = await registerRfidCard(cleanRoll, cleanUid);
      const isReplaced = studentCardData?.activeCard && studentCardData.activeCard.cardUid !== cleanUid;
      const msg = isReplaced
        ? `Card ${cleanUid} successfully issued! Previous card ${studentCardData.activeCard.cardUid} was retired.`
        : `Card ${cleanUid} successfully mapped to student ${cleanRoll}.`;

      setSuccessMessage(msg);
      flash?.(msg);
      setCardUid("");
      // Refresh student card data
      await handleLookupStudent(cleanRoll);
    } catch (err) {
      const errMsg = err.detail || err.message || "Failed to enroll RFID card.";
      setConflictError(errMsg);
      flash?.(`Enrollment failed: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Revocation Handler
  const handleConfirmRevoke = async () => {
    if (!student?.rollNumber) return;
    setRevoking(true);
    try {
      const cardId = activeCard?.rfidCardId || activeCard?.card_id || activeCard?.cardId;
      if (cardId) {
        await revokeRfidCardById(cardId, revokeReason);
      } else {
        await revokeRfidCard({
          roll_number: student.rollNumber,
          reason: revokeReason,
        });
      }
      const msg = `Active card revoked (${revokeReason}).`;
      flash?.(msg);
      setSuccessMessage(msg);
      setShowRevokeModal(false);
      await handleLookupStudent(student.rollNumber);
    } catch (err) {
      flash?.(`Revocation failed: ${err.message}`);
    } finally {
      setRevoking(false);
    }
  };

  // Quick Card Lookup (Find who owns a card)
  const handleQuickLookup = async (e) => {
    e?.preventDefault();
    const norm = normalizeUid(quickSearchUid);
    if (!norm) return;

    setQuickLookupLoading(true);
    setQuickLookupError(null);
    setQuickLookupResult(null);

    try {
      const res = await resolveRfidCard(norm);
      if (res.matched) {
        setQuickLookupResult({
          name: res.student.name,
          rollNumber: res.student.roll_number,
          bloodGroup: res.student.blood_group,
          status: res.card.status,
          cardId: res.card.card_id,
        });
      } else {
        setQuickLookupError(res.message || `Card ${norm} is not actively assigned.`);
      }
    } catch (err) {
      setQuickLookupError(err.detail || err.message || "Card is not actively mapped to any student.");
    } finally {
      setQuickLookupLoading(false);
    }
  };

  const activeCard = studentCardData?.activeCard;
  const cardHistory = studentCardData?.history || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* ── TOP HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                RFID & NFC Card Provisioning Desk
              </h1>
              <p className="text-xs text-slate-500">
                Link verified physical smart cards to university student roll numbers
              </p>
            </div>
          </div>
        </div>

        {/* Web NFC Environment Badge */}
        <div className="flex items-center gap-2">
          {nfcSupported ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Web NFC Scanner Available</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-xs font-medium" title="Web NFC requires Android Chrome. On desktop, connect a standard USB RFID reader.">
              <CreditCard className="w-3.5 h-3.5 text-slate-500" />
              <span>USB Reader / Manual Input Mode</span>
            </div>
          )}
        </div>
      </div>

      {/* HTTPS Insecure Context Warning for Mobile Wi-Fi */}
      {!envStatus.isSecureContext && envStatus.httpsUrl && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-300 text-amber-950 text-xs space-y-2 shadow-xs mb-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-900">Mobile Web NFC Requires HTTPS over Local Wi-Fi</p>
                <p className="text-amber-800 text-[11px] mt-0.5 leading-relaxed">
                  Android Chrome disables hardware NFC APIs on unencrypted local IP (<code>http://</code>).
                  Switch to <code>https://</code> to tap and register cards directly from your phone.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                window.location.href = envStatus.httpsUrl;
              }}
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 cursor-pointer shadow-xs transition-colors flex items-center gap-1"
            >
              <span>Switch to HTTPS</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── LEFT: CARD ENROLLMENT & MATCHING ── */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-5">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-teal-700" />
              <span>Card Registration & Replacement</span>
            </h2>

            {/* Error & Success Banners */}
            <AnimatePresence>
              {conflictError && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">Assignment Conflict</p>
                    <p className="mt-0.5 leading-relaxed">{conflictError}</p>
                  </div>
                  <button onClick={() => setConflictError(null)} className="text-rose-500 hover:text-rose-700 cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}

              {successMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">Operation Completed</p>
                    <p className="mt-0.5 leading-relaxed">{successMessage}</p>
                  </div>
                  <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleEnrollCard} className="space-y-4">
              {/* Roll Number Input */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Student Roll Number <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={rollNumber}
                    onChange={(e) => setRollNumber(e.target.value)}
                    onBlur={() => handleLookupStudent()}
                    placeholder="Enter student roll number (e.g. 102203001)"
                    className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  {loadingStudent ? (
                    <RotateCw className="w-4 h-4 text-teal-600 animate-spin absolute right-3 top-3" />
                  ) : student ? (
                    <Check className="w-4 h-4 text-emerald-600 absolute right-3 top-3" />
                  ) : null}
                </div>
              </div>

              {/* Verified Student Match Preview Card */}
              <AnimatePresence>
                {student && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 text-xs space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-teal-700" />
                          <span className="font-bold text-slate-900">{student.name}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-teal-100/70 text-teal-800 text-[10px] font-bold font-mono">
                          {student.rollNumber}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1 border-t border-slate-200/60">
                        <div>
                          <span className="text-slate-400">Blood Group: </span>
                          <span className="font-semibold text-slate-800">{student.bloodGroup || student.blood || "—"}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Program: </span>
                          <span className="font-semibold text-slate-800">{student.program || "B.Tech"}</span>
                        </div>
                      </div>

                      {/* Current Card Status for Student */}
                      <div className="pt-2 border-t border-slate-200/60">
                        {activeCard ? (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-amber-50/80 border border-amber-200/80 text-[11px]">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                                <Radio className="w-3.5 h-3.5 text-amber-600" />
                                <span>Active Card: <span className="font-mono">{activeCard.cardUid}</span></span>
                              </div>
                              <p className="text-[10px] text-amber-700">
                                Enrolling a new card will automatically mark this card as REPLACED.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowRevokeModal(true)}
                              className="px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-semibold transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Revoke</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-100/70 text-slate-600 text-[11px]">
                            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                            <span>No active card currently assigned to this student.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {studentError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{studentError}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Card UID Input & Scanner Trigger */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  NFC / RFID Card UID <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={cardUid}
                      onChange={(e) => setCardUid(normalizeUid(e.target.value))}
                      placeholder="e.g. 04A2B3C4 or tap card"
                      className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-mono uppercase text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    />
                  </div>

                  {/* Web NFC Scan Button (Android Chrome) */}
                  {nfcSupported && (
                    <button
                      type="button"
                      onClick={scanningNfc ? cancelNfcScan : startNfcScan}
                      className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                        scanningNfc
                          ? "bg-amber-600 hover:bg-amber-700 text-white"
                          : "bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200"
                      }`}
                    >
                      <Radio className={`w-3.5 h-3.5 ${scanningNfc ? "animate-pulse" : ""}`} />
                      <span>{scanningNfc ? "Cancel Scan" : "Scan via Web NFC"}</span>
                    </button>
                  )}
                </div>

                {/* Live Scanning Status Radar */}
                {scanningNfc && (
                  <div className="mt-2 p-3 rounded-xl bg-teal-50/70 border border-teal-200 text-xs text-teal-900 flex items-center gap-2.5 animate-pulse">
                    <RotateCw className="w-4 h-4 text-teal-600 animate-spin" />
                    <span>{nfcStatusText || "Waiting for card tap..."}</span>
                  </div>
                )}
                <p className="text-[10px] text-slate-400 mt-1">
                  Card UID is automatically normalized (uppercase, spaces and colons removed).
                </p>
              </div>

              {/* Action Submit */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting || !rollNumber.trim() || !cardUid.trim() || !student}
                  className="w-full py-2.5 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      <span>Writing Mapping to Database...</span>
                    </>
                  ) : activeCard ? (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>Replace & Assign New Card</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Register & Link Card</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── RIGHT: QUICK CARD LOOKUP & CARD HISTORY ── */}
        <div className="lg:col-span-5 space-y-5">
          {/* Quick Reader Tap Test / Lookup */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Search className="w-4 h-4 text-teal-700" />
              <span>Card Identity Lookup</span>
            </h2>
            <p className="text-[11px] text-slate-500">
              Tap or paste an unknown card UID to identify the assigned student and card status.
            </p>

            <form onSubmit={handleQuickLookup} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={quickSearchUid}
                  onChange={(e) => setQuickSearchUid(normalizeUid(e.target.value))}
                  placeholder="Card UID (e.g. 04A2B3C4)"
                  className="w-full p-2 rounded-xl border border-slate-200 text-xs font-mono uppercase focus:outline-none focus:border-teal-500"
                />
                <button
                  type="submit"
                  disabled={quickLookupLoading || !quickSearchUid.trim()}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold cursor-pointer shrink-0 disabled:bg-slate-300"
                >
                  {quickLookupLoading ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : "Verify"}
                </button>
              </div>
            </form>

            {quickLookupResult && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-900">{quickLookupResult.name}</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800 text-[10px] font-bold font-mono">
                    {quickLookupResult.rollNumber}
                  </span>
                </div>
                <div className="text-[11px] text-emerald-700 flex justify-between">
                  <span>Blood: {quickLookupResult.bloodGroup || "—"}</span>
                  <span className="font-mono text-[10px]">Status: {quickLookupResult.status}</span>
                </div>
              </div>
            )}

            {quickLookupError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{quickLookupError}</span>
              </div>
            )}
          </div>

          {/* Student Card Assignment History */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-teal-700" />
              <span>Student Card History</span>
            </h2>

            {student ? (
              cardHistory.length > 0 ? (
                <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                  {cardHistory.map((c) => (
                    <div key={c.rfidCardId} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-mono font-bold text-slate-800">{c.cardUid}</div>
                        <div className="text-[10px] text-slate-400">
                          Issued: {new Date(c.issuedAt).toLocaleDateString()}
                          {c.deactivatedAt ? ` • Retired: ${new Date(c.deactivatedAt).toLocaleDateString()}` : ""}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          c.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800"
                            : c.status === "LOST"
                            ? "bg-rose-100 text-rose-800"
                            : c.status === "REPLACED"
                            ? "bg-slate-100 text-slate-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-3 text-center">No past cards recorded for this student.</p>
              )
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">
                Search or enter a student roll number above to view their card history.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── CARD REVOCATION MODAL ── */}
      <AnimatePresence>
        {showRevokeModal && activeCard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 text-xs"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>Revoke Student Card</span>
                </div>
                <button
                  onClick={() => setShowRevokeModal(false)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-slate-600 leading-relaxed">
                  Are you sure you want to revoke card <span className="font-mono font-bold text-slate-900">{activeCard.cardUid}</span> from student <span className="font-bold text-slate-900">{student?.name}</span> ({student?.rollNumber})?
                </p>
                <p className="text-slate-500 text-[11px]">
                  Once revoked, this card will be blocked from front desk check-in taps until explicitly re-assigned.
                </p>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1.5">
                    Revocation Reason:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRevokeReason("LOST")}
                      className={`p-2.5 rounded-xl border text-center font-semibold transition-colors cursor-pointer ${
                        revokeReason === "LOST"
                          ? "bg-rose-50 border-rose-300 text-rose-800"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Card Lost / Stolen
                    </button>
                    <button
                      type="button"
                      onClick={() => setRevokeReason("DEACTIVATED")}
                      className={`p-2.5 rounded-xl border text-center font-semibold transition-colors cursor-pointer ${
                        revokeReason === "DEACTIVATED"
                          ? "bg-amber-50 border-amber-300 text-amber-800"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      General Deactivation
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100 justify-end">
                <button
                  type="button"
                  onClick={() => setShowRevokeModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={revoking}
                  onClick={handleConfirmRevoke}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer disabled:bg-rose-300"
                >
                  {revoking && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Revocation</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

