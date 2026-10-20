import assert from "node:assert/strict";
import test from "node:test";
import { cameraTape, createMatrix } from "./matrix.mjs";

for (const [profile, count] of [
  ["smoke", 2],
  ["focused", 8],
  ["full", 112],
]) {
  test(`${profile} matrix has exactly ${count} distinct paired cells`, () => {
    const cases = createMatrix(profile);
    assert.equal(cases.length, count);
    assert.equal(
      new Set(cases.map((entry) => JSON.stringify(entry))).size,
      count,
    );
    for (let i = 0; i < cases.length; i += 2) {
      const { sortRadial: a, ...first } = cases[i];
      const { sortRadial: b, ...second } = cases[i + 1];
      assert.deepEqual(first, second);
      assert.equal(a, !b);
    }
  });
}

test("repetitions retain paired order without overwriting case identities", () => {
  const cases = createMatrix("smoke", 5);
  assert.equal(cases.length, 10);
  assert.deepEqual(
    cases.map((entry) => entry.sortRadial),
    [false, true, true, false, false, true, true, false, false, true],
  );
  assert.deepEqual(
    cases.map((entry) => entry.trialIndex),
    [0, 0, 1, 1, 2, 2, 3, 3, 4, 4],
  );
});

test("seven equal full-matrix shards retain adjacent sorting pairs", () => {
  const cases = createMatrix("full");
  for (let i = 0; i < 7; i++) {
    const shard = cases.slice(i * 16, (i + 1) * 16);
    assert.equal(shard.length, 16);
    for (let j = 0; j < shard.length; j += 2) {
      const { sortRadial: a, ...first } = shard[j];
      const { sortRadial: b, ...second } = shard[j + 1];
      assert.deepEqual(first, second);
      assert.notEqual(a, b);
    }
  }
});

test("profile names and repetition counts fail closed", () => {
  for (const profile of ["typo", "__proto__", "constructor", ""]) {
    assert.throws(() => createMatrix(profile), /PROFILE/);
  }
  for (const count of [
    0,
    -1,
    11,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "2",
  ]) {
    assert.throws(() => createMatrix("smoke", count), /REPEATS/);
  }
});

test("camera tapes are reproducible and separate all seeds and motions", () => {
  const tapes = new Set();
  for (const seed of [1, 2, 3, 5, 8, 13, 21]) {
    for (const motion of ["orbit", "reverse"]) {
      const tape = cameraTape(seed, motion, 20);
      assert.deepEqual(tape, cameraTape(seed, motion, 20));
      assert.equal(tape.length, 20);
      for (const [x, y, z] of tape) {
        assert.ok(Number.isFinite(x) && Math.abs(x) <= 1.5);
        assert.ok(Number.isFinite(y) && Math.abs(y) <= 0.25);
        assert.ok(Number.isFinite(z) && z >= 6.7 && z <= 7.3);
      }
      tapes.add(JSON.stringify(tape));
    }
  }
  assert.equal(tapes.size, 14);
});

test("invalid camera tapes are never synthesized", () => {
  for (const seed of [-1, 0x100000000, 1.5, Number.NaN])
    assert.throws(() => cameraTape(seed, "orbit", 20), /seed/);
  assert.throws(() => cameraTape(1, "typo", 20), /motion/);
  for (const count of [0, 19, 601, 20.5, Number.POSITIVE_INFINITY])
    assert.throws(() => cameraTape(1, "orbit", count), /frame count/);
});
