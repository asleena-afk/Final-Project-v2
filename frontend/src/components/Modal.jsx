import { useEffect } from "react";

export default function Modal({ title, onClose, children, wide, titleClassName = "" }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { width: "min(820px,100%)" } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <h2 className={titleClassName}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
