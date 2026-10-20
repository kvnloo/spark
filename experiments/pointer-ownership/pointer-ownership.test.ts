import type { PointerControls } from "../../src/controls.js";
import { expect, test } from "./harness.fixture.js";

declare global {
  interface Window {
    pointerOwnership: {
      first: PointerControls;
      second: PointerControls;
      counts: number[];
    };
  }
}

test.beforeEach(async ({ harnessPage }) => {
  await harnessPage.evaluate(async () => {
    const { PointerControls } = await import("../../src/controls.js");
    const counts = [0, 0];
    const controls = [20, 220].map((left, index) => {
      const canvas = document.createElement("canvas");
      canvas.id = `pointer-canvas-${index}`;
      canvas.style.cssText = `position:absolute;left:${left}px;top:300px;width:150px;height:150px;touch-action:none`;
      document.body.appendChild(canvas);
      return new PointerControls({
        canvas,
        reverseRotate: false,
        doublePress: () => {
          counts[index]++;
        },
      });
    });
    const outside = document.createElement("button");
    outside.id = "outside-canvas";
    outside.textContent = "Unrelated UI";
    outside.style.cssText =
      "position:absolute;left:420px;top:300px;width:150px;height:150px";
    document.body.appendChild(outside);
    window.pointerOwnership = {
      first: controls[0],
      second: controls[1],
      counts,
    };
  });
});

test("unrelated UI clicks do not invoke any canvas double-press callback", async ({
  harnessPage,
}) => {
  await harnessPage.locator("#outside-canvas").dblclick();
  expect(
    await harnessPage.evaluate(() => window.pointerOwnership.counts),
  ).toEqual([0, 0]);
});

test("a canvas double click affects only its own controls", async ({
  harnessPage,
}) => {
  await harnessPage.locator("#pointer-canvas-0").dblclick();
  expect(
    await harnessPage.evaluate(() => window.pointerOwnership.counts),
  ).toEqual([1, 0]);
});

test("touch cancellation cannot complete or prime a double tap", async ({
  harnessPage,
}) => {
  const session = await harnessPage.context().newCDPSession(harnessPage);
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 2,
  });
  const touch = [{ x: 75, y: 350, id: 1 }];
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: touch,
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: touch,
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  expect(
    await harnessPage.evaluate(() => ({
      counts: window.pointerOwnership.counts,
      released: window.pointerOwnership.first.rotating === null,
      lastUp: window.pointerOwnership.first.lastUp,
    })),
  ).toEqual({ counts: [0, 0], released: true, lastUp: null });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: touch,
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(
    await harnessPage.evaluate(() => window.pointerOwnership.counts),
  ).toEqual([0, 0]);
  await session.detach();
});
