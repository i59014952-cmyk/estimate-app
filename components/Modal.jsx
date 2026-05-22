function KHModal({ open, onClose, title, subtitle, children, wide }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="kh-backdrop" onClick={onClose}>
      <div className={"kh-modal" + (wide ? " kh-modal--wide" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="kh-modal__head">
          <div>
            <div className="kh-modal__title">{title}</div>
            {subtitle && <div className="kh-modal__sub">{subtitle}</div>}
          </div>
          <button className="kh-modal__close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        <div className="kh-modal__body">{children}</div>
      </div>
    </div>
  );
}
window.KHModal = KHModal;
