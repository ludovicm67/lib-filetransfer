import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";
import { arrayBufferToString, stringToArrayBuffer } from "../lib/index.js";

describe("test utility functions", () => {
  it("contains spec with an expectation", () => {
    const str = "test";
    const convertedString = arrayBufferToString(stringToArrayBuffer(str));
    deepStrictEqual(convertedString, str);
    deepStrictEqual(convertedString, "test");
  });
});
