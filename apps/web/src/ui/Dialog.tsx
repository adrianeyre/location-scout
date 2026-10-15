import { useEffect, useId, useRef, type ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** What the close button says to a screen reader, such as "Close cookie policy". */
  closeLabel: string;
  children: ReactNode;
  /** Kept in place under the body, which scrolls on its own, such as a Done button. */
  footer?: ReactNode;
}

/**
 * A modal dialog on the platform's own `<dialog>`: a title, a close cross
 * at the top right, a body that scrolls both ways when its content is too
 * big, and an optional footer that stays put. It moves focus in, keeps it
 * there, closes on Escape and on the backdrop, and hands focus back to
 * whatever opened it. Everything behind it is inert while it is open.
 */
export const Dialog = ({
  open,
  onClose,
  title,
  closeLabel,
  children,
  footer,
}: DialogProps) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const returnTo = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnTo.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      // Where showModal is missing (jsdom), the dialog still opens, just not modally.
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    if (!open && returnTo.current) {
      returnTo.current.focus();
      returnTo.current = null;
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      // Escape: the platform's `cancel`, or the key itself where there is no platform dialog.
      onCancel={(event) => {
        event.preventDefault();
        closeRef.current();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeRef.current();
        }
      }}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(event) => {
        if (event.target === event.currentTarget) closeRef.current();
      }}
    >
      {open && (
        <>
          <div className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            <button
              type="button"
              className="icon-button"
              aria-label={closeLabel}
              data-autofocus
              onClick={onClose}
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          {/* Focusable, so its scroll bars can be moved with the keyboard (WCAG 2.1.1). */}
          <div
            className="dialog-body"
            role="region"
            aria-labelledby={titleId}
            tabIndex={0}
          >
            {children}
          </div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
};
