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
 * Règle (définie avec le curator) : un morceau déplacé prend la catégorie de
 * son PRÉCÉDENT dans l'ordre de référence (parmi les morceaux existants —
 * les nouveaux placeholders, sans catégorie, ne servent jamais d'ancre),
 * ou celle du SUIVANT s'il est déplacé en tête, ou conserve la sienne s'il
 * est seul. Si précédent et suivant ont la même catégorie, les deux clauses
 * coïncident.
 *
 * Seuls les morceaux déplacés (`moved`) peuvent changer de catégorie ; les
 * autres gardent la leur. Ne touche à rien d'autre (ni scores, ni tags, ni
 * notes) — l'appelant applique les changements retournés après avoir vérifié
 * l'invariant chronologique sur la simulation complète.
 *
 * @param order ids des morceaux existants (matchés + conservés-absents) dans
 *   l'ordre de référence, sans les nouveaux morceaux.
 * @param currentCat catégorie actuelle par id (null = non catégorisé).
 * @param moved ids réellement réordonnés (voir `findStationaryIds` : un
 *   simple décalage d'index dû à des insertions ne compte PAS).
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

/**
 * Morceaux « stationnaires » : ceux dont l'ordre RELATIF n'a pas changé entre
 * la version locale et la référence YouTube. Un simple décalage d'index
 * (insertions/suppressions avant) ne déplace rien musicalement : Samara Joy
 * reste après Simchover même si son index passe de 98 à 101. Seuls les
 * morceaux hors plus longue sous-séquence croissante (LIS) des rangs de
 * référence — c'est-à-dire réellement réordonnés — sont déclarés déplacés.
 * Les ids absents d'un des deux ordres sont ignorés (défensif).
 */
export function findStationaryIds(
  localOrder: string[],
  refOrder: string[]
): Set<string> {
  const refRank = new Map<string, number>();
  refOrder.forEach((id, i) => {
    if (!refRank.has(id)) refRank.set(id, i);
  });
  const seq: Array<{ id: string; rank: number }> = [];
  for (const id of localOrder) {
    const rank = refRank.get(id);
    if (rank !== undefined) seq.push({ id, rank });
  }
  // LIS strictement croissante (O(n²), n ≈ centaines de morceaux).
  const n = seq.length;
  const stationary = new Set<string>();
  if (n === 0) return stationary;
  const len = new Array<number>(n).fill(1);
  const parent = new Array<number>(n).fill(-1);
  let end = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (seq[j].rank < seq[i].rank && len[j] + 1 > len[i]) {
        len[i] = len[j] + 1;
        parent[i] = j;
      }
    }
    if (len[i] > len[end]) end = i;
  }
  for (let p = end; p !== -1; p = parent[p]) stationary.add(seq[p].id);
  return stationary;
}

/**
 * Section des NOUVEAUX morceaux (règle du curator, automatique) : même règle
 * du précédent/suivant, mais les ancres sont les morceaux EXISTANTS les plus
 * proches dans l'ordre de référence complet (les nouveaux placeholders ne
 * servent jamais d'ancre — sinon deux nouveautés adjacentes resteraient
 * orphelines). Sans voisin existant : reste non catégorisé.
 * Ne retourne que les affectations vers une section (les null restent null).
 */
export function assignNewTrackCategories(
  refFull: Array<{ id: string; isNew: boolean }>,
  currentCat: Map<string, string | null> | Record<string, string | null>
): Map<string, string | null> {
  const get = (id: string): string | null => {
    const v = currentCat instanceof Map ? currentCat.get(id) : currentCat[id];
    return v ?? null;
  };
  const assigned = new Map<string, string | null>();
  refFull.forEach((entry, idx) => {
    if (!entry.isNew) return;
    let prev: string | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (!refFull[i].isNew) {
        prev = refFull[i].id;
        break;
      }
    }
    let next: string | null = null;
    for (let i = idx + 1; i < refFull.length; i++) {
      if (!refFull[i].isNew) {
        next = refFull[i].id;
        break;
      }
    }
    const target = prev ? get(prev) : next ? get(next) : null;
    if (target !== null) assigned.set(entry.id, target);
  });
  return assigned;
}
