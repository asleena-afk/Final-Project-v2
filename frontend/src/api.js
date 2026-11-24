import { supabase } from "./supabase";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const TASK_CHANGED_EVENT = "task-changed";

export function subscribeTaskChanges(listener) {
  window.addEventListener(TASK_CHANGED_EVENT, listener);
  return () => window.removeEventListener(TASK_CHANGED_EVENT, listener);
}

function notifyTaskChanged() {
  window.dispatchEvent(new Event(TASK_CHANGED_EVENT));
}

function message(data, status) {
  const d = data && data.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => `${(e.loc || []).slice(1).join(".") || "field"}: ${e.msg}`).join("; ");
  return `Something went wrong (${status})`;
}

async function token() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession(); // refreshed automatically when close to expiry
  return data.session?.access_token ?? null;
}

async function request(path, { method = "GET", body, form, blob } = {}) {
  const headers = {};
  const t = await token();
  if (t) headers.Authorization = `Bearer ${t}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  } catch {
    throw new Error("Cannot reach the server. Is the backend running?");
  }
  if (res.status === 401 && t) {
    await supabase.auth.signOut();
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    throw new Error(message(data, res.status));
  }
  if (res.status === 204) return null;
  return blob ? res.blob() : res.json();
}

export const api = {
  get: (p) => request(p),
  async post(p, body) {
    const result = await request(p, { method: "POST", body });
    if (p === "/tasks" || /^\/tasks\/[^/]+\/restore$/.test(p)) notifyTaskChanged();
    return result;
  },
  put: (p, body) => request(p, { method: "PUT", body }),
  async patch(p, body) {
    const result = await request(p, { method: "PATCH", body });
    if (/^\/tasks\/[^/]+$/.test(p)) notifyTaskChanged();
    return result;
  },
  async del(p) {
    const result = await request(p, { method: "DELETE" });
    if (/^\/tasks\/[^/]+/.test(p)) notifyTaskChanged();
    return result;
  },
  upload: (p, form) => request(p, { method: "POST", form }),
  async download(p, filename) {
    const blob = await request(p, { blob: true });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },
};

export const qs = (obj) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined && v !== false) p.set(k, v);
  });
  return p.toString();
};
