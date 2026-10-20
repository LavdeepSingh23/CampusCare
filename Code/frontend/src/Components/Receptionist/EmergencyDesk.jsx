import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Siren,
  PhoneCall,
  User,
  ShieldAlert,
  Clock,
  RotateCw,
  Search,
  CheckCircle2,
  X,
  Plus,
  Send,
  Navigation,
  Check,
  AlertCircle,
  Truck,
  Building2,
  ChevronRight,
  HeartPulse,
} from "lucide-react";
import {
  fetchEmergencyLogs,
  createEmergencyLog,
  updateAmbulanceDispatch,
  fetchEmergencyDetail,
  lookupStudent,
  fetchStudentEmergencyContact,
  updateStudentEmergencyContact,
} from "../../api";

const EASE_SPRING = [0.32, 0.72, 0, 1];

const SEVERITY_COLORS = {
  CRITICAL: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    badge: "bg-red-600 text-white",
    dot: "bg-red-500",
  },
  HIGH: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700",
    badge: "bg-orange-600 text-white",
    dot: "bg-orange-500",
  },
  MEDIUM: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    badge: "bg-amber-500 text-white",
    dot: "bg-amber-400",
  },
  LOW: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    badge: "bg-emerald-600 text-white",
    dot: "bg-emerald-500",
  },
};

const AMBULANCE_STATUS_ORDER = ["REQUESTED", "DISPATCHED", "ARRIVED", "COMPLETED"];

export default function EmergencyDesk({ flash }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Intake modal state
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Form fields
  const [rollNumber, setRollNumber] = useState("");
  const [studentDetails, setStudentDetails] = useState(null);
  const [emergencyContact, setEmergencyContact] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [emergencyType, setEmergencyType] = useState("Trauma / Fracture");
  const [severity, setSeverity] = useState("HIGH");
  const [description, setDescription] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [ambulanceRequired, setAmbulanceRequired] = useState(false);
  const [destination, setDestination] = useState("Rajindra Hospital, Patiala");
  const [ambulanceProvider, setAmbulanceProvider] = useState("Campus Health Center Ambulance Unit");
  const [contactNumber, setContactNumber] = useState("+91-175-2393108");
  const [vehicleNumber, setVehicleNumber] = useState("PB 11 CD 5678");

  // Detail inspection modal
  const [selectedCase, setSelectedCase] = useState(null);
  const [updatingAmbulance, setUpdatingAmbulance] = useState(false);

  // Contact editor modal state
  const [editingContact, setEditingContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactRelation, setContactRelation] = useState("Parent");
  const [contactPhone, setContactPhone] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  const loadLogs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const sev = severityFilter !== "ALL" ? severityFilter : null;
      const data = await fetchEmergencyLogs(sev);
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load emergency logs:", err);
      setError(err.message || "Failed to retrieve emergency logs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [severityFilter]);

  useEffect(() => {
    loadLogs();
    const interval = setInterval(() => loadLogs(true), 6000);
    return () => clearInterval(interval);
  }, [loadLogs]);

  // Lookup student info on roll number blur or button click
  const handleStudentLookup = async () => {
    if (!rollNumber.trim()) return;
    setLookingUp(true);
    try {
      const st = await lookupStudent(rollNumber.trim());
      setStudentDetails(st);
      try {
        const ec = await fetchStudentEmergencyContact(rollNumber.trim());
        setEmergencyContact(ec);
      } catch {
        setEmergencyContact(null);
      }
    } catch (err) {
      setStudentDetails(null);
      setEmergencyContact(null);
      flash?.(`Student ${rollNumber} not found: ${err.message}`);
    } finally {
      setLookingUp(false);
    }
  };

  const handleCreateEmergency = async (e) => {
    e.preventDefault();
    if (!rollNumber.trim() || !description.trim() || !actionTaken.trim()) {
      setSubmitError("Please fill in Student Roll Number, Description, and Action Taken.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      roll_number: rollNumber.trim(),
      emergency_type: emergencyType,
      severity,
      description: description.trim(),
      action_taken: actionTaken.trim(),
      ambulance_required: ambulanceRequired,
      ...(ambulanceRequired
        ? {
            ambulance_details: {
              ambulance_provider: ambulanceProvider.trim(),
              contact_number: contactNumber.trim(),
              vehicle_number: vehicleNumber.trim() || null,
              destination: destination.trim(),
            },
          }
        : {}),
    };

    try {
      const res = await createEmergencyLog(payload);
      setShowIntakeModal(false);
      flash?.(`Emergency case #${res.emergency_id || res.emergencyId} recorded successfully!`);
      // Reset form
      setRollNumber("");
      setStudentDetails(null);
      setEmergencyContact(null);
      setDescription("");
      setActionTaken("");
      setAmbulanceRequired(false);
      loadLogs(true);
    } catch (err) {
      console.error("Failed to create emergency:", err);
      setSubmitError(err.message || "Failed to record emergency case.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateAmbulance = async (emergencyId, newStatus) => {
    setUpdatingAmbulance(true);
    try {
      await updateAmbulanceDispatch(emergencyId, { status: newStatus });
      flash?.(`Ambulance status updated to ${newStatus}`);
      if (selectedCase && (selectedCase.emergency_id === emergencyId || selectedCase.emergencyId === emergencyId)) {
        const refreshed = await fetchEmergencyDetail(emergencyId);
        setSelectedCase(refreshed);
      }
      loadLogs(true);
    } catch (err) {
      flash?.(`Could not update ambulance: ${err.message}`);
    } finally {
      setUpdatingAmbulance(false);
    }
  };

  const handleSaveContact = async () => {
    if (!selectedCase?.roll_number && !selectedCase?.rollNumber) return;
    const roll = selectedCase.roll_number || selectedCase.rollNumber;
    setSavingContact(true);
    try {
      const res = await updateStudentEmergencyContact(roll, {
        name: contactName.trim(),
        relationship: contactRelation.trim(),
        phone_number: contactPhone.trim(),
      });
      setEmergencyContact(res);
      setEditingContact(false);
      flash?.("Emergency contact saved successfully.");
      const refreshed = await fetchEmergencyDetail(selectedCase.emergency_id || selectedCase.emergencyId);
      setSelectedCase(refreshed);
    } catch (err) {
      flash?.(`Failed to save contact: ${err.message}`);
    } finally {
      setSavingContact(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        (l.roll_number || l.rollNumber || "").toLowerCase().includes(q) ||
        (l.student_name || l.studentName || "").toLowerCase().includes(q) ||
        (l.emergency_type || l.emergencyType || "").toLowerCase().includes(q) ||
        (l.description || "").toLowerCase().includes(q);
      return matchSearch;
    });
  }, [logs, searchQuery]);

  const counts = useMemo(() => {
    return {
      all: logs.length,
      critical: logs.filter((l) => l.severity === "CRITICAL").length,
      high: logs.filter((l) => l.severity === "HIGH").length,
      medium: logs.filter((l) => l.severity === "MEDIUM").length,
      ambulance: logs.filter((l) => l.ambulance_required || l.ambulanceRequired).length,
    };
  }, [logs]);

  return (
    <div className="space-y-6">
      {/* ── HEADER BANNER ── */}
      <div className="bg-gradient-to-r from-red-50 via-rose-50/50 to-white border border-red-200/80 rounded-2xl p-5 sm:p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span className="text-[11px] font-bold text-red-800 tracking-wide uppercase">
              Urgent Response • Emergency & Trauma Desk
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <HeartPulse className="w-6 h-6 text-red-600" />
            <span>Emergency & Ambulance Dispatch</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Triage critical trauma, anaphylaxis, and acute clinical events. Completely isolated from routine OPD queues
            with dedicated municipal & campus ambulance routing.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => loadLogs(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 text-slate-500 ${refreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setShowIntakeModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-xs hover:shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Log Emergency Case</span>
          </button>
        </div>
      </div>

      {/* ── METRIC STRIP ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button
          onClick={() => setSeverityFilter("ALL")}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            severityFilter === "ALL"
              ? "bg-slate-900 text-white border-slate-900 shadow-xs"
              : "bg-white text-slate-800 border-slate-200/90 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] uppercase font-bold tracking-wider opacity-70 block">All Incidents</span>
          <span className="text-xl font-bold mt-1 block">{counts.all}</span>
        </button>

        <button
          onClick={() => setSeverityFilter("CRITICAL")}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            severityFilter === "CRITICAL"
              ? "bg-red-600 text-white border-red-600 shadow-xs"
              : "bg-white text-slate-800 border-slate-200/90 hover:border-red-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-red-600 block">Critical</span>
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
          </div>
          <span className="text-xl font-bold mt-1 block text-red-700">{counts.critical}</span>
        </button>

        <button
          onClick={() => setSeverityFilter("HIGH")}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            severityFilter === "HIGH"
              ? "bg-orange-600 text-white border-orange-600 shadow-xs"
              : "bg-white text-slate-800 border-slate-200/90 hover:border-orange-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-orange-600 block">High</span>
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
          </div>
          <span className="text-xl font-bold mt-1 block text-orange-700">{counts.high}</span>
        </button>

        <button
          onClick={() => setSeverityFilter("MEDIUM")}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            severityFilter === "MEDIUM"
              ? "bg-amber-500 text-white border-amber-500 shadow-xs"
              : "bg-white text-slate-800 border-slate-200/90 hover:border-amber-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600 block">Medium</span>
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          </div>
          <span className="text-xl font-bold mt-1 block text-amber-700">{counts.medium}</span>
        </button>

        <div className="p-3.5 rounded-xl border bg-white border-slate-200/90">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Ambulances</span>
            <Truck className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <span className="text-xl font-bold mt-1 block text-blue-700">{counts.ambulance}</span>
        </div>
      </div>

      {/* ── FILTER & SEARCH STRIP ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student, roll number, or incident..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-red-500"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 self-end sm:self-auto">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
          <span>Campus Hotline: <strong>108 / +91-175-2393108</strong></span>
        </div>
      </div>

      {/* ── INCIDENTS LIST ── */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs">
          <RotateCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-500" />
          <span>Loading live emergency incidents...</span>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center text-slate-400 space-y-2">
          <HeartPulse className="w-8 h-8 mx-auto text-slate-300" />
          <p className="text-xs font-semibold text-slate-600">No emergency cases recorded</p>
          <p className="text-[11px] text-slate-400">
            Emergency and trauma incidents logged by staff will appear here with live ambulance dispatch tracking.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLogs.map((item) => {
            const id = item.emergency_id || item.emergencyId;
            const sev = item.severity || "MEDIUM";
            const sevStyle = SEVERITY_COLORS[sev] || SEVERITY_COLORS.MEDIUM;
            const amb = item.ambulance;
            const timeStr = item.occurred_at || item.occurredAt;
            const formattedTime = timeStr ? new Date(timeStr).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
            const formattedDate = timeStr ? new Date(timeStr).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "";

            return (
              <motion.div
                key={id}
                layout
                onClick={() => setSelectedCase(item)}
                className={`p-5 rounded-2xl border ${sevStyle.border} ${sevStyle.bg} hover:shadow-sm transition-all cursor-pointer relative flex flex-col justify-between space-y-4`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${sevStyle.badge}`}>
                      {sev}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {formattedDate} • {formattedTime}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{item.emergency_type || item.emergencyType}</h3>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">{item.description}</p>
                </div>

                <div className="pt-3 border-t border-slate-200/60 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900">{item.student_name || item.studentName || "Student"}</span>
                    <span className="font-mono text-slate-600 font-medium">{item.roll_number || item.rollNumber}</span>
                  </div>

                  {amb && (
                    <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg bg-white/80 border border-slate-200/80">
                      <div className="flex items-center gap-1.5 text-blue-700 font-semibold">
                        <Truck className="w-3.5 h-3.5" />
                        <span>Ambulance:</span>
                      </div>
                      <span className="font-bold text-slate-800">{amb.status}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Action: {item.action_taken || item.actionTaken}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── INTAKE MODAL ── */}
      <AnimatePresence>
        {showIntakeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ ease: EASE_SPRING }}
              className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto space-y-5"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-red-100 text-red-700">
                    <HeartPulse className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Record Emergency / Trauma Case</h3>
                    <p className="text-[11px] text-slate-500">Triage intake bypasses OPD waiting lines</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowIntakeModal(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {submitError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={handleCreateEmergency} className="space-y-4 text-xs">
                {/* Student Lookup */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-700">Student Roll Number *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={rollNumber}
                      onChange={(e) => setRollNumber(e.target.value)}
                      placeholder="e.g. 102403499"
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs focus:outline-none focus:border-red-500 uppercase"
                      required
                    />
                    <button
                      type="button"
                      onClick={handleStudentLookup}
                      disabled={lookingUp || !rollNumber.trim()}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                    >
                      {lookingUp ? "Checking..." : "Verify Student"}
                    </button>
                  </div>
                </div>

                {/* Student Telemetry Card */}
                {studentDetails && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-900">{studentDetails.name}</span>
                      <span className="font-mono text-teal-800 font-semibold px-2 py-0.5 rounded bg-teal-50">
                        Blood: {studentDetails.bloodGroup || studentDetails.blood || "Unknown"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Allergies: <span className="text-amber-800 font-medium">{studentDetails.allergies || "None"}</span>
                    </p>
                    {emergencyContact && (
                      <div className="pt-1.5 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                        <span className="text-slate-600">
                          Guardian: <strong>{emergencyContact.name}</strong> ({emergencyContact.relationship})
                        </span>
                        <a
                          href={`tel:${emergencyContact.phone_number || emergencyContact.phoneNumber}`}
                          className="text-red-600 font-semibold hover:underline flex items-center gap-1"
                        >
                          <PhoneCall className="w-3 h-3" />
                          <span>{emergencyContact.phone_number || emergencyContact.phoneNumber}</span>
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Severity Selector */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-700">Triage Severity *</label>
                  <div className="grid grid-cols-4 gap-2">
                    {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((sev) => {
                      const active = severity === sev;
                      const style = SEVERITY_COLORS[sev];
                      return (
                        <button
                          key={sev}
                          type="button"
                          onClick={() => setSeverity(sev)}
                          className={`py-2 rounded-xl text-center font-bold text-[11px] border transition-all cursor-pointer ${
                            active
                              ? `${style.badge} border-transparent shadow-xs`
                              : `bg-white ${style.text} ${style.border} hover:bg-slate-50`
                          }`}
                        >
                          {sev}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Emergency Type */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-700">Emergency Type *</label>
                  <select
                    value={emergencyType}
                    onChange={(e) => setEmergencyType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:border-red-500"
                  >
                    <option value="Trauma / Fracture">Trauma / Fracture</option>
                    <option value="Acute Asthma / Dyspnea">Acute Asthma / Dyspnea</option>
                    <option value="Severe Anaphylaxis / Allergy">Severe Anaphylaxis / Allergy</option>
                    <option value="Cardiac Event / Syncope">Cardiac Event / Syncope</option>
                    <option value="Deep Laceration / Hemorrhage">Deep Laceration / Hemorrhage</option>
                    <option value="Severe Burn / Chemical Splash">Severe Burn / Chemical Splash</option>
                    <option value="Head Trauma / Concussion">Head Trauma / Concussion</option>
                    <option value="Acute Heat Stroke">Acute Heat Stroke</option>
                    <option value="Other Medical Emergency">Other Medical Emergency</option>
                  </select>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-700">Clinical Presentation & Incident Details *</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe symptoms, vital signs, injury mechanism, location on campus..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-red-500"
                    required
                  />
                </div>

                {/* Action Taken */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-700">Immediate Action Taken *</label>
                  <textarea
                    rows={2}
                    value={actionTaken}
                    onChange={(e) => setActionTaken(e.target.value)}
                    placeholder="First aid given, splint applied, oxygen administered, vitals stabilized..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-red-500"
                    required
                  />
                </div>

                {/* Ambulance Toggle */}
                <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/50 space-y-3">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-blue-700" />
                      <span className="font-bold text-slate-900 text-xs">Dispatch Ambulance Immediately</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={ambulanceRequired}
                      onChange={(e) => setAmbulanceRequired(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </label>

                  {ambulanceRequired && (
                    <div className="space-y-2 pt-2 border-t border-blue-200/80 text-[11px]">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="font-semibold text-slate-600 block mb-1">Destination Hospital</label>
                          <input
                            type="text"
                            value={destination}
                            onChange={(e) => setDestination(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-600 block mb-1">Ambulance Vehicle No.</label>
                          <input
                            type="text"
                            value={vehicleNumber}
                            onChange={(e) => setVehicleNumber(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs uppercase"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="font-semibold text-slate-600 block mb-1">Provider Unit</label>
                          <input
                            type="text"
                            value={ambulanceProvider}
                            onChange={(e) => setAmbulanceProvider(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-600 block mb-1">Driver / Hotline Phone</label>
                          <input
                            type="text"
                            value={contactNumber}
                            onChange={(e) => setContactNumber(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowIntakeModal(false)}
                    className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer shadow-xs"
                  >
                    {submitting ? "Recording..." : "Record & Confirm Triage"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── DETAIL & AMBULANCE DISPATCH CONTROLS MODAL ── */}
      <AnimatePresence>
        {selectedCase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ ease: EASE_SPRING }}
              className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto space-y-5"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                    SEVERITY_COLORS[selectedCase.severity]?.badge || "bg-red-600 text-white"
                  }`}>
                    {selectedCase.severity}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    Emergency Incident #{selectedCase.emergency_id || selectedCase.emergencyId}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedCase(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Patient Info */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-900 block">{selectedCase.student_name || selectedCase.studentName}</span>
                    <span className="font-mono text-slate-500">{selectedCase.roll_number || selectedCase.rollNumber}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded font-mono font-bold bg-white border border-slate-200 text-slate-800">
                    Blood: {selectedCase.blood_group || selectedCase.bloodGroup || "—"}
                  </span>
                </div>

                <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/60 flex justify-between">
                  <span>Occurred: {selectedCase.occurred_at || selectedCase.occurredAt}</span>
                  <span>Recorded by Staff #{selectedCase.recorded_by_user_id || selectedCase.recordedByUserId}</span>
                </div>
              </div>

              {/* Clinical Incident */}
              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-semibold text-slate-500 block text-[11px] uppercase">Emergency Condition</span>
                  <p className="font-bold text-slate-900 mt-0.5">{selectedCase.emergency_type || selectedCase.emergencyType}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 block text-[11px] uppercase">Incident Description</span>
                  <p className="text-slate-700 mt-0.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">{selectedCase.description}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 block text-[11px] uppercase">Immediate Action Taken</span>
                  <p className="text-slate-700 mt-0.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">{selectedCase.action_taken || selectedCase.actionTaken}</p>
                </div>
              </div>

              {/* Student Emergency Contact Card */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <PhoneCall className="w-4 h-4 text-red-600" />
                    <span>Student Emergency Contact</span>
                  </div>
                  <button
                    onClick={() => {
                      const ec = selectedCase.emergency_contact || selectedCase.emergencyContact;
                      setContactName(ec?.name || "");
                      setContactRelation(ec?.relationship || "Parent");
                      setContactPhone(ec?.phone_number || ec?.phoneNumber || "");
                      setEditingContact(!editingContact);
                    }}
                    className="text-[11px] font-semibold text-teal-700 hover:underline cursor-pointer"
                  >
                    {editingContact ? "Cancel" : "Edit / Add"}
                  </button>
                </div>

                {editingContact ? (
                  <div className="space-y-2 pt-2 border-t border-slate-100 text-[11px]">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Guardian Name"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200"
                      />
                      <input
                        type="text"
                        placeholder="Relationship (e.g. Father)"
                        value={contactRelation}
                        onChange={(e) => setContactRelation(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Phone Number"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200"
                      />
                      <button
                        onClick={handleSaveContact}
                        disabled={savingContact || !contactName.trim() || !contactPhone.trim()}
                        className="px-3 py-1.5 rounded-lg bg-teal-700 text-white font-semibold cursor-pointer"
                      >
                        {savingContact ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs pt-1">
                    {selectedCase.emergency_contact || selectedCase.emergencyContact ? (
                      <>
                        <div>
                          <span className="font-semibold text-slate-900 block">
                            {(selectedCase.emergency_contact || selectedCase.emergencyContact).name}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {(selectedCase.emergency_contact || selectedCase.emergencyContact).relationship}
                          </span>
                        </div>
                        <a
                          href={`tel:${(selectedCase.emergency_contact || selectedCase.emergencyContact).phone_number || (selectedCase.emergency_contact || selectedCase.emergencyContact).phoneNumber}`}
                          className="px-3 py-1.5 rounded-xl bg-red-50 text-red-700 border border-red-200 font-bold flex items-center gap-1.5 hover:bg-red-100"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span>{(selectedCase.emergency_contact || selectedCase.emergencyContact).phone_number || (selectedCase.emergency_contact || selectedCase.emergencyContact).phoneNumber}</span>
                        </a>
                      </>
                    ) : (
                      <span className="text-slate-400 text-[11px]">No registered emergency contact. Click Edit to add.</span>
                    )}
                  </div>
                )}
              </div>

              {/* Ambulance Dispatch Tracking Controls */}
              {selectedCase.ambulance ? (
                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-blue-900">
                      <Truck className="w-4 h-4 text-blue-700" />
                      <span>Ambulance Dispatch State Machine</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-blue-600 text-white">
                      {selectedCase.ambulance.status}
                    </span>
                  </div>

                  {/* Stepper */}
                  <div className="grid grid-cols-4 gap-1 text-[10px] font-semibold text-center pt-2">
                    {AMBULANCE_STATUS_ORDER.map((step, idx) => {
                      const curIdx = AMBULANCE_STATUS_ORDER.indexOf(selectedCase.ambulance.status);
                      const isPast = curIdx >= idx;
                      const isCurrent = curIdx === idx;
                      return (
                        <div
                          key={step}
                          className={`p-1.5 rounded-lg border ${
                            isCurrent
                              ? "bg-blue-600 text-white border-blue-600 font-bold shadow-2xs"
                              : isPast
                              ? "bg-blue-100 text-blue-800 border-blue-200"
                              : "bg-white text-slate-400 border-slate-200"
                          }`}
                        >
                          {step}
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Destination:</span>
                      <strong>{selectedCase.ambulance.destination}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Vehicle:</span>
                      <strong>{selectedCase.ambulance.vehicle_number || "Campus Unit"}</strong>
                    </div>
                  </div>

                  {/* Transition Action Buttons */}
                  <div className="pt-2 border-t border-blue-200/80 flex items-center justify-end gap-2 flex-wrap">
                    {selectedCase.ambulance.status === "REQUESTED" && (
                      <button
                        onClick={() => handleUpdateAmbulance(selectedCase.emergency_id || selectedCase.emergencyId, "DISPATCHED")}
                        disabled={updatingAmbulance}
                        className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold cursor-pointer"
                      >
                        Mark Dispatched
                      </button>
                    )}
                    {selectedCase.ambulance.status === "DISPATCHED" && (
                      <button
                        onClick={() => handleUpdateAmbulance(selectedCase.emergency_id || selectedCase.emergencyId, "ARRIVED")}
                        disabled={updatingAmbulance}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer"
                      >
                        Mark Arrived on Scene
                      </button>
                    )}
                    {selectedCase.ambulance.status === "ARRIVED" && (
                      <button
                        onClick={() => handleUpdateAmbulance(selectedCase.emergency_id || selectedCase.emergencyId, "COMPLETED")}
                        disabled={updatingAmbulance}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                      >
                        Complete Hospital Handover
                      </button>
                    )}
                    {selectedCase.ambulance.status !== "COMPLETED" && selectedCase.ambulance.status !== "CANCELLED" && (
                      <button
                        onClick={() => handleUpdateAmbulance(selectedCase.emergency_id || selectedCase.emergencyId, "CANCELLED")}
                        disabled={updatingAmbulance}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 font-semibold cursor-pointer"
                      >
                        Cancel Dispatch
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                  <span className="text-slate-500">No ambulance requested for this case.</span>
                  <button
                    onClick={() => handleUpdateAmbulance(selectedCase.emergency_id || selectedCase.emergencyId, "REQUESTED")}
                    disabled={updatingAmbulance}
                    className="px-3 py-1.5 rounded-lg bg-blue-700 text-white font-semibold hover:bg-blue-800 cursor-pointer"
                  >
                    + Request Ambulance
                  </button>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setSelectedCase(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

