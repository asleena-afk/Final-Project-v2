export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const fmtDate = (s) =>
  s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
export const fmtDay = (s) =>
  new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
export const fmtDateTime = (s) =>
  new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
export const initials = (n = "?") => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
export const isOverdue = (t) => t.due_date && t.status !== "done" && String(t.due_date).slice(0, 10) < todayISO();
// Only send what changed: members may not send fields they cannot edit.
export function changed(before, after, fields) {
  const out = {};
  fields.forEach((f) => {
    const a = before?.[f] ?? null, b = after[f] ?? null;
    if (String(a ?? "") !== String(b ?? "")) out[f] = after[f] === "" ? null : after[f];
  });
  return out;
}
