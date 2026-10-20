import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PointerControls } from "../../src/controls";

let documentTarget: EventTarget;
let now: number;
beforeEach(() => {
  documentTarget = new EventTarget();
  vi.stubGlobal("document", documentTarget);
  now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup() {
  const target = new EventTarget();
  const captures = new Set<number>();
  Object.assign(target, {
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture: (id: number) => captures.add(id),
    releasePointerCapture: (id: number) => captures.delete(id),
  });
  const doublePress = vi.fn();
  const controls = new PointerControls({
    canvas: target as unknown as HTMLCanvasElement,
    reverseRotate: false,
    doublePress,
  });
  const down = (id = 1) => dispatch(target, "pointerdown", id);
  const up = (id = 1) => dispatch(documentTarget, "pointerup", id);
  const cancel = (id = 1) => dispatch(documentTarget, "pointercancel", id);
  const tap = (id = 1) => {
    down(id);
    up(id);
  };
  return { controls, doublePress, captures, down, up, cancel, tap };
}

function dispatch(target: EventTarget, type: string, pointerId: number) {
  const event = new Event(type);
  Object.assign(event, {
    pointerId,
    pointerType: "touch",
    button: 0,
    clientX: 10,
    clientY: 10,
  });
  target.dispatchEvent(event);
  now += 20;
}

test("document releases that did not start on this canvas are ignored", () => {
  const h = setup();
  h.up(9);
  h.up(9);
  expect(h.doublePress).not.toHaveBeenCalled();
  expect(h.controls.lastUp).toBeNull();
});

test("two tracked taps still emit one double press", () => {
  const h = setup();
  h.tap();
  h.tap();
  expect(h.doublePress).toHaveBeenCalledTimes(1);
});

test("tracked pointer releases received on document still complete the tap", () => {
  const h = setup();
  h.down();
  h.up();
  expect(h.controls.rotating).toBeNull();
  expect(h.captures.size).toBe(0);
  expect(h.controls.lastUp).not.toBeNull();
});

test("an unrelated release does not reset an active press", () => {
  const h = setup();
  h.tap();
  h.down();
  const pressed = h.controls.doublePressed;
  const lastUp = h.controls.lastUp;
  expect(pressed).toBeDefined();
  h.up(99);
  expect(h.controls.doublePressed).toBe(pressed);
  expect(h.controls.lastUp).toBe(lastUp);
  expect(h.controls.rotating?.pointerId).toBe(1);
  expect(h.doublePress).not.toHaveBeenCalled();
});

test("cancellation releases capture but does not become a completed tap", () => {
  const h = setup();
  h.down();
  h.cancel();
  expect(h.controls.rotating).toBeNull();
  expect(h.captures.size).toBe(0);
  expect(h.controls.lastUp).toBeNull();
  expect(h.doublePress).not.toHaveBeenCalled();
});

test("cancellation cannot complete a double press or carry tap history forward", () => {
  const h = setup();
  h.tap();
  h.down();
  h.cancel();
  expect(h.doublePress).not.toHaveBeenCalled();
  expect(h.controls.lastUp).toBeNull();
  expect(h.controls.lastLastUp).toBeNull();
  h.tap();
  expect(h.doublePress).not.toHaveBeenCalled();
});

test("an unrelated cancellation does not erase this canvas's valid tap history", () => {
  const h = setup();
  h.tap();
  const lastUp = h.controls.lastUp;
  h.cancel(99);
  expect(h.controls.lastUp).toBe(lastUp);
  expect(h.doublePress).not.toHaveBeenCalled();
  h.tap();
  expect(h.doublePress).toHaveBeenCalledTimes(1);
});

test("the second release of a completed two-finger gesture is not a double tap", () => {
  const h = setup();
  h.down(1);
  h.down(2);
  expect(h.controls.dualPress).toBe(true);
  h.up(1);
  h.up(2);
  expect(h.controls.rotating).toBeNull();
  expect(h.controls.sliding).toBeNull();
  expect(h.captures.size).toBe(0);
  expect(h.doublePress).not.toHaveBeenCalled();
});

test("one canvas cannot receive a double press from another canvas's gestures", () => {
  const first = setup();
  const second = setup();
  first.tap(1);
  first.tap(1);
  expect(first.doublePress).toHaveBeenCalledTimes(1);
  expect(second.doublePress).not.toHaveBeenCalled();
  expect(second.controls.lastUp).toBeNull();
});
