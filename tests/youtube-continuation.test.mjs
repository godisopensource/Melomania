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
