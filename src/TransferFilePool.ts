import Blob from "cross-blob";
import { uuid } from 'uuidv4';
import { TransferFile, TransferFileBlob } from "./TransferFile.js";

type TransferFilePoolFiles = Record<string, TransferFile>;

export type TransferFileMetadata = {
  id: string;
  name: string;
  type: string;
  size: number;
  bufferLength: number;
};

export type AskFilePartCallback = (fileId: string, offset: number, limit: number) => void;

export type TransferFilePoolOptions = {
  askFilePartCallback?: AskFilePartCallback;
  maxBufferSize?: number;
};

export class TransferFilePool {
  transferFiles: TransferFilePoolFiles;

  // configuration
  maxBufferSize: number;

  // callbacks
  askFilePartCallback: AskFilePartCallback;

  constructor(options: TransferFilePoolOptions) {
    this.transferFiles = {};

    // manage askFilePartCallback
    if (options.askFilePartCallback) {
      this.askFilePartCallback = options.askFilePartCallback;
    } else {
      this.askFilePartCallback = (_fileId: string, _offset: number, _limit: number) => {};
    }

    this.maxBufferSize = options.maxBufferSize !== undefined ? options.maxBufferSize : 1000;
  }

  /**
   * Check existance of a file in the pool.
   *
   * @param fileId Id of the file.
   * @returns true if the file exists.
   */
  fileExists(fileId: string): boolean {
    return Object.keys(this.transferFiles).includes(fileId);
  }

  /**
   * Store file metadata.
   *
   * @param metadata File metadata.
   */
  storeFileMetadata(metadata: TransferFileMetadata) {
    // check presence of 'id' field
    if (!metadata.id) {
      throw new Error("no 'id' field");
    }

    // check presence of 'name' field
    if (!metadata.name) {
      throw new Error("no 'name' field");
    }

    // check presence of 'type' field
    if (!metadata.type) {
      throw new Error("no 'type' field");
    }

    // only store it if the file is not in the pool
    if (!this.fileExists(metadata.id)) {
      this.transferFiles[metadata.id] = new TransferFile(
        metadata.id,
        metadata.name,
        metadata.type || "text/plain",
        metadata.size || 0,
        metadata.bufferLength || 0,
      );
    }
  };

  /**
   * Delete a file from the pool.
   *
   * @param fileId Id of the file.
   */
  deleteFile(fileId: string): void {
    if (!this.fileExists(fileId)) {
      return;
    }

    // remove keys with the specified fileId
    this.transferFiles = Object.fromEntries(
      Object.entries(this.transferFiles)
        .filter(x => x[0] !== fileId)
    );
  }

  /**
   * Trigger the download of a file.
   *
   * @param fileId Id of the file.
   * @param askFilePartCallback Callback function to ask a specific part of a file.
   */
  async downloadFile(fileId: string, askFilePartCallback?: AskFilePartCallback): Promise<void> {
    if (!this.fileExists(fileId)) {
      throw new Error(`file '#${fileId}' does not exist`);
    }

    const file = this.transferFiles[fileId];
    if (askFilePartCallback !== undefined) {
      await file.download(this.maxBufferSize, askFilePartCallback);
    } else {
      await file.download(this.maxBufferSize, this.askFilePartCallback);
    }
  }

  async addFile(blob: Blob, name: string): Promise<TransferFileMetadata> {
    const fId = uuid();

    if (this.fileExists(fId)) {
      throw new Error('impossible to add this file to the pool, please retry');
    }

    const f = new TransferFile(fId, name, blob.type, blob.size, 0);
    await f.setBlob(blob);
    this.transferFiles[fId] = f;

    return f.getMetadata();
  }

  readFilePart(fileId: string, offset: number, limit: number): ArrayBuffer {
    if (!this.fileExists(fileId)) {
      throw new Error(`file '#${fileId}' does not exist`);
    }

    return this.transferFiles[fileId].readFilePart(offset, limit);
  }

  receiveFilePart(fileId: string, offset: number, limit: number, data: ArrayBuffer): void {
    if (!this.fileExists(fileId)) {
      throw new Error(`file '#${fileId}' does not exist`);
    }

    this.transferFiles[fileId].receiveFilePart(offset, limit, data);
  }

  getFile(fileId: string): TransferFileBlob {
    if (!this.fileExists(fileId)) {
      throw new Error(`file '#${fileId}' does not exist`);
    }

    return this.transferFiles[fileId].getFile();
  }

  getBlob(fileId: string): Blob {
    if (!this.fileExists(fileId)) {
      throw new Error(`file '#${fileId}' does not exist`);
    }

    return this.transferFiles[fileId].getBlob();
  }
}
