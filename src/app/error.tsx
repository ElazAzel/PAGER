"use client";

import { RecoveryScreen } from "./recovery/recovery-screen";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RecoveryScreen kind="failed" retry={retry} />;
}
