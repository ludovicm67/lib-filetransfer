import pLimit from "p-limit";
import {
  AskFilePartCallback,
  TransferFileMetadata,
} from "./TransferFilePool.js";

type TransferFileParts = Record<string, ArrayBuffer>;

export type TransferFileInfos = {
  id: string;
  name: string;
  size: number;
  bufferLength: number;

  complete: boolean;
  downloading: boolean;
  errored: boolean;

  message: string | undefined;
};

export type TransferFileBlob = {
  name: string;
  type: string;
  size: number;
  data: Blob;
};

export class TransferFile {
  private id: string; // file ID

  // metadata
  private name: string;
  private type: string;
  private size: number;

  // store data
  private parts: TransferFileParts = {}; // while fetching content
  private data: Blob | undefined = undefined; // full data
  private buffer: ArrayBuffer | undefined = undefined;
  private bufferLength: number;

  // state
  private complete: boolean = false; // data is ready and complete
  private errored: boolean = false; // an error occured
  private downloading: boolean = false; // the file is being downloaded

  // store error message (or some random information)
  private message: string | undefined = undefined;

  // configuration
  private timeout: number = 1;
  private retries: number = 10;

  /**
   * Generate a new TransferFile instance.
   *
   * @param id Id of the file.
   * @param name Name of the file.
   * @param type Type of the file.
   * @param size Size of the file.
   * @param bufferLength Length of the internal buffer.
   * @param timeout Timeout for a single check in seconds.
   * @param retries Number of retries before considering it as a failure.
   */
  constructor(
    id: string,
    name: string,
    type: string,
    size: number,
    bufferLength: number,
    timeout?: number,
    retries?: number
  ) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.size = size;
    this.bufferLength = bufferLength;

    if (timeout !== undefined) {
      this.timeout = timeout;
    }
    if (retries !== undefined) {
      this.retries = retries;
    }
  }

  /**
   * Set the file as being downloaded.
   *
   * @param isDownloading True if the file is being downloaded.
   */
  public setDownloading(isDownloading: boolean = true): void {
    this.downloading = isDownloading;
  }

  /**
   * Check if the file is downloading.
   *
   * @returns true if the file is downloading.
   */
  public isDownloading(): boolean {
    return this.downloading;
  }

  /**
   * Set the file as being complete.
   *
   * @param isComplete True if the download is complete.
   */
  public setComplete(isComplete: boolean = true): void {
    this.complete = isComplete;
  }

  /**
   * Check if the file is complete.
   *
   * @returns true if the file is complete.
   */
  public isComplete(): boolean {
    return this.complete;
  }

  /**
   * Set an error message.
   *
   * @param message A relevant error message.
   * @param isErrored True in case of an error.
   */
  public setError(message: string | undefined, isErrored: boolean = true) {
    this.message = message;
    this.errored = isErrored;
  }

  /**
   * Get informations about the TransferFile.
   *
   * @returns Informations about the TransferFile.
   */
  public getInfos(): TransferFileInfos {
    return {
      id: this.id,
      name: this.name,
      size: this.size,
      bufferLength: this.bufferLength,

      complete: this.complete,
      downloading: this.downloading,
      errored: this.errored,

      message: this.message,
    };
  }

  /**
   * Get the Blob of the complete file.
   *
   * @returns The Blob of the file.
   */
  public getBlob(): Blob {
    if (!this.isComplete()) {
      throw new Error("file is incomplete");
    }

    // generate the blob if it does not exist
    if (this.data === undefined) {
      this.data = new Blob(
        Object.keys(this.parts)
          .sort((x, y) => {
            const offsetX = parseInt(x.replace(/.*-/, ""), 10);
            const offsetY = parseInt(y.replace(/.*-/, ""), 10);

            if (offsetX < offsetY) {
              return -1;
            }

            if (offsetX > offsetY) {
              return 1;
            }

            return 0;
          })
          .map((fPart) => this.parts[fPart]),
        {
          type: this.type,
        }
      );
    }

    return this.data;
  }

  /**
   * Download the file.
   *
   * @param maxBufferSize Maximum length for the data to ask at one time.
   * @param askFilePartCallback Function that will be called to ask for some parts of the file.
   * @param parallelCalls Number of parallel calls to perform (default value: `1`).
   * @param timeout Timeout for a single check in seconds.
   * @param retries Number of retries before considering it as a failure.
   * @returns
   */
  public async download(
    maxBufferSize: number,
    askFilePartCallback: AskFilePartCallback,
    parallelCalls: number = 1,
    timeout?: number,
    retries?: number
  ): Promise<void> {
    if (this.isComplete()) {
      // nothing to do, since the file is already complete
      return;
    }
    if (this.isDownloading()) {
      // nothing to do, since the download action was already triggered
      return;
    }

    if (maxBufferSize <= 0) {
      throw new Error(
        `maxBufferSize should be greater than 0, got: ${maxBufferSize}`
      );
    }

    if (timeout === undefined) {
      timeout = this.timeout;
    }
    if (retries === undefined) {
      retries = this.retries;
    }

    this.setDownloading(true);
    this.setError(undefined, false);

    try {
      const limit = pLimit(parallelCalls);
      const partsCount = Math.ceil(this.bufferLength / maxBufferSize);
      await Promise.all(
        [...Array(partsCount).keys()].map((offset) =>
          limit(() => {
            return this.waitFilePartWithRetry(
              askFilePartCallback,
              offset * maxBufferSize,
              maxBufferSize,
              timeout,
              retries
            );
          })
        )
      );
      this.setComplete(true);
      this.getBlob();
    } catch (e: any) {
      const msg = e?.message || "something went wrong";
      this.setComplete(false);
      this.setError(msg);

      // re-throw the error we catched
      throw new Error(msg);
    }

    this.setDownloading(false);
    this.parts = {};
  }

  /**
   * Get the file metadata.
   *
   * @returns File metadata.
   */
  public getMetadata(): TransferFileMetadata {
    return {
      id: this.id,
      name: this.name,
      size: this.size,
      type: this.type,
      bufferLength: this.bufferLength,
    };
  }

  /**
   * Get informations representing the file.
   *
   * @returns All informations representing the file.
   */
  public getFile(): TransferFileBlob {
    if (!this.isComplete()) {
      throw new Error("file is incomplete");
    }

    return {
      name: this.name,
      type: this.type,
      size: this.size,
      data: this.getBlob(),
    };
  }

  /**
   * Set a Blob as being the content of this file.
   */
  public async setBlob(blob: Blob): Promise<void> {
    const b = new Blob([blob], { type: blob.type });
    this.data = b;
    this.buffer = await b.arrayBuffer();
    this.bufferLength = this.buffer.byteLength;
    this.setComplete(true);
    this.setDownloading(false);
    this.setError(undefined, false);
  }

  /**
   * Read `limit` bytes at maximum from `offset` from the file.
   *
   * @param offset Offset from the start.
   * @param limit Maximum number of bytes to return.
   * @returns ArrayBuffer with the requested file part.
   */
  public readFilePart(offset: number, limit: number): ArrayBuffer {
    if (this.buffer === undefined) {
      throw new Error(`buffer is not defined for file '#${this.id}'`);
    }

    return this.buffer.slice(offset, offset + limit);
  }

  /**
   * Receive a part of the file.
   *
   * @param offset Offset from the start.
   * @param limit The requested limit.
   * @param data ArrayBuffer containing the requested data.
   */
  public receiveFilePart(
    offset: number,
    limit: number,
    data: ArrayBuffer
  ): void {
    this.parts[`${limit}-${offset}`] = data;
  }

  /**
   * Check the presence of a specific part of the file.
   *
   * @param offset Offset from the start.
   * @param limit The requested limit.
   * @returns true if the part exists or if the file is complete.
   */
  public hasPart(offset: number, limit: number) {
    return this.parts && this.parts[`${limit}-${offset}`];
  }

  /**
   * Wait and check for presence of a specific part of the file.
   *
   * @param offset Offset from the start.
   * @param limit The requested limit.
   * @param timeout Timeout in seconds (default: `1`)
   * @returns true of the part was received.
   */
  public async waitFilePart(
    offset: number,
    limit: number,
    timeout: number = 1
  ): Promise<boolean> {
    if (this.isComplete()) {
      return true;
    }

    for (let i = timeout * 10; i >= 0; i--) {
      if (this.hasPart(offset, limit)) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    return false;
  }

  /**
   * Wait for a specific part of a file, with some retries.
   *
   * @param askFilePartCallback Function to ask a file part to the sender.
   * @param offset Offset from the start.
   * @param limit Maximum number of bytes that we can read.
   * @param timeout Timeout for a single check in seconds.
   * @param retries Number of retries before considering it as a failure.
   */
  public async waitFilePartWithRetry(
    askFilePartCallback: AskFilePartCallback,
    offset: number,
    limit: number,
    timeout?: number,
    retries?: number
  ): Promise<void> {
    if (timeout === undefined) {
      timeout = this.timeout;
    }
    if (retries === undefined) {
      retries = this.retries;
    }

    // no need to ask for this part if it already exists
    if (this.hasPart(offset, limit)) {
      return;
    }

    if (!this.isDownloading()) {
      throw new Error("download aborted");
    }

    let success = false;

    askFilePartCallback(this.id, offset, limit);

    for (let i = retries; i >= 0; i--) {
      const receivedPart = await this.waitFilePart(offset, limit, timeout);
      if (receivedPart) {
        success = true;
        break;
      }

      // in case of a failure, retry
      askFilePartCallback(this.id, offset, limit);
    }

    if (!success) {
      throw new Error(
        `missing part (limit=${limit}, offset=${offset}) for file '#${this.id}'`
      );
    }
  }

  /**
   * Clear the content of the file.
   * The user will need to download it again.
   */
  public clear(): void {
    this.setComplete(false);
    this.setDownloading(false);
    this.setError(undefined, false);
    this.data = undefined;
    this.buffer = undefined;
    this.parts = {};
  }
}
