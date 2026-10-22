// The family plan's state, kept by the Immigration tab (so answers survive
// switching views) and apart from the tool itself, which loads only when opened.
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { emptyPlan, hasContent, type PlanState } from "../../help/family-plan";

/** Warns before the page is closed or reloaded while anything is typed, since it
 *  can't be recovered, and erases it when the page is left. */
export function useFamilyPlan(): [
  PlanState,
  Dispatch<SetStateAction<PlanState>>,
] {
  const [plan, setPlan] = useState<PlanState>(emptyPlan);
  const dirty = hasContent(plan);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    // On a shared computer, Back must not bring the plan back from the page cache.
    const forget = () => setPlan(emptyPlan());
    window.addEventListener("beforeunload", warn);
    window.addEventListener("pagehide", forget);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pagehide", forget);
    };
  }, [dirty]);
  return [plan, setPlan];
}
