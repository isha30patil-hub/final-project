// Global in-memory store for TestAI dummy data. Survives navigation, resets on reload.
import { useSyncExternalStore } from "react";

export type Project = {
  id: string;
  name: string;
  client: string;
  description: string;
  startDate: string;
  status: "Active" | "Planning" | "On Hold" | "Completed";
};

export type UploadedDoc = {
  id: string;
  name: string;
  size: string;
  project: string;
  status: "Uploaded" | "Processing" | "Extracted";
  extractedText?: string;
};

export type TestCase = {
  id: string;
  module: string;
  scenario: string;
  precondition: string;
  steps: string;
  data: string;
  expected: string;
  type: "Functional" | "Negative" | "Boundary" | "UI" | "Security";
  priority: "High" | "Medium" | "Low";
  status: "Draft" | "Approved" | "Passed" | "Failed" | "Blocked";
  actual?: string;
  comment?: string;
};

export type Defect = {
  id: string;
  testCaseId: string;
  module: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  description: string;
  status: "Open" | "In Progress" | "Resolved" | "Closed";
  assignedTo: string;
};

type State = {
  user: { name: string; email: string } | null;
  projects: Project[];
  documents: UploadedDoc[];
  testCases: TestCase[];
  defects: Defect[];
  selectedProjectId: string | null;
  selectedDocId: string | null;
};

const initialTestCases: TestCase[] = [
  { id: "TC-001", module: "Login", scenario: "Valid user login", precondition: "User account exists", steps: "1. Open /login\n2. Enter email\n3. Enter password\n4. Click Login", data: "demo@testai.io / Demo@123", expected: "User is redirected to dashboard", type: "Functional", priority: "High", status: "Draft" },
  { id: "TC-002", module: "Login", scenario: "Invalid password", precondition: "User account exists", steps: "1. Open /login\n2. Enter email\n3. Enter wrong password", data: "demo@testai.io / wrong", expected: "Error 'Invalid credentials' shown", type: "Negative", priority: "High", status: "Draft" },
  { id: "TC-003", module: "Registration", scenario: "New user signup", precondition: "Email not registered", steps: "1. Open /signup\n2. Fill form\n3. Submit", data: "new@testai.io", expected: "Account created, verification email sent", type: "Functional", priority: "High", status: "Draft" },
  { id: "TC-004", module: "Registration", scenario: "Duplicate email", precondition: "Email already exists", steps: "1. Submit signup with existing email", data: "demo@testai.io", expected: "Error 'Email already in use'", type: "Negative", priority: "Medium", status: "Draft" },
  { id: "TC-005", module: "Dashboard", scenario: "Dashboard cards render", precondition: "User logged in", steps: "1. Navigate to dashboard", data: "—", expected: "All KPI cards visible", type: "UI", priority: "Medium", status: "Draft" },
  { id: "TC-006", module: "Payment", scenario: "Successful credit card payment", precondition: "Item in cart", steps: "1. Checkout\n2. Enter card\n3. Pay", data: "4242 4242 4242 4242", expected: "Payment success, order created", type: "Functional", priority: "High", status: "Draft" },
  { id: "TC-007", module: "Payment", scenario: "Declined card", precondition: "Item in cart", steps: "1. Pay with declined card", data: "4000 0000 0000 0002", expected: "Error 'Card declined'", type: "Negative", priority: "High", status: "Draft" },
  { id: "TC-008", module: "Profile", scenario: "Update profile name", precondition: "Logged in", steps: "1. Open profile\n2. Edit name\n3. Save", data: "John Doe", expected: "Profile updated", type: "Functional", priority: "Medium", status: "Draft" },
  { id: "TC-009", module: "Profile", scenario: "Upload avatar", precondition: "Logged in", steps: "1. Click avatar\n2. Upload PNG", data: "avatar.png 2MB", expected: "Avatar updated", type: "Functional", priority: "Low", status: "Draft" },
  { id: "TC-010", module: "Login", scenario: "Logout clears session", precondition: "Logged in", steps: "1. Click logout", data: "—", expected: "Redirected to /login", type: "Functional", priority: "Medium", status: "Draft" },
];

const STORAGE_KEY = "testai.store.v1";

const defaultState: State = {
  user: null,
  projects: [
    { id: "P-001", name: "Acme Banking Portal", client: "Acme Corp", description: "Internet banking platform with payments and statements.", startDate: "2026-03-12", status: "Active" },
    { id: "P-002", name: "ShopWave E-Commerce", client: "ShopWave Ltd", description: "B2C marketplace with multi-vendor support.", startDate: "2026-01-08", status: "Active" },
    { id: "P-003", name: "HealthTrack Mobile", client: "MediCare Inc", description: "Patient mobile companion app — Android & iOS.", startDate: "2025-11-22", status: "On Hold" },
  ],
  documents: [
    { id: "D-001", name: "Acme_SRS_v2.4.pdf", size: "1.2 MB", project: "Acme Banking Portal", status: "Extracted", extractedText: "1. The system shall allow users to log in using email and password.\n2. The system shall lock accounts after 5 failed attempts.\n3. The dashboard shall display account balance, recent transactions, and quick-pay shortcuts.\n4. Payments shall support card, UPI, and net banking with OTP verification.\n5. The user profile module shall allow updating name, phone, and address." },
    { id: "D-002", name: "ShopWave_SOW.docx", size: "780 KB", project: "ShopWave E-Commerce", status: "Uploaded" },
  ],
  testCases: initialTestCases,
  defects: [
    { id: "DEF-001", testCaseId: "TC-002", module: "Login", severity: "High", description: "Error message disappears after 1s — too fast to read.", status: "Open", assignedTo: "Priya S." },
    { id: "DEF-002", testCaseId: "TC-006", module: "Payment", severity: "Critical", description: "Double-charge on rapid pay-button clicks.", status: "In Progress", assignedTo: "Rahul K." },
    { id: "DEF-003", testCaseId: "TC-009", module: "Profile", severity: "Low", description: "Avatar preview not refreshed without page reload.", status: "Resolved", assignedTo: "Aisha M." },
  ],
  selectedProjectId: "P-001",
  selectedDocId: "D-001",
};

function loadState(): State {
  if (typeof window === "undefined") return JSON.parse(JSON.stringify(defaultState));
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(defaultState));
    return { ...JSON.parse(JSON.stringify(defaultState)), ...JSON.parse(raw) };
  } catch {
    return JSON.parse(JSON.stringify(defaultState));
  }
}

const state: State = loadState();

const listeners = new Set<() => void>();
const persist = () => {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
};
const emit = () => { persist(); listeners.forEach((l) => l()); };

export const store = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setUser(u: State["user"]) {
    state.user = u;
    emit();
  },
  addProject(p: Omit<Project, "id">) {
    state.projects.unshift({ ...p, id: `P-${String(state.projects.length + 1).padStart(3, "0")}` });
    emit();
  },
  updateProject(id: string, patch: Partial<Project>) {
    const i = state.projects.findIndex((p) => p.id === id);
    if (i >= 0) state.projects[i] = { ...state.projects[i], ...patch };
    emit();
  },
  deleteProject(id: string) {
    state.projects = state.projects.filter((p) => p.id !== id);
    emit();
  },
  addDocument(d: Omit<UploadedDoc, "id">) {
    state.documents.unshift({ ...d, id: `D-${String(state.documents.length + 1).padStart(3, "0")}` });
    emit();
  },
  updateDocument(id: string, patch: Partial<UploadedDoc>) {
    const i = state.documents.findIndex((d) => d.id === id);
    if (i >= 0) state.documents[i] = { ...state.documents[i], ...patch };
    emit();
  },
  deleteDocument(id: string) {
    state.documents = state.documents.filter((d) => d.id !== id);
    emit();
  },
  setTestCases(cases: TestCase[]) {
    state.testCases = cases;
    emit();
  },
  updateTestCase(id: string, patch: Partial<TestCase>) {
    const i = state.testCases.findIndex((t) => t.id === id);
    if (i >= 0) state.testCases[i] = { ...state.testCases[i], ...patch };
    emit();
  },
  deleteTestCase(id: string) {
    state.testCases = state.testCases.filter((t) => t.id !== id);
    emit();
  },
  approveAll() {
    state.testCases = state.testCases.map((t) => (t.status === "Draft" ? { ...t, status: "Approved" } : t));
    emit();
  },
  addDefect(d: Omit<Defect, "id">) {
    state.defects.unshift({ ...d, id: `DEF-${String(state.defects.length + 1).padStart(3, "0")}` });
    emit();
  },
  updateDefect(id: string, patch: Partial<Defect>) {
    const i = state.defects.findIndex((d) => d.id === id);
    if (i >= 0) state.defects[i] = { ...state.defects[i], ...patch };
    emit();
  },
  setSelectedProject(id: string | null) {
    state.selectedProjectId = id;
    emit();
  },
  setSelectedDoc(id: string | null) {
    state.selectedDocId = id;
    emit();
  },
};

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get()),
  );
}
