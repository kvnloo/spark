const PROFILES = {
  smoke: {
    seeds: [1],
    budgets: [10_000],
    sources: ["paged"],
    motions: ["reverse"],
  },
  focused: {
    seeds: [1, 2],
    budgets: [10_000, 100_000],
    sources: ["paged"],
    motions: ["reverse"],
  },
  full: {
    seeds: [1, 2, 3, 5, 8, 13, 21],
    budgets: [10_000, 100_000],
    sources: ["paged", "in-memory"],
    motions: ["orbit", "reverse"],
  },
};

/** Adjacent cases form a matched pair; alternate AB/BA across trials/seeds. */
export function createMatrix(profile = "smoke", repetitions = 1) {
  if (!Object.hasOwn(PROFILES, profile))
    throw new Error("Unknown SPARK_LAB_PROFILE");
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) {
    throw new Error("SPARK_LAB_REPEATS must be an integer from 1 to 10");
  }
  const { sources, motions, seeds, budgets } = PROFILES[profile];
  const cases = [];
  for (const source of sources) {
    for (const motion of motions) {
      for (const seed of seeds) {
        for (const lodSplatCount of budgets) {
          for (let trialIndex = 0; trialIndex < repetitions; trialIndex++) {
            const modes =
              (seed + trialIndex) % 2 ? [false, true] : [true, false];
            for (const sortRadial of modes) {
              cases.push({
                source,
                motion,
                seed,
                lodSplatCount,
                trialIndex,
                sortRadial,
              });
            }
          }
        }
      }
    }
  }
  return cases;
}

/** Deterministic poses, deliberately frame-stepped rather than wall-clock replay. */
export function cameraTape(seed, motion, frameCount) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error("Invalid seed");
  if (!["orbit", "reverse"].includes(motion)) throw new Error("Unknown motion");
  if (!Number.isInteger(frameCount) || frameCount < 20 || frameCount > 600)
    throw new Error("Invalid frame count");
  // Spread small seeds across the orbit instead of nearly identical phases.
  const phase =
    ((Math.imul(seed, 0x9e3779b1) >>> 0) / 4294967296) * 2 * Math.PI;
  return Array.from({ length: frameCount }, (_, i) => {
    const t = (i / (frameCount - 1)) * 2 * Math.PI;
    const x = Math.sin(t * (motion === "reverse" ? 2 : 1) + phase) * 1.5;
    return [x, Math.cos(t * 0.5) * 0.25, 7 + Math.cos(t) * 0.3];
  });
}
