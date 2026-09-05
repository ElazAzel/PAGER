"use client";

import { RecoveryScreen } from "./recovery/recovery-screen";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <html lang="ru"><head><title>PAGER</title><meta name="robots" content="noindex, nofollow" /></head>
    <body style={{ margin: 0 }}><RecoveryScreen kind="failed" retry={retry} /></body>
  </html>;
}
