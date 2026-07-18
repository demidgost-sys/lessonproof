import type { CheckStatus } from "../types";

interface StatusIconProps {
  status: CheckStatus;
}

export function StatusIcon({ status }: StatusIconProps) {
  const label = status === "pass" ? "Passed" : status === "fail" ? "Failed" : "Pending";

  return (
    <span className={`status-icon status-icon--${status}`} role="img" aria-label={label}>
      {status === "pass" ? "✓" : status === "fail" ? "!" : "·"}
    </span>
  );
}
