import type { CheckStatus } from "../types";

interface StatusIconProps {
  status: CheckStatus;
}

export function StatusIcon({ status }: StatusIconProps) {
  const label = status === "pass" ? "Passed" : status === "fail" ? "Failed" : "Pending";

  return (
    <span className={`status-icon status-icon--${status}`} aria-label={label}>
      {status === "pass" ? "Pass" : status === "fail" ? "Fail" : "Wait"}
    </span>
  );
}
