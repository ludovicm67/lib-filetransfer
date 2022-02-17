import Blob from "cross-blob";
import { AskFilePartCallback, TransferFileMetadata } from "./TransferFilePool.js";

type TransferFileParts = Record<string, ArrayBuffer>;

export type TransferFileInfos = {
  id: string,
  name: string,
  size: number,
  bufferLength: number;

  complete: boolean,
  downloading: boolean,
  errored: boolean,

  message: string | undefined,
};

export class TransferFile {
  id: string; // file ID

  // metadata
  name: string;
  type: string;
  size: number;

  // store data
  parts: TransferFileParts = {}; // while fetching content
  data: Blob | undefined = undefined; // full data
  buffer: ArrayBuffer | undefined = undefined;
  bufferLength: number;

  // state
  complete: boolean = false; // data is ready and complete
  errored: boolean = false; // an error occured
  downloading: boolean = false; // the file is being downloaded

  // store error message (or some random information)
  message: string | undefined = undefined;

  /**
   * Generate a new TransferFile instance.
   *
   * @param id Id of the file.
   * @param name Name of the file.
   * @param type Type of the file.
   * @param size Size of the file.
   * @param bufferLength Length of the internal buffer.
   */
  constructor(id: string, name: string, type: string, size: number, bufferLength: number) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.size = size;
    this.bufferLength = bufferLength;
  }

  /**
   * Set the file as being downloaded.
   *
   * @param isDownloading True if the file is being downloaded.
   */
  setDownloading(isDownloading: boolean = true): void {
    this.downloading = isDownloading;
  }

  /**
   * Check if the file is downloading.
   *
   * @returns true if the file is downloading.
   */
  isDownloading(): boolean {
    return this.downloading;
  }

  /**
   * Set the file as being complete.
   *
   * @param isComplete True if the download is complete.
   */
  setComplete(isComplete: boolean = true): void {
    this.complete = isComplete;
  }

  /**
   * Check if the file is complete.
   *
   * @returns true if the file is complete.
   */
  isComplete(): boolean {
    return this.complete;
  }

  /**
   * Set an error message.
   *
   * @param message A relevant error message.
   * @param isErrored True in case of an error.
   */
  setError(message: string | undefined, isErrored: boolean = true) {
    this.message = message;
    this.errored = isErrored;
  }

  /**
   * Get informations about the TransferFile.
   *
   * @returns Informations about the TransferFile.
   */
  getInfos(): TransferFileInfos {
    return {
      id: this.id,
      name: this.name,
      size: this.size,
      bufferLength: this.bufferLength,

      complete: this.complete,
      downloading: this.downloading,
      errored: this.errored,

      message: this.message,
    }
  }

  download(maxBufferSize: number, askFilePartCallback: AskFilePartCallback): void {
    if (this.isComplete()) {
      // nothing to do, since the file is already complete
      return;
    }
    if (this.isDownloading()) {
      // nothing to do, since the download action was already triggered
      return;
    }

    this.setDownloading(true);

    let offset = 0;
    while (offset <= this.bufferLength) {
      askFilePartCallback(this.id, offset, maxBufferSize);
      offset = offset + maxBufferSize;
    }
  }

  getMetadata(): TransferFileMetadata {
    return {
      id: this.id,
      name: this.name,
      size: this.size,
      type: this.type,
      bufferLength: this.bufferLength,
    };
  }

  async setBlob(blob: Blob): Promise<void> {
    const b = new Blob([blob], {type: blob.type});
    this.data = b;
    this.buffer = await b.arrayBuffer();
    this.bufferLength = this.buffer.byteLength;
    this.setComplete(true);
  }

  readFilePart(offset: number, limit: number): ArrayBuffer {
    if (this.buffer === undefined) {
      throw new Error(`buffer is not defined for file '#${this.id}'`);
    }

    return this.buffer.slice(offset, offset + limit);
  }
}
