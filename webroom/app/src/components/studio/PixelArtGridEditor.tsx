"use client";

import { useState } from "react";
import type { PixelArtPiece } from "@/lib/pageDocumentTypes";

const PAINT_COLORS = [
  "#000000",
  "#ffffff",
  "#e0526b",
  "#c7314b",
  "#2563eb",
  "#7fbe95",
  "#ff4db8",
  "#f5a623",
  "#8b5cf6",
  "#241b2e",
];

export function PixelArtGridEditor({
  piece,
  onChange,
}: {
  piece: PixelArtPiece;
  onChange: (pixels: PixelArtPiece["pixels"]) => void;
}) {
  const [paintColor, setPaintColor] = useState("#e0526b");
  const [eraser, setEraser] = useState(false);

  const setPixel = (index: number) => {
    const next = [...piece.pixels];
    next[index] = eraser ? "transparent" : paintColor;
    onChange(next as PixelArtPiece["pixels"]);
  };

  return (
    <div className="pixel-art-editor">
      <div className="pixel-art-tools" role="toolbar" aria-label="Pixel art tools">
        <div className="pixel-palette">
          {PAINT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={!eraser && paintColor === color ? "pixel-swatch active" : "pixel-swatch"}
              style={{ background: color }}
              aria-label={`Paint ${color}`}
              onClick={() => {
                setEraser(false);
                setPaintColor(color);
              }}
            />
          ))}
        </div>
        <button
          type="button"
          className={eraser ? "btn secondary pixel-eraser active" : "btn secondary pixel-eraser"}
          onClick={() => setEraser((e) => !e)}
        >
          Eraser
        </button>
      </div>
      <div
        className="studio-pixel-grid pixel-art-canvas-editor"
        style={{ gridTemplateColumns: `repeat(${piece.width}, 1fr)` }}
        role="group"
        aria-label="Click pixels to paint"
      >
        {piece.pixels.map((color, index) => (
          <button
            key={index}
            type="button"
            className="studio-pixel-cell pixel-art-cell"
            style={{
              background: color === "transparent" ? "var(--paper)" : color,
              boxShadow: color === "transparent" ? "inset 0 0 0 1px var(--line)" : undefined,
            }}
            aria-label={`Pixel ${index + 1}`}
            onClick={() => setPixel(index)}
          />
        ))}
      </div>
      <p className="studio-hint">Click to paint. Your imagination is the only limit — the grid is just the frame.</p>
    </div>
  );
}
