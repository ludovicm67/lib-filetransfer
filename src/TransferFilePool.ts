import Blob from "cross-blob";
import { v4 as uuidv4 } from "uuid";
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

  constructor(options?: TransferFilePoolOptions) {
    this.transferFiles = {};

    // manage askFilePartCallback
    if (options?.askFilePartCallback) {
      this.askFilePartCallback = options.askFilePartCallback;
    } else {
      this.askFilePartCallback = (_fileId: string, _offset: number, _limit: number) => {};
    }

    this.maxBufferSize = options?.maxBufferSize !== undefined ? options.maxBufferSize : 1000;
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
   * @returns The ID of the file.
   */
  storeFileMetadata(metadata: TransferFileMetadata): string {
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

    return metadata.id;
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

  /**
   * Add a file directly to the pool.
   *
   * @param blob Blob to store to the pool.
   * @param name Name of the file.
   * @returns The metadata of the file.
   */
  async addFile(blob: Blob, name: string): Promise<TransferFileMetadata> {
    const fId = uuidv4();

    if (this.fileExists(fId)) {
      throw new Error('impossible to add this file to the pool, please retry');
    }

    const f = new TransferFile(fId, name, blob.type, blob.size, 0);
    await f.setBlob(blob);
    this.transferFiles[fId] = f;

    return f.getMetadata();
  }

  /**
   * Read a specific part of a file.
   *
   * @param fileId Id of the file.
   * @param offset From where to read.
   * @param limit Maximum lenght of data we want to read.
   * @returns ArrayBuffer containing the requested part of the file.
   */
  readFilePart(fileId: string, offset: number, limit: number): ArrayBuffer {
    if (!this.fileExists(fileId)) {
      throw new Error(`file '#${fileId}' does not exist`);
    }

    return this.transferFiles[fileId].readFilePart(offset, limit);
  }

  /**
   * Receive a specific part of a file.
   *
   * @param fileId Id of the file.
   * @param offset From where it was read.
   * @param limit Maximum length of read data.
   * @param data ArrayBuffer containing the data of defined part of the file.
   */
  receiveFilePart(fileId: string, offset: number, limit: number, data: ArrayBuffer): void {
    if (!this.fileExists(fileId)) {
      throw new Error(`file '#${fileId}' does not exist`);
    }

    this.transferFiles[fileId].receiveFilePart(offset, limit, data);
  }

  /**
   * Get informations representing a specific file.
   *
   * @param fileId Id of the file.
   * @returns Informations representing the requested file.
   */
  getFile(fileId: string): TransferFileBlob {
    if (!this.fileExists(fileId)) {
      throw new Error(`file '#${fileId}' does not exist`);
    }

    return this.transferFiles[fileId].getFile();
  }

  /**
   * Get the Blob of a specific complete file.
   *
   * @param fileId Id of the file.
   * @returns The Blob of the complete file.
   */
  getBlob(fileId: string): Blob {
    if (!this.fileExists(fileId)) {
      throw new Error(`file '#${fileId}' does not exist`);
    }

    return this.transferFiles[fileId].getBlob();
  }
}
