import { HomeScreen } from "./ui/pager-shell";
import { getCapabilities } from "@/lib/server/capabilities";
export const dynamic = "force-dynamic";

export default function HomePage() {
  const capabilities = getCapabilities();
  return <HomeScreen demoEnabled={capabilities.demo} creatorSignup={capabilities.creatorSignup} />;
}
