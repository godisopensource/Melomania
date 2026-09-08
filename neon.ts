import { defineConfig } from "@neon/config/v1";

// Cost guardrails for a hobby app on usage-based pricing.
// - production: autoscaling capped at 2 CU (the old Free-tier ceiling — this
//   workload is single-row JSONB reads/writes, it never needs more) and
//   scale-to-zero after 5 min idle. Worst case if compute never suspended:
//   2 CU x 730 h x $0.106 = bounded, vs 16 CU uncapped.
// - throwaway branches: auto-expire + tiny capped compute.
export default defineConfig({
  branch: (branch) => {
    if (branch.isDefault) {
      return {
        postgres: {
          computeSettings: {
            autoscalingLimitMinCu: 0.25,
            autoscalingLimitMaxCu: 2,
            suspendTimeout: "5m",
          },
        },
      };
    }
    if (branch.exists) return {};
    return {
      ttl: "7d",
      postgres: {
        computeSettings: {
          autoscalingLimitMinCu: 0.25,
          autoscalingLimitMaxCu: 1,
          suspendTimeout: "5m",
        },
      },
    };
  },
});
