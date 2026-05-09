import { redirect } from "next/navigation";

// The product's true entry point is Stage 1 — the Threshold.
// Marketing landing remains at the repo-root /index.html (served separately).
export default function RootPage() {
  redirect("/threshold");
}
