import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog behavior:
 *  - moves focus into the dialog when it opens,
 *  - closes on Escape,
 *  - (modal only) keeps Tab / Shift+Tab inside the dialog,
 *  - returns focus to whatever opened it when it closes.
 */
export function useDialog(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  { modal, fallbackFocus = "#camera-search" }: { modal: boolean; fallbackFocus?: string },
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const opener = document.activeElement as HTMLElement | null;

    const first = node.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (!modal || e.key !== "Tab") return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      // Focus can sit on the dialog itself (tabIndex=-1, e.g. after clicking its
      // text); treat that like being at an edge so Tab can't escape the modal.
      const cur = document.activeElement as HTMLElement | null;
      const onItem = cur != null && items.includes(cur);
      if (e.shiftKey && (cur === firstEl || !onItem)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (cur === lastEl || !onItem)) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      // Return focus to the opener; if it's gone (e.g. the list item was filtered
      // away), fall back to a stable control rather than dropping to <body>.
      if (opener && document.contains(opener)) opener.focus();
      else document.querySelector<HTMLElement>(fallbackFocus)?.focus();
    };
  }, [ref, modal, fallbackFocus]);
}
