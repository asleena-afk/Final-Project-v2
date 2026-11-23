export const STATUSES = [
  ["todo", "To Do"],
  ["in_progress", "In Progress"],
  ["pending_review", "Pending Review"],
  ["done", "Done"],
];
export const STATUS_LABEL = Object.fromEntries(STATUSES);
export const STATUS_COLOR = { todo: "#64748b", in_progress: "#3b82f6", pending_review: "#f59e0b", done: "#10b981" };
export const PRIORITIES = [["high", "High"], ["medium", "Medium"], ["low", "Low"]];
export const PRIORITY_LABEL = Object.fromEntries(PRIORITIES);

// Same mapping as backend/app/services/stages.py
export const STAGE_TO_STATUS = {
  "NEW / CLARIFICATION": "todo",
  "FOR DEVELOPMENT": "todo",
  "PENDING DEV ASSIGNMENT": "todo",
  "DEVELOPMENT IN PROGRESS": "in_progress",
  "FOR CODE MERGE & DEPLOYMENT": "in_progress",
  "TEST FAILED": "in_progress",
  "FOR TESTING": "pending_review",
  "FOR UAT DEPLOYMENT": "pending_review",
  "UAT FIXPACK": "pending_review",
  "FOR PROD DEPLOYMENT": "pending_review",
  CLOSED: "done",
};
export const STAGES = Object.keys(STAGE_TO_STATUS);

export const PROJECT_STATUSES = [["active", "Active"], ["on_hold", "On hold"], ["done", "Done"]];
export const HEALTHS = [["green", "Green"], ["amber", "Amber"], ["red", "Red"]];
export const HEALTH_COLOR = { green: "#10b981", amber: "#f59e0b", red: "#ef4444" };

export const ASSIGNABLE_ROLES = ["BA", "Dev", "QA", "Infra"];
export const ROLE_COLOR = { PM: "#7c3aed", BA: "#0891b2", Dev: "#2563eb", QA: "#db2777", Infra: "#ea580c" };

// Project accent colours, picked by name so a project looks the same everywhere.
const ACCENTS = ["#6366f1", "#06b6d4", "#f59e0b", "#ec4899", "#10b981", "#f97316", "#8b5cf6", "#14b8a6"];
export const accent = (s = "") => ACCENTS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % ACCENTS.length];
