// src/lib/link-prefs.ts — préférences locales d'affichage des liens streaming.
//
// Pas de compte à connecter en mode gratuit : un simple switch par service
// contrôle la visibilité des boutons de liens sur le lecteur.
// Stockage localStorage (par navigateur) + event pour synchro inter-composants.

export interface LinkPrefs {
  /** Affiche les boutons « Open in Apple Music » (recherche iTunes gratuite). */
  appleLinks: boolean;
}

const STORAGE_KEY = "melomania:link-prefs";
export const LINK_PREFS_EVENT = "melomania:link-prefs-changed";

const DEFAULTS: LinkPrefs = { appleLinks: true };

export function getLinkPrefs(): LinkPrefs {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      appleLinks: parsed.appleLinks !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setLinkPrefs(patch: Partial<LinkPrefs>): LinkPrefs {
  const next: LinkPrefs = { ...getLinkPrefs(), ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(LINK_PREFS_EVENT, { detail: next }));
  } catch {}
  return next;
}

/** Hook React minimal (sans dépendance) pour suivre les prefs en live. */
import { useEffect, useState } from "react";
export function useLinkPrefs(): [LinkPrefs, (patch: Partial<LinkPrefs>) => void] {
  const [prefs, setPrefs] = useState<LinkPrefs>(() => getLinkPrefs());
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as LinkPrefs | undefined;
      setPrefs(detail || getLinkPrefs());
    };
    window.addEventListener(LINK_PREFS_EVENT, onChange);
    return () => window.removeEventListener(LINK_PREFS_EVENT, onChange);
  }, []);
  return [prefs, (patch) => setPrefs(setLinkPrefs(patch))];
}
