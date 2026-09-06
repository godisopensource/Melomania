"use client";

// Petit switch on/off réutilisé (Services, Onboarding).

import React from "react";

export function ToggleSwitch({
  checked,
  onChange,
  label,
  activeClass = "bg-brand-500",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  /** Couleur à l'état on (ex. "bg-[#FC3C44]" pour Apple Music). */
  activeClass?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? activeClass : "bg-white/10"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
