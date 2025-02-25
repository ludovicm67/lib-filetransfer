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

export type AskFilePartCallback = (
  fileId: string,
  offset: number,
  limit: number
) => void;

export type TransferFilePoolOptions = {
  askFilePartCallback?: AskFilePartCallback;
  maxBufferSize?: number;
  parallelCalls?: number;
  timeout?: number;
  retries?: number;
};

export class TransferFilePool {
  private transferFiles: TransferFilePoolFiles;

  // configuration
  private maxBufferSize: number;
  private parallelCalls: number;
  private timeout: number = 1;
  private retries: number = 10;

  // callbacks
  private askFilePartCallback: AskFilePartCallback;

  constructor(options?: TransferFilePoolOptions) {
    this.transferFiles = {};

    // manage askFilePartCallback
    if (options?.askFilePartCallback) {
      this.askFilePartCallback = options.askFilePartCallback;
    } else {
      this.askFilePartCallback = (
        _fileId: string,
        _offset: number,
        _limit: number
      ) => {};
    }

    this.maxBufferSize =
      options?.maxBufferSize !== undefined ? options.maxBufferSize : 1000;
    this.parallelCalls =
      options?.parallelCalls !== undefined ? options.parallelCalls : 1;

    if (options?.timeout !== undefined) {
      this.timeout = options.timeout;
    }
    if (options?.retries !== undefined) {
      this.retries = options.retries;
    }
  }

  /**
   * Check existance of a file in the pool.
   *
   * @param fileId Id of the file.
   * @returns true if the file exists.
   */
  public fileExists(fileId: string): boolean {
    return Object.keys(this.transferFiles).includes(fileId);
  }

  /**
   * Store file metadata.
   *
   * @param metadata File metadata.
   * @returns The ID of the file.
   */
  public storeFileMetadata(metadata: TransferFileMetadata): string {
    // check presence of 'id' field
    if (!metadata.id) {
      throw new Error("no 'id' field");
    }

    // check presence of 'name' field
    if (!metadata.name) {
      throw new Error("no 'name' field");
    }

    // only store it if the file is not in the pool
    if (!this.fileExists(metadata.id)) {
      this.transferFiles[metadata.id] = new TransferFile(
        metadata.id,
        metadata.name,
        metadata.type || "application/octet-stream",
        metadata.size || 0,
        metadata.bufferLength || 0,
        this.timeout,
        this.retries
      );
    }

    return metadata.id;
  }

  /**
   * Delete a file from the pool.
   *
   * @param fileId Id of the file.
   */
  public deleteFile(fileId: string): void {
    if (!this.fileExists(fileId)) {
      return;
    }

    // remove keys with the specified fileId
    this.transferFiles = Object.fromEntries(
      Object.entries(this.transferFiles).filter((x) => x[0] !== fileId)
    );
  }

  /**
   * Trigger the download of a file.
   *
   * @param fileId Id of the file.
   * @param askFilePartCallback Callback function to ask a specific part of a file.
   * @param parallelCalls Number of parallel calls to perform.
   */
  public async downloadFile(
    fileId: string,
    askFilePartCallback?: AskFilePartCallback,
    parallelCalls?: number
  ): Promise<void> {
    if (!this.fileExists(fileId)) {
      throw new Error(`file '#${fileId}' does not exist`);
    }

    const file = this.transferFiles[fileId];
    const calls = parallelCalls ? parallelCalls : this.parallelCalls;
    if (askFilePartCallback !== undefined) {
      await file.download(this.maxBufferSize, askFilePartCallback, calls);
    } else {
      await file.download(this.maxBufferSize, this.askFilePartCallback, calls);
    }
  }

  /**
   * Abort the download of a file.
   *
   * @param fileId Id of the file.
   */
  public abortFileDownload(fileId: string): void {
    if (!this.fileExists(fileId)) {
      throw new Error(`file '#${fileId}' does not exist`);
    }

    const file = this.transferFiles[fileId];
    file.setDownloading(false);
  }

  /**
   * Add a file directly to the pool.
   *
   * @param blob Blob to store to the pool.
   * @param name Name of the file.
   * @returns The metadata of the file.
   */
  public async addFile(
    blob: Blob,
    name: string
  ): Promise<TransferFileMetadata> {
    const fId = uuidv4();

    if (this.fileExists(fId)) {
      throw new Error("impossible to add this file to the pool, please retry");
    }

    const f = new TransferFile(
      fId,
      name,
      blob.type,
      blob.size,
      0,
      this.timeout,
      this.retries
    );
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
  public readFilePart(
    fileId: string,
    offset: number,
    limit: number
  ): ArrayBuffer {
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
  public receiveFilePart(
    fileId: string,
    offset: number,
    limit: number,
    data: ArrayBuffer
  ): void {
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
  public getFile(fileId: string): TransferFileBlob {
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
  public getBlob(fileId: string): Blob {
    if (!this.fileExists(fileId)) {
      throw new Error(`file '#${fileId}' does not exist`);
    }

    return this.transferFiles[fileId].getBlob();
  }

  /**
   * Remove all the data of the file.
   *
   * @param fileId Id of the file.
   */
  public clearFile(fileId: string): void {
    if (!this.fileExists(fileId)) {
      throw new Error(`file '#${fileId}' does not exist`);
    }

    this.transferFiles[fileId].clear();
  }
}
