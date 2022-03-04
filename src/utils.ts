import { decode, encode } from "base64-arraybuffer";

/**
 * Convert an ArrayBuffer to a string.
 *
 * @param ab ArrayBuffer to convert.
 * @returns The string.
 */
export const arrayBufferToString = (ab: ArrayBuffer): string => {
  return encode(ab);
};

/**
 * Convert a string to an ArrayBuffer.
 *
 * @param str String to convert.
 * @returns The ArrayBuffer.
 */
export const stringToArrayBuffer = (str: string): ArrayBuffer => {
  return decode(`${str}`);
};
