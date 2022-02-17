/**
 * Convert an ArrayBuffer to a string.
 *
 * @param ab ArrayBuffer to convert.
 * @returns The string.
 */
export const arrayBufferToString = (ab: ArrayBuffer): string => {
  const args: number[] = new Uint16Array(ab) as unknown as number [];
  return String.fromCharCode.apply(null, args);
};

/**
 * Convert a string to an ArrayBuffer.
 *
 * @param str String to convert.
 * @returns The ArrayBuffer.
 */
export const stringToArrayBuffer = (str: string): ArrayBuffer => {
  const buffer = new ArrayBuffer(str.length * 2); // 2 bytes per char
  const view = new Uint16Array(buffer);
  const length = str.length;
  for (let i = 0; i < length; i++) {
    view[i] = str.charCodeAt(i);
  }
  return buffer;
};
