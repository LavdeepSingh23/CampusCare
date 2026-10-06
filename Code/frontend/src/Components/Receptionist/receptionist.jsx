import { useState, useEffect, useMemo } from "react";
import { useQueue, DOCTORS, DIRECTORY, checkInStudent, dispense, logAction, resetDemo } from "../../context/queueStore";

/* CampusCare – Receptionist Desk
   Sidebar pages: Reception · Student Check-in · Live OPD Queue · Students · Dispensing · Completed Visits · Activity
   (Emergency intentionally left out for now.)
   Props:  onLogout()  – called by the Logout button
           initialPage – "reception" | "checkin" | "queue" | "students" | "dispensing" | "completed" | "activity" | "settings"
   If you use react-router, render <ReceptionDashboard initialPage="queue" /> from /reception/queue, etc. */

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
const STATUS = { waiting: ["Waiting", "yellow"], cabin: ["In consultation", "green"], done: ["Awaiting medicine", "amber"], dispensed: ["Completed", "grey"] };
const hhmm = (t) => (t ? new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—");
const dname = (id) => DOCTORS.find((d) => d.id === id)?.name || "—";
const pad = (n) => String(n).padStart(2, "0");
const Badge = ({ s }) => <span className={`rc-badge ${STATUS[s][1]}`}>{STATUS[s][0]}</span>;

export default function ReceptionDashboard({ onLogout, initialPage = "reception" }) {
  const { visits, log } = useQueue();
  const [page, setPage] = useState(initialPage);
  const [now, setNow] = useState(new Date());
  const [toast, setToast] = useState(null);
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(i); }, []);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const active = visits.filter((v) => v.status === "waiting" || v.status === "cabin");
  const waiting = visits.filter((v) => v.status === "waiting");
  const inConsult = visits.filter((v) => v.status === "cabin");
  const forMedicine = visits.filter((v) => v.status === "done").sort((a, b) => a.doneAt - b.doneAt);
  const completed = visits.filter((v) => v.status === "dispensed").sort((a, b) => b.dispensedAt - a.dispensedAt);
  const counts = { queue: active.length, dispensing: forMedicine.length };

  return (
    <div className="rc">
      <style>{CSS}</style>

      <header className="rc-top">
        <div className="rc-brand">
          <div className="rc-logo"><Icon name="dispensing" size={20} /></div>
          <div><b>CampusCare</b><small>TIET Health Centre • OPD Live</small></div>
        </div>
        <div className="rc-top-r">
          <div className="rc-clock"><b>{now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</b><small>{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}</small></div>
          <div className="rc-user"><div className="rc-av">RK</div><div><b>Receptionist</b><small>Front Desk</small></div></div>
        </div>
      </header>

      <div className="rc-shell">
        <aside className="rc-side">
          <nav>
            {NAV.map((n) => (
              <button key={n.id} className={`rc-nav ${page === n.id ? "on" : ""}`} onClick={() => setPage(n.id)}>
                <Icon name={n.icon} /><span>{n.label}</span>
                {counts[n.id] > 0 && <i>{counts[n.id]}</i>}
              </button>
            ))}
          </nav>
          <div className="rc-side-bot">
            <button className={`rc-nav ${page === "settings" ? "on" : ""}`} onClick={() => setPage("settings")}><Icon name="settings" /><span>Settings</span></button>
            <button className="rc-nav" onClick={() => (onLogout ? onLogout() : (window.location.href = "/"))}><Icon name="logout" /><span>Logout</span></button>
          </div>
        </aside>

        <main className="rc-content">
          {page === "reception" && <Home {...{ now, visits, active, waiting, inConsult, forMedicine, log, setPage }} />}
          {page === "checkin" && <CheckIn {...{ visits, flash, setPage }} />}
          {page === "queue" && <LiveQueue {...{ visits }} />}
          {page === "students" && <Students {...{ visits }} />}
          {page === "dispensing" && <Dispensing {...{ forMedicine, flash }} />}
          {page === "completed" && <Completed {...{ completed }} />}
          {page === "activity" && <Activity {...{ log }} />}
          {page === "settings" && <Settings {...{ flash }} />}
        </main>
      </div>

      {toast && <div className="rc-toast">{toast}</div>}
    </div>
  );
}

/* ====================== shared bits ====================== */
const PageHead = ({ title, sub, right }) => (
  <div className="rc-ph"><div><h1>{title}</h1><p>{sub}</p></div>{right}</div>
);

/* ====================== 1. RECEPTION (home) ====================== */
function Home({ now, visits, waiting, inConsult, forMedicine, log, setPage }) {
  const h = now.getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return (
    <>
      <PageHead title="Reception" sub="Front Desk • TIET Health Centre • OPD Live" />
      <div className="rc-hello">
        <b>{greet}, Reception Desk</b>
        <span>{now.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long" })} • OPD currently active</span>
      </div>

      <div className="rc-stats">
        <div className="rc-stat"><small>Waiting</small><b>{waiting.length}</b></div>
        <div className="rc-stat"><small>In consultation</small><b>{inConsult.length}</b></div>
        <div className="rc-stat"><small>For medicine</small><b>{forMedicine.length}</b></div>
      </div>

      <div className="rc-two">
        <section className="rc-card">
          <h3>Doctor status</h3>
          {DOCTORS.map((d) => {
            const q = visits.filter((v) => v.doctorId === d.id && (v.status === "waiting" || v.status === "cabin")).length;
            const busy = visits.some((v) => v.doctorId === d.id && v.status === "cabin");
            return (
              <div key={d.id} className="rc-doc">
                <span className={`rc-dot ${busy ? "amber" : "green"}`} />
                <div><b>{d.name}</b><small>{d.role} • {d.room}</small></div>
                <div className="rc-doc-r"><b>Queue: {q}</b><small>{busy ? "With a student" : "Available"}</small></div>
              </div>
            );
          })}
        </section>

        <section className="rc-card">
          <h3>Action required</h3>
          {forMedicine.length === 0 ? <p className="rc-muted">Nothing needs your attention right now.</p> : (
            <div className="rc-action"><b>{forMedicine.length} prescription{forMedicine.length > 1 ? "s" : ""} ready</b><small>Students are waiting for their medicines.</small></div>
          )}
          <button className="rc-btn main" onClick={() => setPage("dispensing")}>View Dispensing</button>
        </section>
      </div>

      <section className="rc-card">
        <h3>Recent activity</h3>
        {log.slice(0, 5).map((l, i) => (
          <div key={i} className="rc-line"><time>{hhmm(l.t)}</time><span>{l.kind.charAt(0) + l.kind.slice(1).toLowerCase()}</span><b>{l.text.split(" • ")[0]}</b></div>
        ))}
      </section>
    </>
  );
}

/* ====================== 2. STUDENT CHECK-IN ====================== */
function CheckIn({ visits, flash, setPage }) {
  const [step, setStep] = useState("scan"); // scan | identified | done
  const [student, setStudent] = useState(null);
  const [via, setVia] = useState("RFID");
  const [doctorId, setDoctorId] = useState(null);
  const [reason, setReason] = useState("");
  const [q, setQ] = useState("");
  const [result, setResult] = useState(null);

  const already = (s) => visits.some((v) => v.rollNo === s.rollNo && ["waiting", "cabin", "done"].includes(v.status));
  const matches = q.trim().length >= 2 ? DIRECTORY.filter((s) => (s.name + s.rollNo).toLowerCase().includes(q.toLowerCase())).slice(0, 5) : [];

  const identify = (s, how) => { setStudent(s); setVia(how); setStep("identified"); setQ(""); };
  const simulateTap = () => {
    const free = DIRECTORY.filter((s) => !already(s));
    if (!free.length) return flash("Everyone in the demo directory is already checked in");
    identify(free[Math.floor(Math.random() * free.length)], "RFID");
  };
  const confirm = () => {
    const r = checkInStudent({ rollNo: student.rollNo, doctorId, complaint: reason, via });
    if (!r) return flash("This student already has an active visit");
    setResult(r); setStep("done");
  };
  const reset = () => { setStep("scan"); setStudent(null); setDoctorId(null); setReason(""); setResult(null); };

  return (
    <>
      <PageHead title="Student Check-in" sub="Identify the student and create today's OPD visit" />

      {step === "scan" && (
        <section className="rc-card rc-narrow">
          <div className="rc-rfid">
            <div className="rc-rfid-ring"><Icon name="checkin" size={34} /></div>
            <b>Tap RFID card</b>
            <small>Waiting for card…</small>
            <button className="rc-btn ghost" onClick={simulateTap}>Simulate card tap (demo)</button>
          </div>
          <div className="rc-or"><span>or</span></div>
          <label className="rc-field">Search roll number / student name
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 102403112 or Kriti" />
          </label>
          {matches.map((s) => (
            <button key={s.rollNo} className="rc-pick" onClick={() => identify(s, "Manual")}>
              <b>{s.name}</b><small>Roll {s.rollNo} • {s.program} {s.dept}</small>
            </button>
          ))}
          {q.trim().length >= 2 && matches.length === 0 && <p className="rc-muted">No student found.</p>}
        </section>
      )}

      {step === "identified" && student && (
        <section className="rc-card rc-narrow">
          <div className="rc-ident"><span className="rc-tick"><Icon name="completed" size={16} /></span> Student identified</div>
          <h2 className="rc-name">{student.name}</h2>
          <p className="rc-muted">Roll No. {student.rollNo}<br />{student.program} {student.dept} • Semester {student.semester}</p>
          {student.allergies !== "None known" && <div className="rc-warn">Allergies: {student.allergies}</div>}
          {already(student) && <div className="rc-warn">This student already has an active visit today.</div>}

          <h4>Select doctor</h4>
          <div className="rc-docs">
            {DOCTORS.map((d) => {
              const qn = visits.filter((v) => v.doctorId === d.id && (v.status === "waiting" || v.status === "cabin")).length;
              return (
                <button key={d.id} className={`rc-docpick ${doctorId === d.id ? "on" : ""}`} onClick={() => setDoctorId(d.id)}>
                  <span className="rc-dot green" />
                  <div><b>{d.name}</b><small>{d.role} • {d.room}</small></div>
                  <em>Queue: {qn}</em>
                </button>
              );
            })}
          </div>

          <label className="rc-field">Reason for visit (optional)
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. fever, headache" />
          </label>

          <div className="rc-act">
            <button className="rc-btn ghost" onClick={reset}>Cancel</button>
            <button className="rc-btn main" disabled={!doctorId || already(student)} onClick={confirm}>Confirm check-in</button>
          </div>
        </section>
      )}

      {step === "done" && result && (
        <section className="rc-card rc-narrow rc-done">
          <div className="rc-ident"><span className="rc-tick"><Icon name="completed" size={16} /></span> Check-in complete</div>
          <h2 className="rc-name">{student.name}</h2>
          <p className="rc-muted">Roll: {student.rollNo}</p>
          <div className="rc-kv"><span>Doctor</span><b>{dname(result.doctorId)}</b></div>
          <div className="rc-kv"><span>Queue number</span><b>#{pad(result.queueNo)}</b></div>
          <div className="rc-kv"><span>Position</span><b>{result.position}</b></div>
          <p className="rc-ok">Student added to the OPD queue.</p>
          <div className="rc-act">
            <button className="rc-btn ghost" onClick={() => setPage("queue")}>View queue</button>
            <button className="rc-btn main" onClick={reset}>Check in another student</button>
          </div>
        </section>
      )}
    </>
  );
}

/* ====================== 3. LIVE OPD QUEUE (read-only) ====================== */
function LiveQueue({ visits }) {
  const [, force] = useState(0);
  return (
    <>
      <PageHead title="Live OPD Queue" sub="All active doctor queues. View only, doctors control the queue."
        right={<button className="rc-btn ghost" onClick={() => force((n) => n + 1)}><span className="rc-live" />Live • Refresh</button>} />
      {DOCTORS.map((d) => {
        const rows = visits.filter((v) => v.doctorId === d.id && (v.status === "waiting" || v.status === "cabin")).sort((a, b) => (a.status === "cabin" ? -1 : b.status === "cabin" ? 1 : a.checkedIn - b.checkedIn));
        const busy = rows.some((r) => r.status === "cabin");
        return (
          <section key={d.id} className="rc-card">
            <div className="rc-qh">
              <div><b>{d.role.toUpperCase()} — {d.name}</b><small>{d.room}</small></div>
              <span className={`rc-badge ${busy ? "amber" : "green"}`}>{busy ? "With a student" : "Available"}</span>
            </div>
            <table className="rc-table">
              <thead><tr><th>#</th><th>Student</th><th>Status</th><th>Check-in</th></tr></thead>
              <tbody>
                {rows.map((v, i) => (
                  <tr key={v.id} className={v.status === "cabin" ? "hl" : ""}>
                    <td>{pad(i + 1)}</td><td><b>{v.name}</b></td><td><Badge s={v.status} /></td><td>{hhmm(v.checkedIn)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan="4" className="rc-muted">No active students in this queue.</td></tr>}
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}

/* ====================== 4. STUDENTS ====================== */
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
    <>
      <PageHead title="Students" sub="Search registered students" />
      <section className="rc-card">
        <div className="rc-filters">
          <input className="rc-in grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / roll number" />
          <select className="rc-in" value={dept} onChange={(e) => setDept(e.target.value)}><option value="">All departments</option>{depts.map((d) => <option key={d}>{d}</option>)}</select>
          <select className="rc-in" value={sem} onChange={(e) => setSem(e.target.value)}><option value="">All semesters</option>{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n}>{n}</option>)}</select>
        </div>
        <table className="rc-table clickable">
          <thead><tr><th>Roll No.</th><th>Student</th><th>Department</th><th>Semester</th><th>Status</th></tr></thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.rollNo} onClick={() => open(x.rollNo)}>
                <td>{x.rollNo}</td><td><b>{x.name}</b></td><td>{x.dept}</td><td>{x.semester}</td><td><span className="rc-badge green">Active</span></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan="5" className="rc-muted">No students match.</td></tr>}
          </tbody>
        </table>
      </section>

      {s && (
        <div className="rc-drawer-bg" onClick={() => setOpenRoll(null)}>
          <aside className="rc-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="rc-dh"><div><h2>{s.name}</h2><small>Roll No: {s.rollNo}</small></div>
              <button className="rc-x" onClick={() => setOpenRoll(null)} aria-label="Close"><Icon name="close" /></button></div>

            <h4>Basic information</h4>
            <div className="rc-kv"><span>Department</span><b>{s.program} {s.dept}</b></div>
            <div className="rc-kv"><span>Semester</span><b>{s.semester}</b></div>
            <div className="rc-kv"><span>Phone</span><b>{s.phone}</b></div>
            <div className="rc-kv"><span>Email</span><b>{s.email}</b></div>

            <h4>Medical profile</h4>
            <div className="rc-kv"><span>Blood group</span><b>{s.blood}</b></div>
            <div className="rc-kv"><span>Allergies</span><b>{s.allergies}</b></div>
            <div className="rc-kv"><span>Chronic conditions</span><b>{s.conditions}</b></div>
            <div className="rc-kv"><span>Current medications</span><b>{s.meds}</b></div>

            <h4>Recent visits</h4>
            {past.length === 0 ? <p className="rc-muted">No visits recorded.</p> : (
              <table className="rc-table"><thead><tr><th>Time</th><th>Doctor</th><th>Status</th></tr></thead>
                <tbody>{past.map((v) => <tr key={v.id}><td>{hhmm(v.checkedIn)}</td><td>{dname(v.doctorId)}</td><td><Badge s={v.status} /></td></tr>)}</tbody></table>
            )}
          </aside>
        </div>
      )}
    </>
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
    <>
      <PageHead title="Dispensing Desk" sub="Prescriptions waiting to be dispensed" right={<span className="rc-badge amber big">{forMedicine.length} ready</span>} />
      {forMedicine.length === 0 && <section className="rc-card"><p className="rc-muted c">No prescriptions waiting. They appear here when a doctor completes a consultation.</p></section>}
      {forMedicine.map((x) => (
        <section key={x.id} className="rc-card rc-rxcard">
          <div>
            <h3>{x.name}</h3>
            <small>Roll: {x.rollNo}</small>
            <small>{dname(x.doctorId)} • Prescription #{x.rxNo}</small>
            <p className="rc-meds-n">{x.rx?.length || 0} medicine{x.rx?.length === 1 ? "" : "s"}</p>
          </div>
          <button className="rc-btn main" onClick={() => start(x.id)}>Dispense</button>
        </section>
      ))}

      {v && (
        <div className="rc-modal" onClick={() => setOpenId(null)}>
          <div className="rc-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="rc-dh"><h2>Dispense Prescription</h2><button className="rc-x" onClick={() => setOpenId(null)} aria-label="Close"><Icon name="close" /></button></div>
            <h3 className="rc-name sm">{v.name}</h3>
            <small>Roll: {v.rollNo}</small><small>Prescribed by: {dname(v.doctorId)}</small>
            {v.allergy && v.allergy !== "None known" && <div className="rc-warn">Allergies: {v.allergy}</div>}

            <h4>Medicines</h4>
            {(v.rx || []).map((r, i) => (
              <div key={i} className="rc-med"><b>{r.med}</b><small>{r.freq} • {r.days} days • {r.qty} units{r.note ? ` • ${r.note}` : ""}</small></div>
            ))}
            {v.advice && <><h4>Doctor's advice</h4><p className="rc-muted">{v.advice}</p></>}

            <h4>Dispensing status</h4>
            {["Dispensed as prescribed", "Partially dispensed", "Substituted"].map((t) => (
              <label key={t} className="rc-radio"><input type="radio" name="dtype" checked={type === t} onChange={() => setType(t)} />{t}</label>
            ))}
            <label className="rc-field">Remarks{type !== "Dispensed as prescribed" ? " (required)" : ""}
              <textarea rows="2" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. cetirizine out of stock, gave levocetirizine" />
            </label>
            <div className="rc-act">
              <button className="rc-btn ghost" onClick={() => window.print()}>Print slip</button>
              <button className="rc-btn main" onClick={confirm}>Confirm dispensing</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ====================== 6. COMPLETED VISITS ====================== */
function Completed({ completed }) {
  const [q, setQ] = useState("");
  const rows = completed.filter((v) => (v.name + v.rollNo).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHead title="Completed Visits" sub="Today's completed OPD visits" />
      <section className="rc-card">
        <div className="rc-filters">
          <input className="rc-in grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student / roll" />
          <select className="rc-in"><option>Today</option></select>
        </div>
        <table className="rc-table">
          <thead><tr><th>Student</th><th>Doctor</th><th>Check-in</th><th>Completed</th><th>Dispensing</th></tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}><td><b>{v.name}</b><small>Roll {v.rollNo}</small></td><td>{dname(v.doctorId)}</td><td>{hhmm(v.checkedIn)}</td><td>{hhmm(v.dispensedAt)}</td><td>{v.dispensing?.type || "—"}</td></tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="5" className="rc-muted">No completed visits yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}

/* ====================== 7. ACTIVITY ====================== */
function Activity({ log }) {
  return (
    <>
      <PageHead title="Activity" sub="Reception desk actions" />
      <section className="rc-card">
        {log.length === 0 && <p className="rc-muted c">No activity yet.</p>}
        {log.map((l, i) => (
          <div key={i} className="rc-log"><time>{hhmm(l.t)}</time><div><b>{l.kind}</b><small>{l.text}</small></div></div>
        ))}
      </section>
    </>
  );
}

/* ====================== settings (small) ====================== */
function Settings({ flash }) {
  return (
    <>
      <PageHead title="Settings" sub="Reception desk preferences" />
      <section className="rc-card rc-narrow">
        <div className="rc-kv"><span>Desk</span><b>Front Desk • Counter 1</b></div>
        <div className="rc-kv"><span>Shift hours</span><b>09:00 AM - 05:00 PM</b></div>
        <div className="rc-kv"><span>Account</span><b>reception@thapar.edu</b></div>
        <button className="rc-btn ghost" style={{ marginTop: 16 }} onClick={() => { if (confirm("Reset all queue data to demo data?")) { resetDemo(); flash("Demo data reset"); } }}>Reset demo data</button>
      </section>
    </>
  );
}

/* ====================== styles ====================== */
const CSS = `
.rc{--teal:#0f766e;--teal-d:#115e59;--teal-l:#e8f5f2;--ink:#0f172a;--mut:#64748b;--line:#e6ebef;--bg:#f5f7f9;
 font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;font-size:14.5px;display:flex;flex-direction:column}
.rc *{box-sizing:border-box}.rc small{display:block;color:var(--mut);font-size:12.5px;margin-top:1px}.rc button{font-family:inherit;cursor:pointer}
.rc button:focus-visible,.rc input:focus-visible,.rc select:focus-visible,.rc textarea:focus-visible{outline:3px solid #a5dad2;outline-offset:1px}
.rc h1,.rc h2,.rc h3,.rc h4{margin:0}

.rc-top{height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 24px;background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}
.rc-brand{display:flex;gap:10px;align-items:center}.rc-brand b{font-size:16px}
.rc-logo{width:36px;height:36px;border-radius:10px;background:var(--teal);color:#fff;display:grid;place-items:center}
.rc-top-r{display:flex;gap:22px;align-items:center}.rc-clock{text-align:right}.rc-clock b{font-size:18px;font-variant-numeric:tabular-nums}
.rc-user{display:flex;gap:10px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:5px 12px 5px 6px}
.rc-av{width:32px;height:32px;border-radius:50%;background:var(--teal);color:#fff;font-weight:700;font-size:12px;display:grid;place-items:center}
.rc-user b{font-size:13px}

.rc-shell{display:flex;flex:1;min-height:0}
.rc-side{width:236px;flex:none;background:#fff;border-right:1px solid var(--line);padding:16px 12px;display:flex;flex-direction:column;justify-content:space-between;position:sticky;top:64px;height:calc(100vh - 64px)}
.rc-nav{display:flex;align-items:center;gap:12px;width:100%;border:0;background:transparent;border-radius:10px;padding:11px 12px;margin-bottom:2px;color:#475569;font-size:14px;font-weight:600;text-align:left;position:relative}
.rc-nav:hover{background:#f3f6f8}
.rc-nav.on{background:var(--teal-l);color:var(--teal)}
.rc-nav.on::before{content:"";position:absolute;left:-12px;top:8px;bottom:8px;width:3px;border-radius:0 3px 3px 0;background:var(--teal)}
.rc-nav i{margin-left:auto;font-style:normal;background:var(--teal);color:#fff;border-radius:99px;min-width:22px;text-align:center;padding:1px 7px;font-size:11.5px}
.rc-side-bot{border-top:1px solid var(--line);padding-top:10px}

.rc-content{flex:1;min-width:0;padding:28px 32px 48px;max-width:1100px}
.rc-ph{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px}
.rc-ph h1{font-size:24px}.rc-ph p{margin:4px 0 0;color:var(--mut)}
.rc-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:16px}
.rc-card h3{font-size:16px;margin-bottom:12px}
.rc-narrow{max-width:560px}
.rc-muted{color:var(--mut);margin:8px 0}.rc-muted.c{text-align:center;padding:16px 0}
.rc-two{display:grid;grid-template-columns:1fr 1fr;gap:16px}.rc-two .rc-card{margin:0}.rc-two{margin-bottom:16px}
@media(max-width:900px){.rc-two{grid-template-columns:1fr}.rc-side{width:70px}.rc-nav span,.rc-nav i{display:none}.rc-content{padding:20px 14px}.rc-clock{display:none}}

.rc-hello{background:#fff;border:1px solid var(--line);border-left:4px solid var(--teal);border-radius:12px;padding:16px 20px;margin-bottom:16px}
.rc-hello b{display:block;font-size:17px}.rc-hello span{color:var(--mut)}
.rc-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:16px}
.rc-stat{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 20px}
.rc-stat small{font-size:13px}.rc-stat b{font-size:32px;line-height:1.2}
.rc-doc{display:flex;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}.rc-doc:first-of-type{border-top:0}
.rc-doc-r{margin-left:auto;text-align:right}
.rc-dot{width:10px;height:10px;border-radius:50%;flex:none}.rc-dot.green{background:#16a34a}.rc-dot.amber{background:#f59e0b}
.rc-action{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;margin-bottom:12px}
.rc-line{display:flex;gap:16px;padding:10px 0;border-top:1px solid var(--line)}.rc-line time{color:var(--mut);width:46px;font-variant-numeric:tabular-nums}.rc-line span{width:150px;color:var(--mut)}

.rc-btn{border:1px solid transparent;border-radius:10px;padding:10px 18px;font-weight:700;font-size:14px;display:inline-flex;align-items:center;gap:8px;justify-content:center}
.rc-btn.main{background:var(--teal);color:#fff}.rc-btn.main:hover:not(:disabled){background:var(--teal-d)}
.rc-btn.ghost{background:#fff;color:var(--ink);border-color:#d5dde3}.rc-btn.ghost:hover{background:#f5f8f9}
.rc-btn:disabled{background:#cbd5e1;color:#fff;cursor:not-allowed}
.rc-live{width:8px;height:8px;border-radius:50%;background:#16a34a}
.rc-badge{display:inline-block;border-radius:99px;padding:3px 11px;font-size:12px;font-weight:700;white-space:nowrap}
.rc-badge.green{background:#dcfce7;color:#166534}.rc-badge.yellow{background:#fef9c3;color:#854d0e}
.rc-badge.amber{background:#ffedd5;color:#9a3412}.rc-badge.grey{background:#eef1f4;color:#475569}.rc-badge.big{font-size:13px;padding:6px 14px}

.rc-table{width:100%;border-collapse:collapse}
.rc-table th{text-align:left;font-size:12px;color:var(--mut);font-weight:600;padding:10px 12px;border-bottom:1px solid var(--line)}
.rc-table td{padding:12px;border-bottom:1px solid var(--line);vertical-align:middle}
.rc-table tr:last-child td{border-bottom:0}.rc-table tr.hl td{background:#f0fdf4}
.rc-table.clickable tbody tr{cursor:pointer}.rc-table.clickable tbody tr:hover td{background:#f5faf9}
.rc-qh{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.rc-filters{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.rc-in{border:1px solid #d5dde3;border-radius:10px;padding:10px 12px;font-family:inherit;font-size:14px;background:#fff}.rc-in.grow{flex:1;min-width:200px}

.rc-field{display:block;font-weight:600;margin-top:14px}
.rc-field input,.rc-field textarea{display:block;width:100%;margin-top:6px;border:1px solid #d5dde3;border-radius:10px;padding:11px 12px;font-family:inherit;font-size:14.5px;font-weight:400;resize:vertical}
.rc-rfid{text-align:center;padding:18px 0 8px}.rc-rfid b{display:block;font-size:18px;margin-top:14px;letter-spacing:.5px}.rc-rfid .rc-btn{margin-top:14px}
.rc-rfid-ring{width:84px;height:84px;border-radius:50%;margin:0 auto;display:grid;place-items:center;color:var(--teal);background:var(--teal-l);border:2px dashed #8fd0c6}
.rc-or{display:flex;align-items:center;gap:12px;color:var(--mut);margin:18px 0 2px}.rc-or::before,.rc-or::after{content:"";flex:1;height:1px;background:var(--line)}
.rc-pick{display:block;width:100%;text-align:left;margin-top:8px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 14px}.rc-pick:hover{border-color:var(--teal);background:var(--teal-l)}
.rc-ident{display:flex;align-items:center;gap:8px;color:#166534;font-weight:700}
.rc-tick{width:22px;height:22px;border-radius:50%;background:#16a34a;color:#fff;display:grid;place-items:center}
.rc-name{font-size:24px;margin:10px 0 4px}.rc-name.sm{font-size:19px;margin:12px 0 2px}
.rc-warn{margin-top:12px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:10px;padding:10px 12px}
.rc h4{margin:22px 0 8px;font-size:13px;color:var(--mut);font-weight:700}
.rc-docs{display:flex;flex-direction:column;gap:10px}
.rc-docpick{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:#fff;border:1.5px solid var(--line);border-radius:10px;padding:12px 14px}
.rc-docpick em{margin-left:auto;font-style:normal;font-weight:700;color:var(--mut)}
.rc-docpick.on{border-color:var(--teal);background:var(--teal-l)}
.rc-act{display:flex;gap:10px;justify-content:flex-end;margin-top:22px;flex-wrap:wrap}
.rc-kv{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid var(--line)}.rc-kv span{color:var(--mut)}.rc-kv b{text-align:right;font-weight:600}
.rc-ok{color:#166534;font-weight:600;margin:14px 0 0}

.rc-rxcard{display:flex;justify-content:space-between;align-items:center;gap:16px}.rc-rxcard h3{margin-bottom:4px}
.rc-meds-n{margin:10px 0 0;font-weight:700;color:var(--teal)}
.rc-modal,.rc-drawer-bg{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:50;display:grid;place-items:center;padding:16px}
.rc-dialog{background:#fff;border-radius:14px;padding:24px;width:100%;max-width:520px;max-height:92vh;overflow:auto}
.rc-dh{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.rc-dh h2{font-size:20px}
.rc-x{border:0;background:#f1f5f9;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:var(--mut)}
.rc-med{border:1px solid var(--line);border-radius:10px;padding:11px 14px;margin-bottom:8px}.rc-med b{display:block}
.rc-radio{display:flex;align-items:center;gap:10px;padding:6px 0;font-weight:500}.rc-radio input{accent-color:var(--teal);width:17px;height:17px}
.rc-drawer-bg{display:flex;justify-content:flex-end;padding:0}
.rc-drawer{background:#fff;width:100%;max-width:440px;height:100%;padding:24px;overflow:auto}
.rc-log{display:flex;gap:18px;padding:14px 0;border-top:1px solid var(--line)}.rc-log:first-of-type{border-top:0}
.rc-log time{color:var(--mut);width:46px;font-variant-numeric:tabular-nums}.rc-log b{font-size:13px;letter-spacing:.3px}
.rc-toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:13px 20px;border-radius:12px;font-weight:600;z-index:80}
@media print{.rc-top,.rc-side,.rc-content>*:not(.rc-modal),.rc-toast,.rc-act,.rc-x{display:none!important}.rc-modal{position:static;background:none}.rc-dialog{max-height:none}}
`;