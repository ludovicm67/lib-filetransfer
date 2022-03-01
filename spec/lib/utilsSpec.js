import { arrayBufferToString, stringToArrayBuffer } from "../../lib/index.js";

describe("test utility functions", () => {
  it("contains spec with an expectation", () => {
    const str = "test";
    const convertedString = arrayBufferToString(stringToArrayBuffer(str));
    expect(str).toEqual(convertedString);
  });
});
