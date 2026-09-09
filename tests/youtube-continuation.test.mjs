import test from "node:test";
import assert from "node:assert/strict";

// Mirror of findPlaylistContinuation() in src/lib/adapters/youtube.ts
// (tests run with plain node, no TS loader — same pattern as sync.test.mjs).
function findPlaylistContinuation(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (obj.continuationItemRenderer) {
    const token =
      obj.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token;
    if (typeof token === "string" && token.length > 0) return token;
  }
  // Modern continuationItemViewModel shape (playlist item sections):
  // continuationItemViewModel.continuationCommand.innertubeCommand
  //   .continuationCommand.token
  if (obj.continuationItemViewModel) {
    const token =
      obj.continuationItemViewModel.continuationCommand?.innertubeCommand
        ?.continuationCommand?.token;
    if (typeof token === "string" && token.length > 0) return token;
  }
  if (typeof obj.continuation === "string" && obj.continuation.length > 0) {
    return obj.continuation;
  }
  if (obj.nextContinuationData && typeof obj.nextContinuationData.continuation === "string") {
    return obj.nextContinuationData.continuation;
  }
  if (
    obj.continuationEndpoint?.continuationCommand &&
    typeof obj.continuationEndpoint.continuationCommand.token === "string"
  ) {
    return obj.continuationEndpoint.continuationCommand.token;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findPlaylistContinuation(item);
      if (found) return found;
    }
    return null;
  }
  for (const k of Object.keys(obj)) {
    if (k === "playlistVideoRenderer" || k === "lockupViewModel") continue;
    const found = findPlaylistContinuation(obj[k]);
    if (found) return found;
  }
  return null;
}

function viewModelToken(token) {
  return {
    continuationItemViewModel: {
      trigger: "CONTINUATION_TRIGGER_ON_ITEM_SHOWN",
      continuationCommand: {
        innertubeCommand: {
          continuationCommand: { token, request: "CONTINUATION_REQUEST_TYPE_BROWSE" },
        },
      },
    },
  };
}

test("finds the modern continuationItemViewModel token (current YouTube shape)", () => {
  const page = {
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    { itemSectionRenderer: { contents: [{ lockupViewModel: {} }] } },
                    viewModelToken("PLAYLIST_TOKEN"),
                  ],
                },
              },
            },
          },
        ],
      },
    },
  };
  assert.equal(findPlaylistContinuation(page), "PLAYLIST_TOKEN");
});

test("still finds the legacy continuationItemRenderer token", () => {
  const node = {
    continuationItemRenderer: {
      continuationEndpoint: { continuationCommand: { token: "OLD_TOKEN" } },
    },
  };
  assert.equal(findPlaylistContinuation(node), "OLD_TOKEN");
});

test("returns null on a tail page with no continuation (no infinite loop)", () => {
  const tail = {
    onResponseReceivedActions: [
      { appendContinuationItemsAction: { continuationItems: [{ lockupViewModel: {} }] } },
    ],
  };
  assert.equal(findPlaylistContinuation(tail), null);
});

test("ignores video metadata subtrees and empty tokens", () => {
  assert.equal(findPlaylistContinuation(null), null);
  assert.equal(findPlaylistContinuation("nope"), null);
  assert.equal(findPlaylistContinuation(viewModelToken("")), null);
  // Tokens nested under lockupViewModel belong to other features: skipped.
  assert.equal(
    findPlaylistContinuation({ lockupViewModel: viewModelToken("INNER") }),
    null
  );
});

// Mirror of collectPlaylistItems() in src/lib/adapters/youtube.ts
function collectPlaylistItems(vl) {
  const empty = { nodes: [], token: null };
  if (!vl || typeof vl !== "object") return empty;
  const isVideoNode = (it) =>
    !!it?.playlistVideoRenderer ||
    !!it?.lockupViewModel ||
    !!it?.musicResponsiveListItemRenderer;
  const scoped = findVideoListNode(vl);
  if (scoped) {
    const list =
      scoped.playlistVideoListRenderer ||
      scoped.playlistVideoListContinuation ||
      scoped.musicPlaylistShelfRenderer;
    const contents = Array.isArray(list?.contents) ? list.contents : [];
    const nodes = contents.filter(isVideoNode);
    let token = null;
    for (const item of contents) {
      if (isVideoNode(item)) continue;
      const t = findPlaylistContinuation(item);
      if (t) token = t;
    }
    if (!token && list) {
      const t = findPlaylistContinuation({ continuations: list.continuations });
      if (t) token = t;
    }
    return { nodes, token };
  }
  const sections =
    vl?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents;
  if (!Array.isArray(sections)) return empty;
  const nodes = [];
  let token = null;
  for (const section of sections) {
    const items = section?.itemSectionRenderer?.contents;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (isVideoNode(item)) {
        nodes.push(item);
      } else {
        const t = findPlaylistContinuation(item);
        if (t) token = t;
      }
    }
  }
  return { nodes, token };
}

function findVideoListNode(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (
    obj.playlistVideoListRenderer ||
    obj.playlistVideoListContinuation ||
    obj.musicPlaylistShelfRenderer
  )
    return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findVideoListNode(item);
      if (found) return found;
    }
    return null;
  }
  for (const k of Object.keys(obj)) {
    const found = findVideoListNode(obj[k]);
    if (found) return found;
  }
  return null;
}

function lockup(id) {
  return { lockupViewModel: { contentId: id, contentType: "LOCKUP_CONTENT_TYPE_VIDEO" } };
}

function browsePage(ids, token) {
  const contents = ids.map(lockup);
  if (token) contents.push(viewModelToken(token));
  return {
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: { contents: [{ itemSectionRenderer: { contents } }] },
              },
            },
          },
        ],
      },
    },
  };
}

test("collects modern item-section videos in order plus the trailing token", () => {
  const { nodes, token } = collectPlaylistItems(browsePage(["a", "b", "c"], "TOK"));
  assert.deepEqual(nodes.map((n) => n.lockupViewModel.contentId), ["a", "b", "c"]);
  assert.equal(token, "TOK");
});

test("collects classic list nodes with token from continuations", () => {
  const vl = {
    playlistVideoListRenderer: {
      contents: [lockup("x"), { playlistVideoListContinuation: { continuations: [{ continuation: "C" }] } }],
    },
  };
  const { nodes, token } = collectPlaylistItems(vl);
  assert.deepEqual(nodes.map((n) => n.lockupViewModel.contentId), ["x"]);
  assert.equal(token, "C");
});

test("ignores section-level tokens for other features, keeps order", () => {
  const page = browsePage(["a"], null);
  const sections =
    page.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content
      .sectionListRenderer.contents;
  sections.push(viewModelToken("OTHER"));
  const { nodes, token } = collectPlaylistItems(page);
  assert.equal(nodes.length, 1);
  assert.equal(token, null);
});

test("returns empty on unknown shapes", () => {
  assert.deepEqual(collectPlaylistItems(null), { nodes: [], token: null });
  assert.deepEqual(collectPlaylistItems({ contents: {} }), { nodes: [], token: null });
});
