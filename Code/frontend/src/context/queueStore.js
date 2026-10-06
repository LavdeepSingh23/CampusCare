// src/queueStore.js  (v2)
// Shared data for the Doctor workstation AND the Receptionist desk.
// Syncs live between browser tabs through localStorage. When you add a real backend,
// keep these function names and replace their bodies with API / socket calls.
//
// Visit status flow:
//   waiting  -> cabin (doctor pressed Call Next = "In consultation")
//            -> done  (doctor pressed Complete Consultation = "Awaiting medicine")
//            -> dispensed (reception confirmed dispensing = "Completed")

import { useEffect, useState } from "react";

const KEY = "campuscare_queue_v2";
const ago = (m) => Date.now() - m * 60000;

export const DOCTORS = [
  { id: "kapoor", name: "Dr Kapoor", role: "General Physician", room: "Room 104" },
  { id: "singh", name: "Dr Singh", role: "Specialist", room: "Room 105" },
];

export const DIRECTORY = [
  { rollNo: "102403001", name: "Neha Kapoor", dept: "CSE", program: "B.Tech", semester: 5, phone: "98765 43210", email: "nkapoor_be24@thapar.edu", blood: "B+", allergies: "Penicillin, Dust mites", conditions: "Mild childhood asthma", meds: "Cetirizine 10mg (as needed)" },
  { rollNo: "102403112", name: "Kriti Sharma", dept: "ECE", program: "B.Tech", semester: 5, phone: "98123 45678", email: "ksharma_be24@thapar.edu", blood: "B+", allergies: "Dust / Pollen (mild)", conditions: "None", meds: "None" },
  { rollNo: "102403205", name: "Damanpreet Singh", dept: "ME", program: "B.Tech", semester: 5, phone: "97011 22334", email: "dsingh_be24@thapar.edu", blood: "O+", allergies: "None known", conditions: "None", meds: "None" },
  { rollNo: "102403348", name: "Matha Naparin", dept: "CSE", program: "B.Tech", semester: 5, phone: "99150 11223", email: "mnaparin_be24@thapar.edu", blood: "A+", allergies: "Nickel", conditions: "None", meds: "None" },
  { rollNo: "102403150", name: "Rahul Kumar", dept: "ECE", program: "B.Tech", semester: 3, phone: "98880 99001", email: "rkumar_be25@thapar.edu", blood: "AB+", allergies: "None known", conditions: "None", meds: "None" },
  { rollNo: "102403160", name: "Simran Kaur", dept: "CSE", program: "B.Tech", semester: 3, phone: "98760 55443", email: "skaur_be25@thapar.edu", blood: "O-", allergies: "Sulfa drugs", conditions: "Migraine", meds: "None" },
  { rollNo: "102403177", name: "Arjun Mehta", dept: "ME", program: "B.Tech", semester: 7, phone: "97790 33221", email: "amehta_be23@thapar.edu", blood: "B-", allergies: "None known", conditions: "None", meds: "None" },
  { rollNo: "102403499", name: "Simar Singh", dept: "CSE", program: "B.Tech", semester: 5, phone: "98555 77889", email: "ssingh_be24@thapar.edu", blood: "A+", allergies: "None known", conditions: "Acidity", meds: "None" },
  { rollNo: "102403230", name: "Ishaan Verma", dept: "ECE", program: "B.Tech", semester: 7, phone: "98100 20304", email: "iverma_be23@thapar.edu", blood: "O+", allergies: "None known", conditions: "None", meds: "None" },
  { rollNo: "102403260", name: "Pooja Rani", dept: "CSE", program: "B.Tech", semester: 1, phone: "98720 66778", email: "prani_be26@thapar.edu", blood: "B+", allergies: "Latex", conditions: "None", meds: "None" },
];

const V = (id, rollNo, doctorId, queueNo, status, extra) => {
  const s = DIRECTORY.find((d) => d.rollNo === rollNo);
  return { id, rollNo, name: s.name, allergy: s.allergies, doctorId, queueNo, status, via: "RFID", ...extra };
};

function makeSeed() {
  return {
    visits: [
      V(1, "102403001", "kapoor", 1, "cabin", { complaint: "Seasonal allergic rhinitis & dry cough", checkedIn: ago(40), cabinAt: ago(3) }),
      V(2, "102403112", "kapoor", 2, "waiting", { complaint: "Sports injury, right ankle sprain", checkedIn: ago(22) }),
      V(3, "102403205", "kapoor", 3, "waiting", { complaint: "Routine hostel medical clearance & vision test", checkedIn: ago(16) }),
      V(4, "102403348", "kapoor", 4, "waiting", { complaint: "Contact dermatitis on wrist", checkedIn: ago(9) }),
      V(5, "102403230", "singh", 1, "dispensed", { complaint: "Cough & cold", checkedIn: ago(95), doneAt: ago(70), dispensedAt: ago(62), rxNo: 1041, rx: [{ med: "Cetirizine 10mg", freq: "0-0-1", days: 3, qty: 3, note: "Night" }], dispensing: { type: "Dispensed as prescribed", remarks: "" } }),
      V(6, "102403177", "singh", 2, "done", { complaint: "Fever and body ache", checkedIn: ago(48), doneAt: ago(6), rxNo: 1042, diagnosis: "Viral fever", advice: "Rest, fluids. Review if fever lasts 48h.", rx: [{ med: "Paracetamol 500mg", freq: "1-0-1", days: 3, qty: 6, note: "After meals" }, { med: "Oral Rehydration Salts", freq: "SOS", days: 2, qty: 4, note: "In water" }] }),
      V(7, "102403499", "singh", 3, "done", { complaint: "Acidity", checkedIn: ago(40), doneAt: ago(2), rxNo: 1043, diagnosis: "Hyperacidity", advice: "Avoid spicy food.", rx: [{ med: "Pantoprazole 40mg", freq: "1-0-0", days: 5, qty: 5, note: "Before breakfast" }] }),
      V(8, "102403150", "singh", 4, "waiting", { complaint: "Headache", checkedIn: ago(19) }),
      V(9, "102403160", "singh", 5, "waiting", { complaint: "Migraine", checkedIn: ago(11) }),
    ],
    log: [
      { t: ago(2), kind: "CONSULTATION COMPLETED", text: "Simar Singh • Rx #1043" },
      { t: ago(3), kind: "CONSULTATION STARTED", text: "Neha Kapoor • Dr Kapoor" },
      { t: ago(9), kind: "RFID CHECK-IN", text: "Matha Naparin • Roll 102403348" },
    ],
  };
}

let mem = null; // in-memory copy: keeps the app working even if localStorage is blocked
function read() {
  try { const raw = localStorage.getItem(KEY); if (raw) { mem = JSON.parse(raw); return mem; } } catch (e) { /* ignore */ }
  if (!mem) mem = makeSeed();
  return mem;
}
function write(state) {
  mem = state;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  window.dispatchEvent(new Event("campuscare-queue"));
}
function mutate(fn) {
  const s = JSON.parse(JSON.stringify(read()));
  fn(s);
  write(s);
}
const addLog = (s, kind, text) => { s.log = [{ t: Date.now(), kind, text }, ...(s.log || [])].slice(0, 60); };
const ACTIVE = ["waiting", "cabin", "done"];

/* ------------------------------ actions ------------------------------ */

// RECEPTION · Student Check-in. Returns { queueNo, position, doctorId } or null if already checked in.
export function checkInStudent({ rollNo, doctorId, complaint = "", via = "RFID" }) {
  let result = null;
  mutate((s) => {
    const st = DIRECTORY.find((d) => d.rollNo === rollNo);
    if (!st || s.visits.some((v) => v.rollNo === rollNo && ACTIVE.includes(v.status))) return;
    const id = Math.max(0, ...s.visits.map((v) => v.id)) + 1;
    const queueNo = s.visits.filter((v) => v.doctorId === doctorId).length + 1;
    s.visits.push({ id, rollNo, name: st.name, allergy: st.allergies, doctorId, queueNo, status: "waiting", complaint: complaint || "OPD consultation", checkedIn: Date.now(), via });
    const position = s.visits.filter((v) => v.doctorId === doctorId && (v.status === "waiting" || v.status === "cabin")).length;
    addLog(s, via === "RFID" ? "RFID CHECK-IN" : "MANUAL CHECK-IN", `${st.name} • Roll ${rollNo}`);
    result = { queueNo, position, doctorId };
  });
  return result;
}

// DOCTOR dashboard · "Call Next Student". Pass the doctor's id, e.g. callNext("kapoor").
// Returns false if that doctor's cabin is occupied or nobody is waiting.
export function callNext(doctorId = "kapoor") {
  let ok = false;
  mutate((s) => {
    if (s.visits.some((v) => v.doctorId === doctorId && v.status === "cabin")) return;
    const next = s.visits.filter((v) => v.doctorId === doctorId && v.status === "waiting").sort((a, b) => a.checkedIn - b.checkedIn)[0];
    if (!next) return;
    next.status = "cabin";
    next.cabinAt = Date.now();
    const doc = DOCTORS.find((d) => d.id === doctorId);
    addLog(s, "CONSULTATION STARTED", `${next.name} • ${doc?.name}`);
    ok = true;
  });
  return ok;
}

// DOCTOR prescription page · "Complete Consultation & Send to Dispensary"
// rx = [{ med, freq, days, qty, note }]
export function completeConsultation(id, { rx = [], diagnosis = "", advice = "" } = {}) {
  mutate((s) => {
    const v = s.visits.find((x) => x.id === id);
    if (!v) return;
    v.status = "done";
    v.doneAt = Date.now();
    v.rx = rx; v.diagnosis = diagnosis; v.advice = advice;
    v.rxNo = Math.max(1040, ...s.visits.map((x) => x.rxNo || 0)) + 1;
    addLog(s, "CONSULTATION COMPLETED", `${v.name} • Rx #${v.rxNo}`);
  });
}

// RECEPTION · Dispensing. type: "Dispensed as prescribed" | "Partially dispensed" | "Substituted"
export function dispense(id, { type = "Dispensed as prescribed", remarks = "" } = {}) {
  mutate((s) => {
    const v = s.visits.find((x) => x.id === id);
    if (!v) return;
    v.status = "dispensed";
    v.dispensedAt = Date.now();
    v.dispensing = { type, remarks };
    addLog(s, "DISPENSING COMPLETED", `${v.name} • Rx #${v.rxNo}`);
  });
}

export function logAction(kind, text) { mutate((s) => addLog(s, kind, text)); }
export function resetDemo() { write(makeSeed()); }

/* ------------------------------- hook -------------------------------- */

export function useQueue() {
  const [state, setState] = useState(read);
  useEffect(() => {
    const sync = () => setState(read());
    window.addEventListener("storage", sync);
    window.addEventListener("campuscare-queue", sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("campuscare-queue", sync); };
  }, []);
  return { visits: state.visits, students: state.visits, log: state.log }; // `students` kept as an alias
}