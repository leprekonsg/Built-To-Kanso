import Link from "next/link";
import type { TemplateId } from "@/server/geometry/types";
import styles from "./GeometryReviewNotice.module.css";

export default function GeometryReviewNotice({ templateId }: { templateId: TemplateId }) {
  return (
    <section className={styles.notice} aria-labelledby="geometry-review-title" data-testid="geometry-review-required">
      <h1 id="geometry-review-title">This layout needs a source review.</h1>
      <p>The drawing and its digitisation have not been verified. Recommendations, simulation and shareable presentation images are paused.</p>
      <p>Provide the dimensioned drawing with its variant, page and revision, then record a geometry review. A render cannot verify the source plan.</p>
      <p>Source authenticity, geometric accuracy, as-built confirmation and renovation approval are separate checks. None is implied by this preview.</p>
      <p><a href={`/api/templates/${templateId}/geometry`}>Inspect the diagnostic geometry and review status</a></p>
      <Link href="/threshold">Back to Threshold</Link>
    </section>
  );
}
