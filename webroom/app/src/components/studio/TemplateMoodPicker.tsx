"use client";

import { TEMPLATE_MOODS } from "@/lib/creativeSparks";

interface Props {
  name?: string;
  defaultSelected?: string;
}

export function TemplateMoodPicker({ name = "template", defaultSelected }: Props) {
  return (
    <div className="template-mood-grid">
      {TEMPLATE_MOODS.map((mood, i) => (
        <label
          key={mood.id}
          className="template-mood-card"
        >
          <input
            type="radio"
            name={name}
            value={mood.id}
            defaultChecked={defaultSelected ? mood.id === defaultSelected : i === TEMPLATE_MOODS.length - 1}
            className="template-mood-radio"
          />
          <span className="template-mood-swatches" aria-hidden="true">
            <span style={{ background: mood.background }} />
            <span style={{ background: mood.accent }} />
          </span>
          <span className="template-mood-name">{mood.label}</span>
          <span className="template-mood-tagline">{mood.tagline}</span>
        </label>
      ))}
    </div>
  );
}
