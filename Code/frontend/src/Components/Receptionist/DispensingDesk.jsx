import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pill,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Search,
  Filter,
  ShieldAlert,
  ChevronRight,
  X,
  Printer,
  Sparkles,
  Info,
  Clock,
  User,
  Stethoscope,
  FileText,
  Check,
  AlertTriangle,
  ArrowRight,
  PackageCheck,
  Plus,
  Minus,
  CheckCheck,
} from "lucide-react";
import {
  fetchAwaitingDispense,
  fetchReceptionDoctors,
  dispensePrescription,
  fetchDispensingPrescription,
} from "../../api";
import { generatePrescriptionPdf } from "../../utils/prescriptionPdf";

const EASE_SPRING = [0.32, 0.72, 0, 1];

export default function DispensingDesk({ flash, onDispensed }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  // Active dispensing modal state
  const [activeVisit, setActiveVisit] = useState(null);
  const [fulfillmentType, setFulfillmentType] = useState("Dispensed as prescribed"); // "Dispensed as prescribed" | "Partially dispensed"
  const [itemQuantities, setItemQuantities] = useState({});
  const [itemReasons, setItemReasons] = useState({});
  const [overallReason, setOverallReason] = useState("");
  const [remarks, setRemarks] = useState("Medicines dispensed at front desk");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Completed receipt view state
  const [completedResult, setCompletedResult] = useState(null);

  // Fetch prescriptions awaiting dispensing
  const loadAwaitingList = useCallback(
    async (quiet = false) => {
      if (!quiet) setRefreshing(true);
      try {
        const [prescData, docsData] = await Promise.all([
          fetchAwaitingDispense(selectedDoctorFilter),
          fetchReceptionDoctors().catch(() => []),
        ]);
        setPrescriptions(Array.isArray(prescData) ? prescData : []);
        if (Array.isArray(docsData) && docsData.length > 0) {
          setDoctors(docsData);
        }
        setError(null);
        setLastSyncedAt(new Date());
      } catch (err) {
        console.warn("Error fetching awaiting dispensing list:", err);
        if (!quiet) {
          setError(err.detail || err.message || "Failed to load prescriptions awaiting dispensing");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedDoctorFilter]
  );

  useEffect(() => {
    loadAwaitingList();
    const interval = setInterval(() => {
      loadAwaitingList(true);
    }, 4500);
    return () => clearInterval(interval);
  }, [loadAwaitingList]);

  // Open dispensing workbench for a specific visit
  const handleOpenDispense = async (rx) => {
    setActiveVisit(rx);
    setFulfillmentType("Dispensed as prescribed");
    setSubmitError(null);
    setOverallReason("");
    setRemarks("Verified student roll number and dispensed prescribed medication");
    setShowConfirmModal(false);
    setCompletedResult(null);

    // Initialize item quantities to doctor's calculated quantities
    const initialQty = {};
    const initialReasons = {};
    (rx.medicines || rx.items || []).forEach((item) => {
      const piId = item.prescriptionItemId || item.prescription_item_id || item.id;
      const calcQty = Number(item.calculatedTotalQuantity ?? item.quantity ?? item.qty ?? 1);
      initialQty[piId] = calcQty;
      initialReasons[piId] = "";
    });
    setItemQuantities(initialQty);
    setItemReasons(initialReasons);

    // Optionally fetch full detailed prescription from backend to ensure latest state
    try {
      const fullDetail = await fetchDispensingPrescription(rx.visitId || rx.visit_id);
      if (fullDetail) {
        setActiveVisit((prev) => ({ ...prev, ...fullDetail }));
      }
    } catch {
      // If single-fetch fails, the list payload is already complete
    }
  };

  // Close active modal
  const handleClose = () => {
    setActiveVisit(null);
    setShowConfirmModal(false);
    setSubmitError(null);
    setCompletedResult(null);
  };

  // Stepper helper for modifying item quantities
  const handleQtyChange = (piId, nextVal, maxQty) => {
    const val = Math.max(0, Number(nextVal));
    setItemQuantities((prev) => ({ ...prev, [piId]: val }));

    // If any quantity differs from maxQty, automatically switch to Partial mode
    if (val !== maxQty && fulfillmentType === "Dispensed as prescribed") {
      setFulfillmentType("Partially dispensed");
    }
  };

  // Filtered prescription list
  const filteredPrescriptions = useMemo(() => {
    return prescriptions.filter((item) => {
      // Doctor filter
      if (
        selectedDoctorFilter !== "ALL" &&
        Number(item.doctorId || item.doctor_id) !== Number(selectedDoctorFilter)
      ) {
        return false;
      }
      // Text search
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const patientName = (item.patientName || item.student_name || item.name || "").toLowerCase();
      const rollNumber = (item.rollNumber || item.roll_number || item.rollNo || "").toLowerCase();
      const doc = (item.doctorName || item.doctor_name || "").toLowerCase();
      const diag = (item.diagnosis || "").toLowerCase();
      const meds = (item.medicines || item.items || [])
        .map((m) => (m.medicineName || m.medicine_name || m.name || "").toLowerCase())
        .join(" ");

      return (
        patientName.includes(q) ||
        rollNumber.includes(q) ||
        doc.includes(q) ||
        diag.includes(q) ||
        meds.includes(q) ||
        String(item.visitId || item.visit_id).includes(q)
      );
    });
  }, [prescriptions, selectedDoctorFilter, searchQuery]);

  // Check if any item quantity was changed from prescribed
  const hasQuantityModifications = useMemo(() => {
    if (!activeVisit) return false;
    const items = activeVisit.medicines || activeVisit.items || [];
    return items.some((item) => {
      const piId = item.prescriptionItemId || item.prescription_item_id || item.id;
      const origQty = Number(item.calculatedTotalQuantity ?? item.quantity ?? item.qty ?? 1);
      const curQty = Number(itemQuantities[piId] ?? origQty);
      return curQty !== origQty;
    });
  }, [activeVisit, itemQuantities]);

  // Submit dispensing action to backend
  const handleExecuteDispense = async () => {
    if (!activeVisit) return;
    const isPartial = fulfillmentType === "Partially dispensed" || hasQuantityModifications;

    // Strict validation: partial dispensing requires documented reason
    if (isPartial && !overallReason.trim()) {
      setSubmitError({
        title: "Variation Reason Required (Phase 7 Protocol)",
        detail:
          "Pharmacy audit rules require a documented reason when dispensing medications partially or with quantity modifications.",
      });
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const visitId = activeVisit.visitId || activeVisit.visit_id;
    const rawItems = activeVisit.medicines || activeVisit.items || [];

    const payloadItems = rawItems.map((item) => {
      const piId = item.prescriptionItemId || item.prescription_item_id || item.id;
      const medName = item.medicineName || item.medicine_name || item.name || "Medicine";
      const origQty = Number(item.calculatedTotalQuantity ?? item.quantity ?? item.qty ?? 1);
      const dispQty = Number(itemQuantities[piId] ?? origQty);
      const wasChanged = dispQty !== origQty;
      const itemReason = itemReasons[piId] || (wasChanged ? `Dispensed ${dispQty} of ${origQty} units` : null);

      return {
        prescription_item_id: piId,
        dispensed_medicine_name: medName,
        dispensed_quantity: dispQty,
        was_changed: wasChanged,
        ...(itemReason ? { change_reason: itemReason } : {}),
      };
    });

    const payload = {
      status: isPartial ? "Partially dispensed" : "Dispensed as prescribed",
      remarks: remarks.trim() || "Medicines dispensed at front desk",
      ...(isPartial ? { change_reason: overallReason.trim() } : {}),
      items: payloadItems,
    };

    try {
      const res = await dispensePrescription(visitId, payload);
      // Success response from backend
      setCompletedResult({
        ...res,
        visit: activeVisit,
        dispensedItems: payloadItems,
        timestamp: new Date().toISOString(),
      });
      setShowConfirmModal(false);

      if (flash) {
        flash(
          res.status === "already_completed"
            ? `Visit #${visitId} was already completed (Verified)`
            : `Medicines successfully dispensed for ${activeVisit.patientName || activeVisit.student_name || "Student"}`
        );
      }

      // Re-fetch awaiting dispensing list immediately
      loadAwaitingList(false);
      if (onDispensed) onDispensed(res);
    } catch (err) {
      console.error("Dispensing failed:", err);
      const detail = err.detail || err.message || "Failed to record dispensing on server";
      if (err.status === 409) {
        setSubmitError({
          title: "Conflict (409) — Workflow State Conflict",
          detail: detail.includes("reason")
            ? "Mandatory change reason missing for partial dispensing."
            : detail,
        });
      } else if (err.status === 403) {
        setSubmitError({
          title: "Authorization Forbidden (403)",
          detail: "Only verified front desk staff are authorized to perform medicine dispensing.",
        });
      } else {
        setSubmitError({
          title: "Dispensing Transaction Error",
          detail: detail,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Quick fill reason suggestion pills
  const REASON_PRESETS = [
    "Partial pharmacy stock available; balance tomorrow",
    "Single container issued per prescription protocol",
    "Reduced duration prescribed per pharmacist review",
    "Brand substitution authorized by duty pharmacist",
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans">
      {/* ── TOP HEADER / WORKBENCH METRICS ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[10px] uppercase tracking-[0.2em] font-semibold bg-teal-50 text-teal-800 border border-teal-200/70">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse" />
              Phase 7 Dispensing Workflow
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {lastSyncedAt ? `Synced ${lastSyncedAt.toLocaleTimeString("en-IN")}` : "Connecting…"}
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <span>Pharmacy Dispensing Station</span>
            <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full bg-slate-900 text-white font-mono">
              {prescriptions.length} Awaiting
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Live dispensary desk. Review finalized doctor prescriptions, verify item quantities, and record
            medication fulfillment with immutable database audit events.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => loadAwaitingList(false)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs shadow-2xs hover:shadow-xs transition-all duration-300 active:scale-[0.98] cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 text-teal-700 ${refreshing ? "animate-spin" : ""}`} />
            <span>{refreshing ? "Synchronizing…" : "Live • Sync"}</span>
          </button>
        </div>
      </div>

      {/* ── SEARCH & DOCTOR FILTERS (ASYMMETRICAL BENTO BAR) ── */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Doctor Cabin Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
          <button
            type="button"
            onClick={() => setSelectedDoctorFilter("ALL")}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300 cursor-pointer flex items-center gap-2 border ${
              selectedDoctorFilter === "ALL"
                ? "bg-teal-800 text-white border-teal-800 shadow-2xs"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span>All Doctor Cabins</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                selectedDoctorFilter === "ALL" ? "bg-teal-900 text-teal-100" : "bg-slate-100 text-slate-700"
              }`}
            >
              {prescriptions.length}
            </span>
          </button>

          {doctors.map((d) => {
            const docRxCount = prescriptions.filter(
              (p) => Number(p.doctorId || p.doctor_id) === Number(d.doctorId)
            ).length;
            const isSelected = selectedDoctorFilter === d.doctorId;
            return (
              <button
                key={d.doctorId}
                type="button"
                onClick={() => setSelectedDoctorFilter(d.doctorId)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300 cursor-pointer flex items-center gap-2 border ${
                  isSelected
                    ? "bg-teal-800 text-white border-teal-800 shadow-2xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span>{d.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isSelected ? "bg-teal-900 text-teal-100" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {docRxCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search input with ultra-light lines */}
        <div className="relative min-w-[280px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student, roll number, medicine…"
            className="w-full pl-9 pr-8 py-2 rounded-full border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700 transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── ERROR BANNER ── */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" strokeWidth={1.5} />
            <div>
              <strong className="font-bold">Dispensing Service Notice:</strong> {error}
            </div>
          </div>
          <button
            onClick={() => loadAwaitingList(false)}
            className="px-3 py-1 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── LOADING SKELETON ── */}
      {loading && prescriptions.length === 0 && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-6 rounded-[2rem] bg-slate-900/[0.02] ring-1 ring-slate-900/5 animate-pulse space-y-4"
            >
              <div className="h-5 bg-slate-200 rounded-full w-1/4" />
              <div className="h-12 bg-slate-100 rounded-2xl w-full" />
              <div className="h-8 bg-slate-100 rounded-xl w-3/4" />
            </div>
          ))}
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {!loading && filteredPrescriptions.length === 0 && (
        <div className="p-2 rounded-[2rem] bg-slate-900/[0.02] ring-1 ring-slate-900/5">
          <div className="p-12 rounded-[calc(2rem-0.5rem)] bg-white text-center shadow-xs border border-slate-100 flex flex-col items-center justify-center space-y-3.5">
            <div className="h-14 w-14 rounded-full bg-emerald-50 border border-emerald-200/70 text-emerald-700 flex items-center justify-center shadow-2xs">
              <PackageCheck className="w-7 h-7" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">All Prescriptions Fulfilled</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                There are no prescriptions currently awaiting medicine pickup. Incoming finalized doctor
                consultations will automatically appear here in real-time.
              </p>
            </div>
            <button
              onClick={() => loadAwaitingList(false)}
              className="mt-2 px-5 py-2.5 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Check for New Prescriptions
            </button>
          </div>
        </div>
      )}

      {/* ── PRESCRIPTION LIST (DOUBLE-BEZEL DOPPELRAND ARCHITECTURE) ── */}
      <div className="space-y-4">
        {filteredPrescriptions.map((item) => {
          const vId = item.visitId || item.visit_id;
          const rxId = item.prescriptionId || item.prescription_id || item.rxNo;
          const studentName = item.patientName || item.student_name || item.name || "Student";
          const roll = item.rollNumber || item.roll_number || item.rollNo || "—";
          const blood = item.bloodGroup || item.blood_group || item.blood;
          const doctor = item.doctorName || item.doctor_name || "Assigned Doctor";
          const specialty = item.specialty || "General Physician";
          const medicines = item.medicines || item.items || item.rx || [];
          const hasAllergy = item.allergy && item.allergy !== "None recorded" && item.allergy !== "None known";

          return (
            <motion.div
              key={vId}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE_SPRING }}
              className="group p-2 rounded-[2rem] bg-slate-900/[0.03] ring-1 ring-slate-900/5 hover:ring-teal-700/20 transition-all duration-500"
            >
              <div className="p-5 sm:p-6 rounded-[calc(2rem-0.5rem)] bg-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_4px_20px_rgba(0,0,0,0.02)] border border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                {/* Left: Student Identity & Doctor Meta */}
                <div className="min-w-[280px] space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-teal-800 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-2xs">
                      {studentName
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900 tracking-tight">{studentName}</h3>
                        {blood && (
                          <span className="font-mono text-[10px] px-2 py-0.2 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {blood}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                        <span className="font-mono font-bold text-slate-700">{roll}</span>
                        <span>•</span>
                        <span className="text-teal-800 font-semibold">{doctor}</span>
                      </div>
                    </div>
                  </div>

                  {/* Visit Badges & Diagnosis */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                    <span className="px-2.5 py-0.5 rounded-full font-mono font-semibold bg-teal-50 text-teal-800 border border-teal-200/60">
                      Visit #{vId}
                    </span>
                    {rxId && (
                      <span className="px-2.5 py-0.5 rounded-full font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200/80">
                        Rx #{rxId}
                      </span>
                    )}
                    {item.diagnosis && (
                      <span className="px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/60 truncate max-w-[200px]">
                        Dx: {item.diagnosis}
                      </span>
                    )}
                  </div>

                  {/* Allergies Notice */}
                  {hasAllergy && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-semibold">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" strokeWidth={1.5} />
                      <span>Allergy: {item.allergy}</span>
                    </div>
                  )}
                </div>

                {/* Middle: Prescribed Medicines Breakdown */}
                <div className="flex-1 space-y-2 border-t xl:border-t-0 xl:border-l border-slate-100 xl:pl-6 pt-3 xl:pt-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400">
                      Prescribed Medicines ({medicines.length})
                    </span>
                    {item.advice && (
                      <span className="text-[11px] text-slate-500 italic truncate max-w-sm">
                        Advice: {item.advice}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {medicines.map((m, idx) => {
                      const mName = m.medicineName || m.medicine_name || m.name;
                      const mQty = m.calculatedTotalQuantity ?? m.quantity ?? m.qty ?? 1;
                      const mDosage = m.frequency || m.dosage || m.freq || "—";
                      const mDays = m.days || m.duration_value || m.duration || "";
                      const mForm = m.dosageForm || m.dosage_form || "Med";

                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl border border-slate-200/70 bg-slate-50/70 hover:bg-teal-50/40 transition-colors flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                              <Pill className="w-3 h-3 text-teal-700 shrink-0" strokeWidth={1.5} />
                              <span className="truncate">{mName}</span>
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                              {mForm} • {mDosage} {mDays ? `• ${mDays} days` : ""}
                            </p>
                          </div>
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-teal-900 shrink-0 shadow-2xs">
                            {mQty} units
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Nested Island CTA Button */}
                <div className="flex items-center xl:flex-col justify-end gap-2.5 shrink-0 pt-2 xl:pt-0">
                  <button
                    type="button"
                    onClick={() => handleOpenDispense(item)}
                    className="w-full xl:w-auto rounded-full px-5 py-3 bg-teal-800 hover:bg-teal-900 text-white font-semibold text-xs shadow-xs hover:shadow-md transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] group flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <span>Dispense Prescription</span>
                    <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center transition-transform duration-500 group-hover:translate-x-0.5 shrink-0">
                      <ArrowRight className="w-3.5 h-3.5 text-white" strokeWidth={2} />
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── ACTIVE DISPENSING WORKBENCH MODAL (DOUBLE-BEZEL ARCHITECTURE) ── */}
      <AnimatePresence>
        {activeVisit && !completedResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.4, ease: EASE_SPRING }}
              className="p-2 rounded-[2.25rem] bg-slate-900/10 ring-1 ring-white/20 w-full max-w-2xl my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-[calc(2.25rem-0.5rem)] bg-white p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-6 max-h-[90vh] overflow-y-auto">
                {/* Modal Header */}
                <div className="flex items-start justify-between pb-4 border-b border-slate-100 gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="h-12 w-12 rounded-2xl bg-teal-50 border border-teal-200 text-teal-800 flex items-center justify-center shrink-0 shadow-2xs">
                      <Pill className="w-6 h-6" strokeWidth={1.5} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                          Dispense Medication Order
                        </h3>
                        <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-teal-100 text-teal-900">
                          Visit #{activeVisit.visitId || activeVisit.visit_id}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Patient:{" "}
                        <strong className="text-slate-800">
                          {activeVisit.patientName || activeVisit.student_name}
                        </strong>{" "}
                        ({activeVisit.rollNumber || activeVisit.roll_number}) • Prescribed by{" "}
                        {activeVisit.doctorName || activeVisit.doctor_name}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" strokeWidth={1.5} />
                  </button>
                </div>

                {/* Clinical Context Strip */}
                {(activeVisit.diagnosis || activeVisit.advice) && (
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs space-y-1">
                    {activeVisit.diagnosis && (
                      <p className="text-slate-700">
                        <strong className="text-slate-900">Diagnosis:</strong> {activeVisit.diagnosis}
                      </p>
                    )}
                    {activeVisit.advice && (
                      <p className="text-slate-600">
                        <strong className="text-slate-900">Doctor Instructions:</strong> {activeVisit.advice}
                      </p>
                    )}
                    {activeVisit.allergy &&
                      activeVisit.allergy !== "None recorded" &&
                      activeVisit.allergy !== "None known" && (
                        <p className="text-rose-700 font-bold flex items-center gap-1.5 pt-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                          <span>Flagged Allergy: {activeVisit.allergy}</span>
                        </p>
                      )}
                  </div>
                )}

                {/* Fulfillment Mode Segmented Toggle */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 block">
                    Fulfillment Mode
                  </label>
                  <div className="grid grid-cols-2 p-1.5 rounded-2xl bg-slate-100 border border-slate-200/80 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFulfillmentType("Dispensed as prescribed")}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 ${
                        fulfillmentType === "Dispensed as prescribed"
                          ? "bg-white text-teal-900 shadow-xs border border-slate-200/60"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 text-teal-700" strokeWidth={2} />
                      <span>Full Fulfillment (As Prescribed)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFulfillmentType("Partially dispensed")}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 ${
                        fulfillmentType === "Partially dispensed"
                          ? "bg-white text-amber-900 shadow-xs border border-slate-200/60"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" strokeWidth={2} />
                      <span>Partial / Inventory Shortage</span>
                    </button>
                  </div>
                </div>

                {/* Prescribed Items Table / Stepper Inputs */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Medicines & Dispensed Quantities
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      {fulfillmentType === "Partially dispensed"
                        ? "Adjust dispensed quantities below"
                        : "Full quantities locked"}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {(activeVisit.medicines || activeVisit.items || []).map((m, idx) => {
                      const piId = m.prescriptionItemId || m.prescription_item_id || m.id;
                      const origQty = Number(m.calculatedTotalQuantity ?? m.quantity ?? m.qty ?? 1);
                      const currentQty = Number(itemQuantities[piId] ?? origQty);
                      const isQtyModified = currentQty !== origQty;

                      return (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-2xl border transition-all ${
                            isQtyModified
                              ? "bg-amber-50/50 border-amber-300/80"
                              : "bg-white border-slate-200/80"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <p className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                                <Pill className="w-4 h-4 text-teal-700" strokeWidth={1.5} />
                                <span>{m.medicineName || m.medicine_name || m.name}</span>
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {m.dosageForm || m.dosage_form} • {m.frequency || m.dosage} •{" "}
                                {m.days || m.duration_value} days
                                {m.specialInstructions ? ` • ${m.specialInstructions}` : ""}
                              </p>
                            </div>

                            {/* Stepper Input or Static Value */}
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-xs text-slate-500 font-medium">
                                Prescribed: <strong className="text-slate-800">{origQty}</strong>
                              </span>

                              {fulfillmentType === "Partially dispensed" ? (
                                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 border border-slate-200">
                                  <button
                                    type="button"
                                    onClick={() => handleQtyChange(piId, currentQty - 1, origQty)}
                                    className="w-7 h-7 rounded-lg bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    value={currentQty}
                                    onChange={(e) => handleQtyChange(piId, e.target.value, origQty)}
                                    className="w-12 text-center text-xs font-bold text-slate-900 bg-transparent focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleQtyChange(piId, currentQty + 1, origQty)}
                                    className="w-7 h-7 rounded-lg bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span className="font-mono text-xs font-bold px-3 py-1 rounded-xl bg-teal-50 text-teal-800 border border-teal-200">
                                  {origQty} units
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Item specific notes / variation indicator */}
                          {isQtyModified && (
                            <div className="mt-2.5 pt-2 border-t border-amber-200/60 flex items-center justify-between text-xs text-amber-900">
                              <span className="font-semibold text-[11px] flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                Modified from {origQty} to {currentQty} units
                              </span>
                              <input
                                type="text"
                                value={itemReasons[piId] || ""}
                                onChange={(e) =>
                                  setItemReasons((prev) => ({ ...prev, [piId]: e.target.value }))
                                }
                                placeholder="Item variation note (optional)"
                                className="px-2.5 py-1 rounded-lg border border-amber-300 bg-white text-[11px] text-slate-800 focus:outline-none max-w-xs"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mandatory Variation Reason for Partial Dispensing */}
                {(fulfillmentType === "Partially dispensed" || hasQuantityModifications) && (
                  <div className="space-y-2 p-4 rounded-2xl bg-amber-50/70 border border-amber-200/90 text-amber-950">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold flex items-center gap-1.5 text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Pharmacy Variation Reason (Mandatory)</span>
                      </label>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md">
                        Required by Audit Rules
                      </span>
                    </div>

                    <textarea
                      rows={2}
                      value={overallReason}
                      onChange={(e) => setOverallReason(e.target.value)}
                      placeholder="Document reason for partial dispensing or quantity adjustment (e.g. Only 3 tablets available in stock, balance scheduled for tomorrow)..."
                      className="w-full p-3 rounded-xl border border-amber-300 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    />

                    {/* Quick suggestion tags */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {REASON_PRESETS.map((txt, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setOverallReason(txt)}
                          className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-white border border-amber-300/80 hover:bg-amber-100/60 text-amber-900 transition-colors cursor-pointer"
                        >
                          + {txt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Staff Remarks */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 block">
                    Staff Verification Remarks
                  </label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="e.g. Student identity verified via ID card. Advised to take with food."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                  />
                </div>

                {/* Error Banner inside Modal */}
                {submitError && (
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 text-xs space-y-1">
                    <strong className="block font-bold text-rose-800 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                      {submitError.title}
                    </strong>
                    <p className="text-rose-900/90 leading-relaxed">{submitError.detail}</p>
                  </div>
                )}

                {/* Modal Footer Actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={submitting}
                    className="px-4 py-2.5 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowConfirmModal(true)}
                      disabled={submitting}
                      className="rounded-full px-6 py-3 bg-teal-800 hover:bg-teal-900 text-white font-semibold text-xs shadow-sm hover:shadow-md transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] group flex items-center gap-3 cursor-pointer disabled:opacity-50"
                    >
                      <span>
                        {submitting
                          ? "Fulfilling Order…"
                          : fulfillmentType === "Partially dispensed"
                          ? "Confirm Partial Dispensing"
                          : "Confirm & Dispense Medication"}
                      </span>
                      <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center transition-transform duration-500 group-hover:translate-x-0.5 shrink-0">
                        <CheckCheck className="w-3.5 h-3.5 text-white" strokeWidth={2} />
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── PRE-SUBMISSION CONFIRMATION PROMPT MODAL ── */}
      <AnimatePresence>
        {showConfirmModal && activeVisit && !completedResult && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              className="p-2 rounded-[2rem] bg-white/10 ring-1 ring-white/30 max-w-md w-full"
            >
              <div className="p-6 rounded-[calc(2rem-0.5rem)] bg-white shadow-2xl border border-slate-100 space-y-4">
                <div className="h-12 w-12 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shadow-2xs mx-auto">
                  <PackageCheck className="w-6 h-6" strokeWidth={1.5} />
                </div>
                <div className="text-center space-y-1">
                  <h3 className="text-base font-bold text-slate-900">Confirm Medicine Dispensing</h3>
                  <p className="text-xs text-slate-500">
                    Are you ready to finalize medication fulfillment for{" "}
                    <strong>{activeVisit.patientName || activeVisit.student_name}</strong>?
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5 text-slate-700">
                  <div className="flex justify-between">
                    <span>Fulfillment Status:</span>
                    <strong className="text-teal-800">{fulfillmentType}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Medicines:</span>
                    <strong className="text-slate-900">
                      {(activeVisit.medicines || activeVisit.items || []).length} items
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Visit Transition:</span>
                    <strong className="text-emerald-700">→ COMPLETED</strong>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(false)}
                    disabled={submitting}
                    className="flex-1 py-2.5 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Go Back
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteDispense}
                    disabled={submitting}
                    className="flex-1 py-2.5 rounded-full bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {submitting && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{submitting ? "Processing…" : "Yes, Complete Visit"}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── COMPLETED DISPENSING RECEIPT / BACKEND CONFIRMATION STATE ── */}
      <AnimatePresence>
        {completedResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-2 rounded-[2.25rem] bg-emerald-500/10 ring-1 ring-emerald-500/20 max-w-lg w-full"
            >
              <div className="p-6 sm:p-8 rounded-[calc(2.25rem-0.5rem)] bg-white shadow-2xl border border-emerald-100 space-y-6">
                {/* Success Icon & Badge */}
                <div className="text-center space-y-2">
                  <div className="h-16 w-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shadow-xs mx-auto">
                    <CheckCircle2 className="w-8 h-8" strokeWidth={1.75} />
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900">
                    {completedResult.status === "already_completed"
                      ? "Idempotent Verification (Already Completed)"
                      : "Dispensing Order Completed"}
                  </span>
                  <h3 className="text-xl font-bold text-slate-900">Medications Dispensed Successfully</h3>
                  <p className="text-xs text-slate-500">
                    Visit #{completedResult.visitId} transitioned to <strong>COMPLETED</strong> in CampusCare database.
                  </p>
                </div>

                {/* Backend Response Receipt Details */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 text-xs space-y-2.5">
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Dispensing ID:</span>
                    <span className="font-mono font-bold text-teal-800">
                      DISP-#{completedResult.dispensingId || completedResult.dispensing_id || "701"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Student Roll:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {completedResult.rollNumber || completedResult.roll_number || completedResult.visit?.rollNumber}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Fulfillment Type:</span>
                    <span
                      className={`font-semibold ${
                        completedResult.dispensingStatus === "PARTIALLY_DISPENSED"
                          ? "text-amber-700"
                          : "text-emerald-700"
                      }`}
                    >
                      {completedResult.dispensingStatus || "DISPENSED"}
                    </span>
                  </div>
                  {completedResult.changeReason && (
                    <div className="py-1 border-b border-slate-200/60">
                      <span className="text-slate-500 block">Variation Reason:</span>
                      <span className="text-slate-800 italic mt-0.5 block">{completedResult.changeReason}</span>
                    </div>
                  )}

                  {/* Dispensed Items Summary */}
                  <div className="pt-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">
                      Verified Items Dispensed:
                    </span>
                    <div className="space-y-1">
                      {(completedResult.items || completedResult.dispensedItems || []).map((it, i) => (
                        <div key={i} className="flex justify-between text-slate-700 py-0.5">
                          <span className="truncate pr-2">
                            {it.dispensed_medicine_name || it.dispensedMedicineName || it.name || "Item"}
                          </span>
                          <span className="font-mono font-bold text-slate-900 shrink-0">
                            {it.dispensed_quantity || it.dispensedQuantity || it.quantity || it.qty} units
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (completedResult.visit) {
                        try {
                          generatePrescriptionPdf({
                            prescription: {
                              prescription_id: completedResult.visit.prescriptionId,
                              diagnosis: completedResult.visit.diagnosis,
                              general_instructions: completedResult.visit.advice,
                            },
                            doctor: {
                              name: completedResult.visit.doctorName,
                              specialization: completedResult.visit.specialty,
                            },
                            patient: {
                              name: completedResult.visit.patientName,
                              rollNumber: completedResult.visit.rollNumber,
                              bloodGroup: completedResult.visit.bloodGroup,
                            },
                            medicines: completedResult.visit.medicines || [],
                            autoDownload: true,
                          });
                        } catch {
                          window.print();
                        }
                      } else {
                        window.print();
                      }
                    }}
                    className="flex-1 py-3 px-4 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-slate-600" strokeWidth={1.5} />
                    <span>Print Handout / Slip</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 py-3 px-4 rounded-full bg-teal-800 hover:bg-teal-900 text-white font-semibold text-xs shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Next Prescription</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
