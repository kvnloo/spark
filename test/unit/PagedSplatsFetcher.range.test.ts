import { describe, expect, test } from "vitest";
import { FileBytesPagedSplatsFetcher } from "../../src/PagedSplatsFetcher";

const signal = new AbortController().signal;
const source = new Uint8Array([0, 1, 2, 3, 4]);

describe("FileBytesPagedSplatsFetcher short reads", () => {
  test.each([
    { offset: 0, bytes: 12, expected: [0, 1, 2, 3, 4] },
    { offset: 3, bytes: 12, expected: [3, 4] },
    { offset: 4, bytes: 12, expected: [4] },
    { offset: 5, bytes: 12, expected: [] },
    { offset: 8, bytes: 12, expected: [] },
    { offset: 5, bytes: 0, expected: [] },
    { offset: 1, bytes: 3, expected: [1, 2, 3] },
  ])("returns available bytes at offset=$offset, bytes=$bytes", async ({
    offset,
    bytes,
    expected,
  }) => {
    const result = await new FileBytesPagedSplatsFetcher(source).fetchRange(
      signal,
      offset,
      bytes,
    );
    expect(result).toEqual(new Uint8Array(expected));
    expect(result.buffer).not.toBe(source.buffer);
  });

  test("returns an empty range from an empty file", async () => {
    const fetcher = new FileBytesPagedSplatsFetcher(new Uint8Array());
    expect(await fetcher.fetchRange(signal, 1, 64)).toEqual(new Uint8Array());
  });

  test("still rejects negative offsets", async () => {
    const fetcher = new FileBytesPagedSplatsFetcher(source);
    await expect(fetcher.fetchRange(signal, -1, 2)).rejects.toThrow(
      "Invalid chunk offset",
    );
  });

  test("transferring a short read does not detach the source buffer", async () => {
    const input = source.slice();
    const fetcher = new FileBytesPagedSplatsFetcher(input);
    const bytes = await fetcher.fetchRange(signal, 3, 12);
    const transferred = structuredClone(bytes, { transfer: [bytes.buffer] });
    expect(bytes.buffer.byteLength).toBe(0);
    expect(transferred).toEqual(new Uint8Array([3, 4]));
    expect(input).toEqual(source);
  });

  test("matches slice for small-file offset and length boundaries", async () => {
    for (let length = 0; length <= 15; length++) {
      const input = Uint8Array.from({ length }, (_, i) => i);
      const fetcher = new FileBytesPagedSplatsFetcher(input);
      for (let offset = 0; offset <= length + 2; offset++) {
        for (let bytes = 0; bytes <= length + 3; bytes++) {
          expect(await fetcher.fetchRange(signal, offset, bytes)).toEqual(
            input.slice(offset, offset + bytes),
          );
        }
      }
    }
  });
});
