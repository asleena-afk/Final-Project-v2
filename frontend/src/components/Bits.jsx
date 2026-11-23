import { HEALTH_COLOR, PRIORITY_LABEL, ROLE_COLOR, STATUS_COLOR, STATUS_LABEL, accent } from "../constants";
import { initials } from "../util";

export const StatusPill = ({ status }) => (
  <span className="pill" style={{ background: `${STATUS_COLOR[status]}1f`, color: STATUS_COLOR[status] }}>
    <span className="dot" style={{ background: STATUS_COLOR[status] }} />{STATUS_LABEL[status]}
  </span>
);
export const PriorityPill = ({ priority }) => <span className={`pill p-${priority}`}>{PRIORITY_LABEL[priority]}</span>;
export const HealthDot = ({ health }) => (
  <span className="pill" style={{ background: `${HEALTH_COLOR[health]}22`, color: HEALTH_COLOR[health] }}>
    <span className="dot" style={{ background: HEALTH_COLOR[health] }} />{health[0].toUpperCase() + health.slice(1)}
  </span>
);
export const RoleTag = ({ role }) => <span className="role-tag" style={{ background: ROLE_COLOR[role] || "#64748b" }}>{role}</span>;
export const Avatar = ({ name, large }) => (
  <span className={`avatar${large ? " lg" : ""}`} style={{ background: accent(name) }} title={name}>{initials(name)}</span>
);
export function Progress({ done = 0, in_progress = 0, pending_review = 0, total = 0 }) {
  const pct = (n) => (total ? (100 * n) / total : 0);
  return (
    <div className="progress" title={`${done}/${total} done`}>
      <span style={{ width: `${pct(done)}%`, background: STATUS_COLOR.done }} />
      <span style={{ width: `${pct(pending_review)}%`, background: STATUS_COLOR.pending_review }} />
      <span style={{ width: `${pct(in_progress)}%`, background: STATUS_COLOR.in_progress }} />
    </div>
  );
}
export const Empty = ({ children }) => <div className="empty">{children}</div>;
export const ErrorText = ({ error }) => (error ? <p className="err">{error}</p> : null);
