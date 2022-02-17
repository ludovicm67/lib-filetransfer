/**
 * Convert an ArrayBuffer to a string.
 *
 * @param ab ArrayBuffer to convert.
 * @returns The string.
 */
export const arrayBufferToString = (ab: ArrayBuffer): string => {
  return new TextDecoder().decode(ab);
};

/**
 * Convert a string to an ArrayBuffer.
 *
 * @param str String to convert.
 * @returns The ArrayBuffer.
 */
export const stringToArrayBuffer = (str: string): ArrayBuffer => {
  return new TextEncoder().encode(str).buffer;
};
