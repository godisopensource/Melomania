// src/lib/playlist-sync.ts — diff non-destructif entre Melomania et YouTube Music.
//
// Principe : la version YouTube Music est la référence pour la *présence* ET
// l'*ordre* des morceaux, mais Melomania reste la référence pour toutes les
// données éditoriales (catégorie, mood/softness, critères custom, tags, notes, gaps).
// Donc la sync :
// - AJOUTE les morceaux manquants (jamais de suppression → aucune perte),
// - APPLIQUE le nouvel ordre YouTube… SAUF si ça éclaterait une catégorie
//   (les catégories doivent regrouper des morceaux consécutifs — même règle
//   que `wouldBreakChronology`). Ordre rejeté = ancien ordre conservé + rapport.
// - MET À JOUR les métadonnées brutes (titre/artiste/pochette/durée) des
//   morceaux existants SANS toucher aux champs curator,
// - SIGNALE les morceaux Melomania absents de YouTube (kept, à nettoyer à la main).

export interface SyncExistingRef {
  /** Id Melomania de la track. */
  resourceId: string;
  /** VideoId YouTube (externalId de la source youtube). */
  externalId: string;
}

export interface SyncFreshTrack {
  externalId: string;
}

export interface SyncDiff {
  /** Tracks YouTube absentes de Melomania → à créer. */
  toAdd: SyncFreshTrack[];
  /** Tracks déjà connues → simple refresh de métadonnées. */
  toKeep: { fresh: SyncFreshTrack; existing: SyncExistingRef }[];
  /** Tracks Melomania absentes de YouTube → conservées, juste signalées. */
  removedFromSource: SyncExistingRef[];
  /** ExternalIds YouTube dédupliqués, dans l'ordre de référence. */
  referenceOrder: string[];
  /** true quand les morceaux connus ne sont plus dans l'ordre de référence. */
  orderChanged: boolean;
}

/**
 * Diff pure (testable sans DB) : matche sur l'externalId YouTube uniquement,
 * jamais sur le titre (les titres peuvent changer / contenir des doublons).
 * Les doublons côté frais sont dédupliqués (premier gagne).
 * Précondition pour `orderChanged` : `existing` trié par sourcePosition croissant.
 */
export function diffPlaylistSync(
  existing: SyncExistingRef[],
  fresh: SyncFreshTrack[]
): SyncDiff {
  const existingByExt = new Map<string, SyncExistingRef>();
  for (const e of existing) {
    if (!e.externalId) continue;
    if (!existingByExt.has(e.externalId)) existingByExt.set(e.externalId, e);
  }

  const seenFresh = new Set<string>();
  const toAdd: SyncFreshTrack[] = [];
  const toKeep: SyncDiff["toKeep"] = [];
  const freshIds = new Set<string>();

  for (const f of fresh) {
    if (!f.externalId || seenFresh.has(f.externalId)) continue;
    seenFresh.add(f.externalId);
    freshIds.add(f.externalId);
    const match = existingByExt.get(f.externalId);
    if (match) {
      toKeep.push({ fresh: f, existing: match });
    } else {
      toAdd.push(f);
    }
  }

  const removedFromSource = existing.filter(
    (e) => e.externalId && !freshIds.has(e.externalId)
  );

  // Ordre de référence dédupliqué.
  const referenceOrder = [...seenFresh];

  // L'ordre a changé si les morceaux connus, lus dans l'ordre Melomania
  // (ordre du tableau `existing`, supposé trié par sourcePosition), ne
  // suivent plus l'ordre de référence. Comparaison sur les ids stables.
  const knownInRefOrder: string[] = [];
  for (const ext of referenceOrder) {
    const match = existingByExt.get(ext);
    if (match) knownInRefOrder.push(match.resourceId);
  }
  const knownInLocalOrder = existing
    .filter((e) => e.externalId && freshIds.has(e.externalId))
    .map((e) => e.resourceId);
  const orderChanged =
    knownInRefOrder.length === knownInLocalOrder.length &&
    knownInRefOrder.length > 1 &&
    knownInRefOrder.some((id, i) => id !== knownInLocalOrder[i]);

  return { toAdd, toKeep, removedFromSource, referenceOrder, orderChanged };
}

/**
 * Catégories qui ÉCLATERAIENT si on appliquait `positions` : même invariant
 * que `wouldBreakChronology` (chaque catégorie = positions consécutives),
 * mais en contrôle par lot — utilisé comme garde-fou avant un reorder de sync.
 * Retourne les catégories fautives avec leurs morceaux (triés par position).
 */
export function findChronologyViolations(
  tracks: Array<{ id: string; categoryId?: string | null; sourcePosition: number }>
): Array<{ categoryId: string; trackIds: string[] }> {
  const byCat = new Map<string, Array<{ id: string; pos: number }>>();
  for (const t of tracks) {
    if (!t.categoryId) continue;
    const arr = byCat.get(t.categoryId) ?? [];
    arr.push({ id: t.id, pos: t.sourcePosition ?? 0 });
    byCat.set(t.categoryId, arr);
  }
  const violations: Array<{ categoryId: string; trackIds: string[] }> = [];
  for (const [categoryId, arr] of byCat) {
    arr.sort((a, b) => a.pos - b.pos);
    let broken = false;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].pos - arr[i - 1].pos !== 1) {
        broken = true;
        break;
      }
    }
    if (broken) violations.push({ categoryId, trackIds: arr.map((x) => x.id) });
  }
  return violations;
}

/** Message résumé affiché après une sync (FR/EN neutre, géré côté UI). */
export function syncSummary(diff: { toAdd: unknown[]; toKeep: unknown[]; removedFromSource: unknown[] }): string {
  const parts: string[] = [];
  if ((diff.toAdd as unknown[]).length > 0) parts.push(`+${(diff.toAdd as unknown[]).length} added`);
  if ((diff.toKeep as unknown[]).length > 0) parts.push(`${(diff.toKeep as unknown[]).length} kept`);
  if ((diff.removedFromSource as unknown[]).length > 0)
    parts.push(`${(diff.removedFromSource as unknown[]).length} no longer on YouTube (kept)`);
  return parts.length > 0 ? parts.join(" · ") : "Already up to date";
}

/**
 * Recatégorisation automatique des morceaux DÉPLACÉS par une sync.
 *
 * Contexte : appliquer l'ordre YouTube de référence éclaterait parfois les
 * catégories (qui doivent regrouper des morceaux consécutifs). Au lieu de
 * refuser le reorder, on rattache chaque morceau déplacé à la bonne section
 * selon la règle :
 * - si les morceaux précédent ET suivant (dans l'ordre de référence, parmi
 *   les morceaux existants — les nouveaux placeholders, sans catégorie, ne
 *   servent jamais d'ancre) ont la même catégorie → cette catégorie
 *   (c'est aussi celle du précédent, les deux clauses coïncident) ;
 * - sinon → la catégorie du précédent ;
 * - déplacé en tête (pas de précédent) → la catégorie du suivant ;
 * - aucun voisin existant → conserve sa catégorie.
 *
 * Seuls les morceaux déplacés (`moved`) peuvent changer de catégorie ; les
 * autres gardent la leur. Ne touche à rien d'autre (ni scores, ni tags, ni
 * notes) — l'appelant applique les changements retournés après avoir vérifié
 * l'invariant chronologique sur la simulation complète.
 *
 * @param order ids des morceaux existants (matchés + conservés-absents) dans
 *   l'ordre de référence, sans les nouveaux morceaux.
 * @param currentCat catégorie actuelle par id (null = non catégorisé).
 * @param moved ids dont la position change.
 * @returns id -> nouvelle catégorie, uniquement pour les morceaux qui changent.
 */
export function recategorizeMovedTracks(
  order: string[],
  currentCat: Map<string, string | null> | Record<string, string | null>,
  moved: Set<string> | string[]
): Map<string, string | null> {
  const get = (id: string): string | null => {
    const v = currentCat instanceof Map ? currentCat.get(id) : currentCat[id];
    return v ?? null;
  };
  const movedSet = moved instanceof Set ? moved : new Set(moved);
  const changes = new Map<string, string | null>();
  order.forEach((id, idx) => {
    if (!movedSet.has(id)) return;
    const prev = idx > 0 ? order[idx - 1] : null;
    const next = idx < order.length - 1 ? order[idx + 1] : null;
    const target = prev ? get(prev) : next ? get(next) : get(id);
    if ((target ?? null) !== (get(id) ?? null)) {
      changes.set(id, target ?? null);
    }
  });
  return changes;
}
