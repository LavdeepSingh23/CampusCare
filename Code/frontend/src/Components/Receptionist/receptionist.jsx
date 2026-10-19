import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useQueue, DOCTORS, DIRECTORY, dispense, logAction, resetDemo } from "../../context/queueStore";
import { lookupStudent, fetchReceptionDoctors, receptionCheckIn, fetchReceptionQueue, fetchAwaitingDispense } from "../../api";
import DispensingDesk from "./DispensingDesk";
import { useAuth } from "../../context/AuthContext";
import { Sidebar, SidebarBody, SidebarLink } from "../ui/sidebar";
import campusCareLogo from "../../assets/campuscare-logo.png";
import {
  Users,
  Stethoscope,
  Pill,
  CheckCircle2,
  Search,
  ArrowRight,
  UserCheck,
  Printer,
  Sparkles,
  ChevronRight,
  X,
  ShieldAlert,
  Check,
  AlertTriangle,
  CheckCircle,
  RotateCw,
  Clock,
  Activity as ActivityIcon,
  AlertCircle,
} from "lucide-react";
 
/* CampusCare – Receptionist Desk
   Sidebar pages: Reception · Student Check-in · Live OPD Queue · Students · Dispensing · Completed Visits · Activity
   Props:  onLogout()  – called by the Logout button
           initialPage – "reception" | "checkin" | "queue" | "students" | "dispensing" | "completed" | "activity" | "settings"
 
   NOTE: Student Check-in now talks to the backend (lookupStudent / fetchReceptionDoctors / receptionCheckIn).
   The other pages still read from the local queueStore (localStorage) until they are migrated. */
 
const ICONS = {
  reception: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  checkin: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  queue: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  students: <><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M17 3.1a4 4 0 0 1 0 7.8M21 21v-2a4 4 0 0 0-3-3.9" /></>,
  dispensing: <path d="M10.5 20.5 3.5 13.5a4.95 4.95 0 0 1 7-7l7 7a4.95 4.95 0 0 1-7 7zM8.5 8.5l7 7" />,
  completed: <path d="M20 6 9 17l-5-5" />,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
};
const Icon = ({ name, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
);
 
const NAV = [
  { id: "reception", label: "Reception", icon: "reception" },
  { id: "checkin", label: "Student Check-in", icon: "checkin" },
  { id: "queue", label: "Live OPD Queue", icon: "queue" },
  { id: "students", label: "Students", icon: "students" },
  { id: "dispensing", label: "Dispensing", icon: "dispensing" },
  { id: "completed", label: "Completed Visits", icon: "completed" },
  { id: "activity", label: "Activity", icon: "activity" },
];
const hhmm = (t) => (t ? new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—");
const dname = (id) => DOCTORS.find((d) => d.id === id)?.name || "—";
const pad = (n) => String(n).padStart(2, "0");
 
export default function ReceptionDashboard({ onLogout, initialPage = "reception" }) {
  const { visits, log } = useQueue();
  const { receptionist, logout } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(initialPage);
  const [now, setNow] = useState(new Date());
  const [toast, setToast] = useState(null);
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(i); }, []);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };
 
  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      logout();
      navigate("/user_login");
    }
  };
 
  const [liveQueue, setLiveQueue] = useState([]);
  const [liveDoctors, setLiveDoctors] = useState([]);
  const [liveDispensing, setLiveDispensing] = useState([]);

  useEffect(() => {
    const fetchLive = () => {
      fetchReceptionQueue()
        .then((q) => {
          if (Array.isArray(q)) setLiveQueue(q);
        })
        .catch(() => {});
      fetchReceptionDoctors()
        .then((d) => {
          if (Array.isArray(d)) setLiveDoctors(d);
        })
        .catch(() => {});
      fetchAwaitingDispense()
        .then((disp) => {
          if (Array.isArray(disp)) setLiveDispensing(disp);
        })
        .catch(() => {});
    };
    fetchLive();
    const timer = setInterval(fetchLive, 4000);
    return () => clearInterval(timer);
  }, []);

  const active = visits.filter((v) => v.status === "waiting" || v.status === "cabin");
  const waiting = visits.filter((v) => v.status === "waiting");
  const inConsult = visits.filter((v) => v.status === "cabin");
  const forMedicine = visits.filter((v) => v.status === "done").sort((a, b) => a.doneAt - b.doneAt);
  const completed = visits.filter((v) => v.status === "dispensed").sort((a, b) => b.dispensedAt - a.dispensedAt);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const counts = {
    queue: liveQueue.length > 0 ? liveQueue.length : active.length,
    dispensing: liveDispensing.length > 0 ? liveDispensing.length : forMedicine.length,
  };
 
  return (
    <div className="flex flex-col md:flex-row bg-[#f4f5f6] w-full min-h-screen text-slate-800 font-sans selection:bg-teal-500 selection:text-white">
      <style>{CSS}</style>
 
      {/* ── COLLAPSIBLE SIDEBAR ── */}
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
        <SidebarBody className="justify-between gap-6 bg-[#f4f5f6]">
          <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
            <div className="flex items-center gap-2.5 px-1 py-1 mb-6">
              <div className="h-7 w-7 bg-[#0c2827] rounded-lg flex items-center justify-center p-0.5 shadow-xs shrink-0">
                <img src={campusCareLogo} alt="CampusCare" className="h-5 w-5 object-contain" />
              </div>
              <motion.div
                animate={{ display: sidebarOpen ? "block" : "none", opacity: sidebarOpen ? 1 : 0 }}
                className="overflow-hidden whitespace-nowrap"
              >
                <span className="font-bold text-slate-900 tracking-tight text-sm leading-tight block">CampusCare</span>
                <span className="text-[10px] text-teal-700 font-semibold leading-tight block">TIET Health Centre</span>
              </motion.div>
            </div>
 
            <div className="flex flex-col gap-1">
              {NAV.map((n) => (
                <SidebarLink
                  key={n.id}
                  link={{ label: n.label, icon: <Icon name={n.icon} size={18} /> }}
                  active={page === n.id}
                  badge={counts[n.id] > 0 ? counts[n.id] : undefined}
                  onClick={() => setPage(n.id)}
                />
              ))}
            </div>
          </div>
 
          <div className="border-t border-slate-200/80 pt-3 flex flex-col gap-1">
            <SidebarLink
              link={{ label: "Settings", icon: <Icon name="settings" size={18} /> }}
              active={page === "settings"}
              onClick={() => setPage("settings")}
            />
            <SidebarLink
              link={{ label: "Logout", icon: <Icon name="logout" size={18} /> }}
              onClick={handleLogout}
            />
 
            <div className="mt-2 pt-2 border-t border-slate-200/50 flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-slate-200/50 transition-colors cursor-default">
              <div className="h-8 w-8 rounded-full bg-teal-700 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                {receptionist?.name ? receptionist.name.slice(0, 2).toUpperCase() : "RK"}
              </div>
              <motion.div
                animate={{ display: sidebarOpen ? "block" : "none", opacity: sidebarOpen ? 1 : 0 }}
                className="overflow-hidden whitespace-nowrap"
              >
                <p className="text-xs font-bold text-slate-900 truncate">{receptionist?.name || "Reception Desk"}</p>
                <p className="text-[10px] text-slate-500 font-medium truncate">
                  {receptionist?.email ? `${receptionist.email} • Counter 1` : "Counter 1 • TIET OPD"}
                </p>
              </motion.div>
            </div>
          </div>
        </SidebarBody>
      </Sidebar>
 
      {/* ── MAIN CANVAS ── */}
      <main className="flex-1 flex flex-col rounded-tl-3xl border-t border-l border-slate-200/90 bg-white shadow-xs p-6 md:p-8 min-h-screen overflow-y-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 mb-6 border-b border-slate-100">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {page === "reception" ? "Receptionist Desk" : NAV.find((n) => n.id === page)?.label || "Dashboard"}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">TIET Health Centre</p>
          </div>
 
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-bold text-slate-800">
                {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="text-[11px] text-slate-400 font-medium">
                {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
          </div>
        </div>
 
        <div className="flex-1">
          {page === "reception" && <Home {...{ now, visits, active, waiting, inConsult, forMedicine, log, setPage, liveQueue, liveDoctors, liveDispensing }} />}
          {page === "checkin" && <CheckIn {...{ flash, setPage }} />}
          {page === "queue" && <LiveQueue setPage={setPage} />}
          {page === "students" && <Students {...{ visits }} />}
          {page === "dispensing" && (
            <DispensingDesk
              flash={flash}
              onDispensed={(res) => {
                try {
                  logAction(`Dispensed: ${res?.dispensingStatus || "DISPENSED"} for Visit #${res?.visitId || ""}`, "dispensing");
                } catch {
                  // ignore
                }
                fetchAwaitingDispense().then((d) => {
                  if (Array.isArray(d)) setLiveDispensing(d);
                }).catch(() => {});
              }}
            />
          )}
          {page === "completed" && <Completed {...{ completed }} />}
          {page === "activity" && <Activity {...{ log }} />}
          {page === "settings" && <Settings {...{ flash }} />}
        </div>
      </main>
 
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-slate-900/95 text-white text-xs font-semibold shadow-2xl flex items-center gap-2 backdrop-blur-md border border-slate-800">
          <Sparkles className="w-4 h-4 text-teal-400" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
 
/* ====================== Shared UI Components ====================== */
 
const Avatar = ({ name = "Student", size = "md", className = "" }) => {
  const initials = name
    ? name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "ST";
 
  const sizeClasses = {
    sm: "h-7 w-7 text-[10px]",
    md: "h-9 w-9 text-xs",
    lg: "h-11 w-11 text-sm",
    xl: "h-14 w-14 text-base",
  };
 
  return (
    <div
      className={`rounded-full bg-teal-700 text-white font-bold flex items-center justify-center shrink-0 shadow-2xs select-none ${sizeClasses[size] || sizeClasses.md} ${className}`}
    >
      {initials}
    </div>
  );
};
 
const STATUS_CONFIG = {
  waiting: { label: "Waiting", color: "bg-amber-50 text-amber-700 border-amber-200/80" },
  cabin: { label: "In Consultation", color: "bg-teal-50 text-teal-800 border-teal-200/80" },
  done: { label: "Awaiting Medicine", color: "bg-orange-50 text-orange-700 border-orange-200/80" },
  dispensed: { label: "Completed", color: "bg-emerald-50 text-emerald-800 border-emerald-200/80" },
};
 
const Badge = ({ s, size = "sm" }) => {
  const conf = STATUS_CONFIG[s] || { label: s, color: "bg-slate-100 text-slate-700 border-slate-200" };
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${conf.color} ${
        size === "lg" ? "px-3 py-1 text-xs" : "px-2.5 py-0.5 text-[11px]"
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {conf.label}
    </span>
  );
};
 
const PageHead = ({ title, sub, badge, right }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
    <div>
      <div className="flex items-center gap-2.5">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h2>
        {badge && (
          <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold border bg-teal-50 text-teal-800 border-teal-200/70">
            {badge}
          </span>
        )}
      </div>
      {sub && <p className="text-xs text-slate-500 mt-1 font-medium">{sub}</p>}
    </div>
    {right && <div className="flex items-center gap-2.5">{right}</div>}
  </div>
);
 
/* ====================== 1. RECEPTION (Home Overview) ====================== */
function Home({ now, visits, waiting, inConsult, forMedicine, log, setPage, liveQueue = [], liveDoctors = [], liveDispensing = [] }) {
  const h = now.getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const completedToday = visits.filter((v) => v.status === "dispensed");

  const realWaiting = liveQueue.length > 0
    ? liveQueue.filter((v) => (v.statusCode || v.status || "").toUpperCase() === "WAITING")
    : waiting;
  const realInConsult = liveQueue.length > 0
    ? liveQueue.filter((v) => (v.statusCode || v.status || "").toUpperCase() === "IN_CONSULTATION")
    : inConsult;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-teal-50/80 via-white to-slate-50/50 border border-teal-100/90 rounded-2xl p-5 sm:p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-bold text-teal-800 tracking-wide uppercase">
              TIET Health Centre • Front Desk Live
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{greet}, Reception Desk</h2>
          <p className="text-xs text-slate-500 mt-1">
            {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} • OPD Station 1 active
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setPage("checkin")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs shadow-xs hover:shadow-sm transition-all cursor-pointer"
          >
            <UserCheck className="w-4 h-4" />
            <span>+ Student Check-in</span>
          </button>
          <button
            onClick={() => setPage("dispensing")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 font-semibold text-xs shadow-2xs transition-all cursor-pointer"
          >
            <Pill className="w-4 h-4 text-teal-700" />
            <span>Dispensary Queue ({forMedicine.length})</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:border-teal-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Waiting in Lounge</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-100"><Users className="w-4 h-4" /></div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{realWaiting.length}</span>
            <span className="text-[11px] text-slate-400 block mt-0.5">~5 min avg wait time</span>
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:border-teal-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">In Consultation</span>
            <div className="p-2 rounded-xl bg-teal-50 text-teal-700 border border-teal-100"><Stethoscope className="w-4 h-4" /></div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-extrabold text-teal-800 tracking-tight">{realInConsult.length}</span>
            <span className="text-[11px] text-slate-400 block mt-0.5">Across doctor cabins</span>
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:border-teal-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">For Medicine</span>
            <div className="p-2 rounded-xl bg-orange-50 text-orange-700 border border-orange-100"><Pill className="w-4 h-4" /></div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-extrabold text-orange-600 tracking-tight">{forMedicine.length}</span>
            <span className="text-[11px] text-slate-400 block mt-0.5">Ready for pharmacy</span>
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:border-teal-300 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Completed Today</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100"><CheckCircle2 className="w-4 h-4" /></div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{completedToday.length}</span>
            <span className="text-[11px] text-slate-400 block mt-0.5">Discharged & dispensed</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Doctor Cabins Live Status</h3>
              <p className="text-xs text-slate-500">Real-time consultation queue & availability</p>
            </div>
            <button
              onClick={() => setPage("queue")}
              className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>View Full Queue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {(liveDoctors.length > 0 ? liveDoctors : DOCTORS).map((d) => {
              const docId = d.doctorId ?? d.id;
              const q = liveQueue.length > 0
                ? liveQueue.filter((v) => (v.doctorId ?? v.doctor_id) === docId && ((v.statusCode || v.status || "").toUpperCase() === "WAITING")).length
                : visits.filter((v) => v.doctorId === docId && (v.status === "waiting" || v.status === "cabin")).length;
              const busy = liveQueue.length > 0
                ? liveQueue.some((v) => (v.doctorId ?? v.doctor_id) === docId && ((v.statusCode || v.status || "").toUpperCase() === "IN_CONSULTATION"))
                : visits.some((v) => v.doctorId === docId && v.status === "cabin");

              return (
                <div
                  key={docId}
                  className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-teal-300 hover:shadow-xs transition-all flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={d.name} size="sm" className="bg-slate-800 text-white" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{d.name}</h4>
                        <p className="text-[11px] text-slate-500">{d.role || d.specialty || "Physician"} • {d.room || "Cabin"}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${busy ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                      {busy ? "In Cabin" : "Available"}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[11px] text-slate-500">Queue: </span>
                      <span className="font-bold text-slate-900">{q} students</span>
                    </div>
                    <button
                      onClick={() => setPage("queue")}
                      className="text-xs font-semibold text-teal-700 hover:text-teal-900 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span>Check Line</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Action Required</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 font-semibold text-slate-600">Front Desk</span>
            </div>
 
            <div className="mt-4">
              {(() => {
                const pendingCount = liveDispensing.length > 0 ? liveDispensing.length : forMedicine.length;
                return pendingCount > 0 ? (
                  <div className="p-4 rounded-xl bg-orange-50/80 border border-orange-200/80 text-orange-950 space-y-2">
                    <div className="flex items-center gap-2">
                      <Pill className="w-4 h-4 text-orange-600" />
                      <span className="text-xs font-bold">
                        {pendingCount} prescription{pendingCount > 1 ? "s" : ""} waiting for pickup
                      </span>
                    </div>
                    <p className="text-[11px] text-orange-800/90 leading-relaxed">
                      Doctor consultations are completed. Students are waiting at the medicine counter.
                    </p>
                    <div className="pt-2">
                      <button
                        onClick={() => setPage("dispensing")}
                        className="w-full py-2 px-3 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs shadow-2xs transition-all cursor-pointer"
                      >
                        Open Dispensing Station ({pendingCount})
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 text-center py-6">
                    <CheckCircle className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
                    <p className="text-xs font-bold text-slate-800">All Prescriptions Cleared</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">No students are currently waiting at the medicine desk.</p>
                  </div>
                );
              })()}
            </div>
          </div>
 
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Counter 1 Shift:</span>
            <span className="font-semibold text-slate-800">09:00 AM - 05:00 PM</span>
          </div>
        </div>
      </div>
 
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <h3 className="text-sm font-bold text-slate-900">Recent Desk Activity</h3>
          <span className="text-xs text-slate-400">Live operational log</span>
        </div>
 
        <div className="divide-y divide-slate-100">
          {log.slice(0, 5).map((l, i) => (
            <div key={i} className="py-2.5 flex items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-mono text-slate-400 text-[11px]">{hhmm(l.t)}</span>
                <span className="font-semibold text-slate-800">{l.text}</span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60">
                {l.kind}
              </span>
            </div>
          ))}
          {log.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No recent activity recorded.</p>}
        </div>
      </div>
    </div>
  );
}
 
/* ====================== 2. STUDENT CHECK-IN (backend-connected) ====================== */
function CheckIn({ flash, setPage }) {
  const [step, setStep] = useState("scan"); // scan | identified | done
  const [student, setStudent] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState(null);
  const [reason, setReason] = useState("");
  const [q, setQ] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [checkinError, setCheckinError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const via = "MANUAL";

  const pickDefault = (list) => list.find((x) => x.available)?.doctorId ?? null;

  useEffect(() => {
    fetchReceptionDoctors()
      .then((d) => {
        if (Array.isArray(d)) {
          setDoctors(d);
          setDoctorId(pickDefault(d));
        }
      })
      .catch(() => flash("Could not load doctor directory"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async (e) => {
    e?.preventDefault();
    const roll = q.trim();
    if (!roll) return;
    setBusy(true);
    setNotFound(false);
    setSearchError(null);
    setCheckinError(null);
    try {
      const s = await lookupStudent(roll);
      setStudent(s);
      setStep("identified");
    } catch (err) {
      if (err.status === 404 || String(err.message).includes("404")) {
        setNotFound(true);
      } else {
        setSearchError(err.detail || err.message || "Failed to retrieve student record");
      }
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!student || !doctorId) return;
    setBusy(true);
    setCheckinError(null);
    try {
      const r = await receptionCheckIn({
        roll_number: student.rollNumber,
        doctor_id: doctorId,
        complaint: reason.trim() || "General Consultation",
        via,
      });
      setResult(r);
      setStep("done");
    } catch (err) {
      const msg = err.detail || err.message || "Failed to check in student";
      if (err.status === 409 || msg.toLowerCase().includes("active visit")) {
        setCheckinError({
          title: "Active Visit Conflict (409)",
          message: "Student already has an active visit in progress. Duplicate active visits are not permitted.",
        });
      } else if (err.status === 409 || msg.toLowerCase().includes("unavailable")) {
        setCheckinError({
          title: "Doctor Unavailable (409)",
          message: "The selected doctor is currently marked unavailable today. Please select another doctor cabin.",
        });
      } else if (err.status === 422) {
        setCheckinError({
          title: "Validation Error (422)",
          message: "Missing roll number or doctor assignment. Please verify your selection.",
        });
      } else {
        setCheckinError({
          title: "Check-in Error",
          message: msg.replace(/^API \d+:\s*/, ""),
        });
      }
      flash(msg.replace(/^API \d+:\s*/, ""));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep("scan");
    setStudent(null);
    setReason("");
    setResult(null);
    setQ("");
    setNotFound(false);
    setSearchError(null);
    setCheckinError(null);
    setDoctorId(pickDefault(doctors));
  };

  const doctorName = (id) => doctors.find((d) => d.doctorId === id)?.name || "Assigned Doctor";

  const QUICK_SYMPTOMS = ["Fever", "Cold & Cough", "Severe Headache", "Sports Injury", "Hostel Clearance", "Acidity"];

  return (
    <div className="max-w-xl mx-auto py-2">
      <PageHead
        title="Student Check-in"
        sub="Identify student and assign to real-time doctor consultation queue"
      />

      {/* ── STEP 1: SEARCH BY ROLL NUMBER ── */}
      {step === "scan" && (
        <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="text-center py-3">
            <div className="h-20 w-20 rounded-full bg-teal-50 border-2 border-dashed border-teal-400/80 flex items-center justify-center text-teal-700 shadow-sm mx-auto">
              <UserCheck className="w-9 h-9" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-4">Find the Student</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Enter the student's university roll number to verify their profile and issue a live OPD queue token.
            </p>
          </div>

          <form onSubmit={search} className="space-y-3">
            <label className="text-xs font-semibold text-slate-700 block">Search by Roll Number</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setNotFound(false);
                    setSearchError(null);
                  }}
                  placeholder="e.g. CS21B045 or 102403112"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white transition-all font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={busy || !q.trim()}
                className="px-5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-xs font-semibold cursor-pointer transition-colors shadow-2xs flex items-center gap-1.5"
              >
                {busy && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{busy ? "Searching…" : "Search"}</span>
              </button>
            </div>

            {notFound && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Record not found. Please verify the roll number is registered in TIET records.</span>
              </div>
            )}

            {searchError && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{searchError}</span>
              </div>
            )}
          </form>
        </div>
      )}

      {/* ── STEP 2: STUDENT IDENTIFIED ── */}
      {step === "identified" && student && (
        <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-teal-50/80 border border-teal-200/80">
            <div className="flex items-center gap-2.5">
              <div className="h-6 w-6 rounded-full bg-teal-700 text-white flex items-center justify-center">
                <Check className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-teal-950">Student Profile Verified</span>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
              via {via}
            </span>
          </div>

          {/* Conflict Error Banner */}
          {checkinError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start justify-between gap-3 shadow-2xs">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold">{checkinError.title}</strong>
                  <p className="mt-0.5 leading-relaxed text-rose-800">{checkinError.message}</p>
                </div>
              </div>
              <button
                onClick={() => setCheckinError(null)}
                className="text-rose-400 hover:text-rose-700 p-0.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Active Visit Warning Banner */}
          {student.alreadyInQueue && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5 shadow-2xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Active Visit Warning</strong>
                <p className="mt-0.5 leading-relaxed text-amber-800">
                  This student is already in queue or consultation (Status:{" "}
                  <span className="font-mono font-semibold">{student.activeVisitStatus || "WAITING"}</span>).
                  Submitting a new check-in will be rejected by the server to prevent duplicate active visits.
                </p>
              </div>
            </div>
          )}

          {/* Student Bio Card */}
          <div className="flex items-start gap-3.5 p-4 rounded-2xl border border-slate-200 bg-slate-50/60">
            <Avatar name={student.name} size="lg" />
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-slate-900 truncate">{student.name}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="font-mono text-xs font-bold text-teal-800 bg-teal-100/70 px-2 py-0.5 rounded-md">
                  {student.rollNumber}
                </span>
                <span className="text-xs text-slate-500">
                  {[student.program, student.dept].filter(Boolean).join(" ")}
                  {student.semester ? ` • Sem ${student.semester}` : ""}
                </span>
                {(student.bloodGroup || student.blood) && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                    Blood: {student.bloodGroup || student.blood}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Known Allergies Alert */}
          {student.allergies && student.allergies !== "None known" && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                <strong>Clinical Allergy Alert:</strong> {student.allergies}
              </span>
            </div>
          )}

          {/* Doctor Selection (from GET /api/reception/doctors) */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-slate-800 block">Assign to Available Doctor Cabin</label>
            {doctors.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">Loading active doctors…</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {doctors.map((d) => {
                  const selected = doctorId === d.doctorId;
                  return (
                    <button
                      key={d.doctorId}
                      type="button"
                      disabled={!d.available}
                      onClick={() => setDoctorId(d.doctorId)}
                      className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                        !d.available
                          ? "opacity-50 cursor-not-allowed border-slate-200 bg-slate-50"
                          : selected
                          ? "border-teal-600 bg-teal-50/50 ring-2 ring-teal-500/20 cursor-pointer"
                          : "border-slate-200 bg-white hover:border-slate-300 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Avatar name={d.name} size="sm" className={selected ? "bg-teal-700" : "bg-slate-700"} />
                        <div>
                          <p className="text-xs font-bold text-slate-900">{d.name}</p>
                          <p className="text-[10px] text-teal-800 font-medium">
                            {d.room ? `${d.room} • ` : ""}{d.specialty || "Physician"}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          d.available ? "bg-slate-100 text-slate-700" : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {d.available ? `Queue: ${d.queueCount ?? d.waiting ?? 0}` : "Unavailable"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Chief Complaint */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 block">Chief Complaint / Reason for Visit</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {QUICK_SYMPTOMS.map((symptom) => (
                <button
                  key={symptom}
                  type="button"
                  onClick={() => setReason(symptom)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                    reason === symptom
                      ? "bg-teal-700 text-white border-teal-700"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                  }`}
                >
                  {symptom}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Fever, persistent cough, wrist sprain"
              className="w-full p-3 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={reset}
              className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!doctorId || busy}
              onClick={confirm}
              className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-xs font-semibold transition-all shadow-xs cursor-pointer flex items-center gap-2"
            >
              {busy && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{busy ? "Registering Check-in…" : "Confirm Check-in & Queue"}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: CONFIRMED / TOKEN ISSUED ── */}
      {step === "done" && result && student && (
        <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs text-center space-y-6">
          <div className="h-16 w-16 rounded-full bg-emerald-50 border-2 border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-900">Check-in Complete</h3>
            <p className="text-xs text-slate-500 mt-1">
              Sequence token generated and student added to doctor's active queue.
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-teal-200 bg-teal-50/50 max-w-sm mx-auto space-y-3">
            <div>
              <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wider block">OPD Token Sequence</span>
              <span className="text-4xl font-extrabold text-teal-950 font-mono">
                #{pad(result.queueNo ?? result.queue_number ?? result.sequence ?? 1)}
              </span>
            </div>
            <div className="border-t border-teal-200/60 pt-3 text-xs space-y-1.5 text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Student Name:</span>
                <span className="font-bold">{result.name || student.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Roll Number:</span>
                <span className="font-mono">{result.rollNumber || student.rollNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Assigned Doctor:</span>
                <span className="font-bold text-teal-900">
                  {doctorName(result.doctorId ?? result.doctor_id ?? doctorId)}
                </span>
              </div>
              {result.position != null && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Live Queue Position:</span>
                  <span className="font-semibold text-emerald-800">{result.position} in line</span>
                </div>
              )}
              {result.visitId && (
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Visit ID:</span>
                  <span className="font-mono">#{result.visitId}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setPage("queue")}
              className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              View Live Queue
            </button>
            <button
              onClick={reset}
              className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-all shadow-xs cursor-pointer"
            >
              Check in Another Student
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ====================== 3. LIVE OPD QUEUE (Single API-Backed Multi-Doctor Queue) ====================== */
function LiveQueue({ setPage }) {
  const [queueItems, setQueueItems] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState("ALL");

  const loadData = async (isQuiet = false) => {
    if (!isQuiet) setRefreshing(true);
    try {
      const [queueData, docsData] = await Promise.all([
        fetchReceptionQueue(),
        fetchReceptionDoctors(),
      ]);
      setQueueItems(Array.isArray(queueData) ? queueData : []);
      if (Array.isArray(docsData)) setDoctors(docsData);
      setError(null);
    } catch (err) {
      console.warn("Failed to load reception queue:", err);
      if (!isQuiet) {
        setError(err.detail || err.message || "Could not retrieve live queue from server");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData(true);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Filtered doctors list based on tab
  const displayedDoctors = useMemo(() => {
    if (selectedDoctorFilter === "ALL") return doctors;
    return doctors.filter((d) => d.doctorId === selectedDoctorFilter);
  }, [doctors, selectedDoctorFilter]);

  // Overall queue count
  const totalWaiting = queueItems.filter(
    (q) => (q.statusCode || q.status || "").toUpperCase() === "WAITING"
  ).length;
  const totalInConsult = queueItems.filter(
    (q) => (q.statusCode || q.status || "").toUpperCase() === "IN_CONSULTATION"
  ).length;

  return (
    <div className="space-y-6">
      <PageHead
        title="Live OPD Queue"
        sub="Multi-doctor real-time consultation line. Polling every 4s with server-synchronized tokens."
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(false)}
              disabled={refreshing}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
            >
              <RotateCw className={`w-3.5 h-3.5 text-teal-700 ${refreshing ? "animate-spin" : ""}`} />
              <span>{refreshing ? "Syncing…" : "Live • Refresh"}</span>
            </button>
            {setPage && (
              <button
                onClick={() => setPage("checkin")}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs shadow-2xs transition-all cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>+ Check-in</span>
              </button>
            )}
          </div>
        }
      />

      {/* Filter Tabs across Doctor Cabins */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setSelectedDoctorFilter("ALL")}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 border ${
            selectedDoctorFilter === "ALL"
              ? "bg-teal-700 text-white border-teal-700 shadow-2xs"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
          }`}
        >
          <span>All Doctor Cabins</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              selectedDoctorFilter === "ALL" ? "bg-teal-800 text-teal-100" : "bg-slate-100 text-slate-700"
            }`}
          >
            {queueItems.length}
          </span>
        </button>

        {doctors.map((d) => {
          const docQueue = queueItems.filter(
            (q) => (q.doctorId ?? q.doctor_id) === d.doctorId
          );
          const isSelected = selectedDoctorFilter === d.doctorId;
          return (
            <button
              key={d.doctorId}
              type="button"
              onClick={() => setSelectedDoctorFilter(d.doctorId)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 border ${
                isSelected
                  ? "bg-teal-700 text-white border-teal-700 shadow-2xs"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span>{d.name}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  isSelected ? "bg-teal-800 text-teal-100" : "bg-slate-100 text-slate-700"
                }`}
              >
                {docQueue.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Error Banner with Retry */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <strong className="block font-bold">Queue Sync Error</strong>
              <p className="mt-0.5 text-rose-800">{error}</p>
            </div>
          </div>
          <button
            onClick={() => loadData(false)}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors cursor-pointer shrink-0"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && queueItems.length === 0 && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs animate-pulse space-y-4">
              <div className="h-6 bg-slate-200 rounded w-1/3" />
              <div className="h-10 bg-slate-100 rounded" />
              <div className="h-20 bg-slate-50 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Empty Overall Queue */}
      {!loading && queueItems.length === 0 && !error && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-12 text-center flex flex-col items-center justify-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shadow-xs">
            <Stethoscope className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">All OPD Queues Clear</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              There are currently no students waiting across doctor cabins. New check-ins submitted at the front desk will appear here automatically.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => loadData(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Refresh Queue
            </button>
            {setPage && (
              <button
                onClick={() => setPage("checkin")}
                className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-all shadow-xs cursor-pointer"
              >
                + Check in Student
              </button>
            )}
          </div>
        </div>
      )}

      {/* Doctor Cabins Sections */}
      {displayedDoctors.map((d) => {
        const rows = queueItems.filter(
          (item) => (item.doctorId ?? item.doctor_id) === d.doctorId
        );
        const activeConsultation = rows.find(
          (r) => (r.statusCode || r.status || "").toUpperCase() === "IN_CONSULTATION"
        );
        const waitingStudents = rows.filter(
          (r) => (r.statusCode || r.status || "").toUpperCase() === "WAITING"
        );
        const isBusy = !!activeConsultation;

        return (
          <div key={d.doctorId} className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            {/* Cabin Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <Avatar name={d.name} size="md" className="bg-slate-800 text-white" />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900">{d.name}</h3>
                    {d.room && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                        {d.room}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-teal-800 font-medium">{d.specialty || "Physician"}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                    isBusy
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}
                >
                  {isBusy ? "Cabin Busy • In Consultation" : "Cabin Available"}
                </span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  Queue: {waitingStudents.length} waiting
                </span>
              </div>
            </div>

            {/* Active Consultation Highlight Banner */}
            {activeConsultation && (
              <div className="px-5 py-3.5 bg-teal-50/70 border-b border-teal-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-teal-700 text-white shrink-0">
                    <Stethoscope className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-teal-900 font-bold">Currently in consultation: </span>
                    <span className="text-slate-900 font-semibold">{activeConsultation.name}</span>
                    <span className="font-mono text-slate-500 ml-1.5 text-[11px]">
                      ({activeConsultation.rollNumber || activeConsultation.rollNo})
                    </span>
                    {activeConsultation.complaint && (
                      <span className="text-slate-600 ml-2 italic text-[11px]">
                        — "{activeConsultation.complaint}"
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-teal-800 font-semibold">
                  <span className="bg-teal-100/80 px-2 py-0.5 rounded">
                    Token #{pad(activeConsultation.queueNo ?? activeConsultation.queue_number ?? 1)}
                  </span>
                  <span>
                    Called: {activeConsultation.calledAt || activeConsultation.waitingSince || "—"}
                  </span>
                </div>
              </div>
            )}

            {/* Waiting Students Queue Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-semibold bg-slate-50/30">
                    <th className="py-3 px-4 w-16">Token</th>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Roll Number</th>
                    <th className="py-3 px-4">Blood</th>
                    <th className="py-3 px-4">Chief Complaint</th>
                    <th className="py-3 px-4">Wait Time</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {waitingStudents.map((patient, i) => (
                    <tr key={patient.queueEntryId || patient.visitId || i} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-teal-800">
                        #{pad(patient.queueNo ?? patient.queue_number ?? patient.sequence ?? i + 1)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={patient.name} size="sm" />
                          <span className="font-bold text-slate-800">{patient.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {patient.rollNumber || patient.rollNo}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {patient.bloodGroup || patient.blood || "—"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                        {patient.complaint || "OPD Consultation"}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {patient.waitingSince || (patient.checkInTime ? hhmm(patient.checkInTime) : "—")}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 font-semibold rounded-full border px-2.5 py-0.5 text-[11px] bg-amber-50 text-amber-700 border-amber-200/80">
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                          Waiting
                        </span>
                      </td>
                    </tr>
                  ))}
                  {waitingStudents.length === 0 && (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-slate-400 text-xs">
                        No students currently waiting for {d.name}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
 
/* ====================== 4. STUDENTS DIRECTORY ====================== */
function Students({ visits }) {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [sem, setSem] = useState("");
  const [openRoll, setOpenRoll] = useState(null);
  const depts = [...new Set(DIRECTORY.map((s) => s.dept))];
  const list = useMemo(() => DIRECTORY.filter((s) =>
    (s.name + s.rollNo).toLowerCase().includes(q.toLowerCase()) && (!dept || s.dept === dept) && (!sem || String(s.semester) === sem)), [q, dept, sem]);
  const s = DIRECTORY.find((x) => x.rollNo === openRoll);
  const past = visits.filter((v) => v.rollNo === openRoll).sort((a, b) => b.checkedIn - a.checkedIn);
 
  const open = (roll) => { setOpenRoll(roll); logAction("STUDENT PROFILE VIEWED", DIRECTORY.find((x) => x.rollNo === roll).name); };
 
  return (
    <div className="space-y-6">
      <PageHead
        title="Students Directory"
        sub="Search registered TIET students and view verified medical telemetry"
        badge={`${list.length} students`}
      />
 
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by student name or roll number..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white"
            />
          </div>
          <select
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-xs text-slate-700 focus:outline-none focus:border-teal-500"
          >
            <option value="">All Departments</option>
            {depts.map((d) => (<option key={d} value={d}>{d}</option>))}
          </select>
          <select
            value={sem}
            onChange={(e) => setSem(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-xs text-slate-700 focus:outline-none focus:border-teal-500"
          >
            <option value="">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (<option key={n} value={n}>Semester {n}</option>))}
          </select>
        </div>
 
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-semibold bg-slate-50/30">
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Roll Number</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Semester</th>
                <th className="py-3 px-4">Blood Group</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((x) => (
                <tr
                  key={x.rollNo}
                  onClick={() => open(x.rollNo)}
                  className="hover:bg-teal-50/30 transition-colors cursor-pointer group"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={x.name} size="sm" />
                      <span className="font-bold text-slate-900 group-hover:text-teal-900">{x.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600 font-semibold">{x.rollNo}</td>
                  <td className="py-3 px-4 text-slate-600">{x.dept} ({x.program})</td>
                  <td className="py-3 px-4 text-slate-600">Sem {x.semester}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded font-mono font-semibold text-[11px] bg-slate-100 text-slate-700">{x.blood}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); open(x.rollNo); }}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-teal-500 hover:bg-teal-50 text-slate-600 hover:text-teal-800 text-[11px] font-semibold transition-colors"
                    >
                      View Profile
                    </button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400 text-xs">No students match the search filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
 
      {s && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs" onClick={() => setOpenRoll(null)}>
          <aside className="bg-white w-full max-w-md h-full shadow-2xl p-6 overflow-y-auto space-y-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <Avatar name={s.name} size="lg" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">{s.name}</h3>
                  <p className="font-mono text-xs font-semibold text-teal-800">{s.rollNo}</p>
                </div>
              </div>
              <button
                onClick={() => setOpenRoll(null)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
 
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Basic Information</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Program / Branch:</span>
                  <span className="font-semibold text-slate-800">{s.program} {s.dept}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Semester:</span>
                  <span className="font-semibold text-slate-800">Semester {s.semester}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Email:</span>
                  <span className="font-mono text-slate-800">{s.email}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Emergency Phone:</span>
                  <span className="font-mono text-slate-800">{s.phone}</span>
                </div>
              </div>
 
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-2">Medical Profile</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Blood Group:</span>
                  <span className="font-bold text-slate-900">{s.blood}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Known Allergies:</span>
                  <span className={`font-semibold ${s.allergies !== "None known" ? "text-rose-600 font-bold" : "text-slate-800"}`}>{s.allergies}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Chronic Conditions:</span>
                  <span className="font-semibold text-slate-800">{s.conditions}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Current Medications:</span>
                  <span className="font-semibold text-slate-800">{s.meds}</span>
                </div>
              </div>
 
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 pt-2">Visit History</h4>
              {past.length > 0 ? (
                <div className="space-y-2">
                  {past.map((v) => (
                    <div key={v.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-slate-800">{dname(v.doctorId)}</p>
                        <p className="text-[11px] text-slate-500 font-mono">{hhmm(v.checkedIn)} • {v.complaint}</p>
                      </div>
                      <Badge s={v.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-3">No past OPD visits found today.</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
 
/* ====================== 5. DISPENSING ====================== */
function Dispensing({ forMedicine, flash }) {
  const [openId, setOpenId] = useState(null);
  const [type, setType] = useState("Dispensed as prescribed");
  const [remarks, setRemarks] = useState("");
  const v = forMedicine.find((x) => x.id === openId);
  useEffect(() => { if (openId && !v) setOpenId(null); }, [v, openId]);
 
  const start = (id) => { setOpenId(id); setType("Dispensed as prescribed"); setRemarks(""); };
  const confirm = () => {
    if (type !== "Dispensed as prescribed" && !remarks.trim()) return flash("Please add a remark for this dispensing type");
    dispense(v.id, { type, remarks: remarks.trim() });
    flash(`${v.name}: dispensing recorded`);
    setOpenId(null);
  };
 
  return (
    <div className="space-y-6">
      <PageHead
        title="Dispensing Desk"
        sub="Fulfill completed doctor prescriptions and record dispensed medications"
        badge={`${forMedicine.length} ready`}
      />
 
      {forMedicine.length === 0 && (
        <div className="p-10 rounded-2xl border border-slate-200 bg-white text-center shadow-xs">
          <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
          <h3 className="text-base font-bold text-slate-800">All Prescriptions Dispensed</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            New prescriptions will arrive here automatically when doctors complete consultations.
          </p>
        </div>
      )}
 
      <div className="space-y-4">
        {forMedicine.map((x) => (
          <div
            key={x.id}
            className="p-5 rounded-2xl border border-slate-200/90 bg-white shadow-xs hover:border-teal-300 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-5"
          >
            <div className="flex items-start gap-3.5 min-w-[260px]">
              <Avatar name={x.name} size="md" />
              <div>
                <h3 className="text-base font-bold text-slate-900">{x.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">{x.rollNo}</span>
                  <span className="text-xs text-slate-500">{dname(x.doctorId)}</span>
                </div>
                <p className="text-[11px] text-teal-800 font-semibold mt-0.5">Prescription #{x.rxNo || "1042"}</p>
              </div>
            </div>
 
            <div className="flex-1 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Prescribed Medicines ({x.rx?.length || 0})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(x.rx || []).map((r, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200/70 text-teal-900 text-xs font-medium"
                  >
                    <Pill className="w-3 h-3 text-teal-700" />
                    <span>{r.med}</span>
                    <span className="text-[10px] text-teal-700 font-bold">({r.qty} units)</span>
                  </span>
                ))}
              </div>
 
              {x.allergy && x.allergy !== "None known" && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-semibold">
                  <ShieldAlert className="w-3 h-3 text-rose-600" />
                  <span>Allergy flagged: {x.allergy}</span>
                </div>
              )}
            </div>
 
            <div className="flex lg:flex-col items-center lg:items-end justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => start(x.id)}
                className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center gap-2"
              >
                <Pill className="w-4 h-4" />
                <span>Dispense Medication</span>
              </button>
            </div>
          </div>
        ))}
      </div>
 
      {v && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setOpenId(null)}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-slate-100 relative space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-50 text-teal-700 border border-teal-100">
                  <Pill className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Dispense Prescription</h3>
                  <p className="text-xs text-slate-500">Prescription #{v.rxNo || "1042"} • {dname(v.doctorId)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
 
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3">
              <Avatar name={v.name} size="md" />
              <div>
                <p className="text-sm font-bold text-slate-900">{v.name}</p>
                <p className="text-xs text-slate-500">Roll No: {v.rollNo}</p>
              </div>
            </div>
 
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Medicines to Dispense</h4>
              <div className="space-y-2">
                {(v.rx || []).map((r, i) => (
                  <div key={i} className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{r.med}</p>
                      <p className="text-[11px] text-slate-500">{r.freq} • {r.days} days{r.note ? ` • ${r.note}` : ""}</p>
                    </div>
                    <span className="font-mono font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200/60">
                      Qty: {r.qty}
                    </span>
                  </div>
                ))}
              </div>
            </div>
 
            {v.advice && (
              <div className="p-3 rounded-xl bg-slate-50 text-xs text-slate-600 border border-slate-200/60">
                <strong>Doctor's Advice: </strong>{v.advice}
              </div>
            )}
 
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700">Dispensing Fulfillment Status</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {["Dispensed as prescribed", "Partially dispensed", "Substituted"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer text-center ${
                      type === t
                        ? "bg-teal-700 text-white border-teal-700"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
 
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Pharmacist Remarks {type !== "Dispensed as prescribed" ? "(Required)" : "(Optional)"}
              </label>
              <textarea
                rows="2"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Verified dosage with student, advised taking after meals."
                className="w-full p-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
              />
            </div>
 
            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Slip</span>
              </button>
              <button
                type="button"
                onClick={confirm}
                className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-all shadow-xs cursor-pointer"
              >
                Confirm Dispensing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
 
/* ====================== 6. COMPLETED VISITS ====================== */
function Completed({ completed }) {
  const [q, setQ] = useState("");
  const rows = completed.filter((v) => (v.name + v.rollNo).toLowerCase().includes(q.toLowerCase()));
 
  return (
    <div className="space-y-6">
      <PageHead
        title="Completed Visits"
        sub="Today's completed and discharged OPD patient consultations"
        badge={`${completed.length} completed`}
      />
 
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-4">
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search completed student by name or roll..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white"
          />
        </div>
 
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-semibold bg-slate-50/30">
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Roll Number</th>
                <th className="py-3 px-4">Doctor</th>
                <th className="py-3 px-4">Check-in Time</th>
                <th className="py-3 px-4">Discharged Time</th>
                <th className="py-3 px-4">Dispensing Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={v.name} size="sm" />
                      <span className="font-bold text-slate-900">{v.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600">{v.rollNo}</td>
                  <td className="py-3 px-4 text-slate-700 font-medium">{dname(v.doctorId)}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{hhmm(v.checkedIn)}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{hhmm(v.dispensedAt)}</td>
                  <td className="py-3 px-4">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                      {v.dispensing?.type || "Dispensed"}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400 text-xs">No completed visits recorded today yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
 
/* ====================== 7. ACTIVITY AUDIT LOG ====================== */
function Activity({ log }) {
  return (
    <div className="space-y-6">
      <PageHead
        title="Activity Log"
        sub="Audit feed of front desk check-ins, cabin transitions, and dispensing events"
        badge={`${log.length} events`}
      />
 
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5">
        <div className="divide-y divide-slate-100">
          {log.map((l, i) => (
            <div key={i} className="py-3 flex items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-mono text-slate-400 text-xs w-14 shrink-0">{hhmm(l.t)}</span>
                <div>
                  <span className="font-bold text-slate-900">{l.kind}</span>
                  <p className="text-slate-500 text-[11px] mt-0.5">{l.text}</p>
                </div>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">Logged</span>
            </div>
          ))}
          {log.length === 0 && <p className="text-center text-slate-400 text-xs py-8">No events logged yet.</p>}
        </div>
      </div>
    </div>
  );
}
 
/* ====================== 8. SETTINGS ====================== */
function Settings({ flash }) {
  return (
    <div className="max-w-xl mx-auto py-2 space-y-6">
      <PageHead title="Settings" sub="Front desk preferences and demonstration queue controls" />
 
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-4 text-xs">
        <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">Terminal Information</h3>
 
        <div className="space-y-2.5">
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-500">Desk Station:</span>
            <span className="font-semibold text-slate-900">Front Desk • Counter 1</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-500">Operational Hours:</span>
            <span className="font-semibold text-slate-900">09:00 AM - 05:00 PM</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-500">Connected Account:</span>
            <span className="font-mono text-slate-900">reception@thapar.edu</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-500">RFID Scanner State:</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Connected
            </span>
          </div>
        </div>
 
        <div className="pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Reset all queue data to default demo state?")) {
                resetDemo();
                flash("Demo queue data successfully reset");
              }
            }}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
          >
            Reset Demo Data to Initial State
          </button>
        </div>
      </div>
    </div>
  );
}
 
const CSS = `
@media print {
  aside, nav, button, .rc-toast { display: none !important; }
}
`;
