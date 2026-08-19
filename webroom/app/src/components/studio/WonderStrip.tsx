"use client";

import { CREATIVE_SPARKS, type CreativeSparkId } from "@/lib/creativeSparks";

interface Props {
  onSpark: (id: CreativeSparkId) => void;
  disabled?: boolean;
}

export function WonderStrip({ onSpark, disabled }: Props) {
  return (
    <section className="wonder-strip" aria-label="Creative sparks">
      <div className="wonder-strip-header">
        <p className="wonder-strip-kicker mono">Wonder</p>
        <p className="wonder-strip-lead">
          Get lost in the decorating — not in the menus. Tap a spark, watch the preview, keep going.
        </p>
      </div>
      <div className="wonder-spark-row">
        {CREATIVE_SPARKS.map((spark) => (
          <button
            key={spark.id}
            type="button"
            className="wonder-spark"
            disabled={disabled}
            title={spark.hint}
            onClick={() => onSpark(spark.id)}
          >
            <span className="wonder-spark-label">{spark.label}</span>
            <span className="wonder-spark-hint">{spark.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
