import { v4 as uuidv4 } from "uuid";
import {
  TransferFile,
  TransferFileBlob,
  TransferFileInfos,
} from "./TransferFile.js";

type TransferFilePoolFiles = Map<string, TransferFile>;

export type TransferFileMetadata = {
  id: string;
  name: string;
  type: string;

  /** Size of the file, in bytes: what the receiver has to download. */
  size: number;
};

export type AskFilePartCallback = (
  fileId: string,
  offset: number,
  limit: number
) => void;

export type TransferFilePoolOptions = {
  askFilePartCallback?: AskFilePartCallback;

  /**
   * Number of bytes to ask for at a time. Defaults to `16384` (16 KiB), the
   * message size a WebRTC data channel handles everywhere.
   *
   * Smaller parts mean more requests, and more bookkeeping for each of them.
   */
  maxBufferSize?: number;

  /**
   * How many parts to ask for at the same time. Defaults to `4`.
   *
   * Requesting parts one by one leaves the channel idle while each one travels,
   * so overlapping them is what makes a transfer fast.
   */
  parallelCalls?: number;

  /** Seconds to wait for a part before asking for it again. Defaults to `1`. */
  timeout?: number;

  /** How many times a part is re-asked before giving up. Defaults to `10`. */
  retries?: number;

  /**
   * Keep the parts that were already received when a download fails, so that a
   * later attempt only asks for the missing ones instead of downloading the
   * whole file again.
   *
   * Those parts are held in memory until the download succeeds or
   * `clearFile()` is called, which for a large file can be a lot of memory.
   * It therefore defaults to `false`: a failed download is dropped, and the
   * next attempt starts over.
   */
  keepPartsOnFailure?: boolean;
};

export class TransferFilePool {
  private transferFiles: TransferFilePoolFiles;

  // configuration
  private maxBufferSize: number;
  private parallelCalls: number;
  private timeout: number = 1;
  private retries: number = 10;
  private keepPartsOnFailure: boolean = false;

  // callbacks
  private askFilePartCallback: AskFilePartCallback;

  constructor(options?: TransferFilePoolOptions) {
    this.transferFiles = new Map();

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
      options?.maxBufferSize !== undefined ? options.maxBufferSize : 16384;
    this.parallelCalls =
      options?.parallelCalls !== undefined ? options.parallelCalls : 4;

    if (options?.timeout !== undefined) {
      this.timeout = options.timeout;
    }
    if (options?.retries !== undefined) {
      this.retries = options.retries;
    }
    if (options?.keepPartsOnFailure !== undefined) {
      this.keepPartsOnFailure = options.keepPartsOnFailure;
    }
  }

  /**
   * Check existance of a file in the pool.
   *
   * @param fileId Id of the file.
   * @returns true if the file exists.
   */
  public fileExists(fileId: string): boolean {
    return this.transferFiles.has(fileId);
  }

  /**
   * Get a file of the pool, or throw if it is not there.
   *
   * @param fileId Id of the file.
   * @returns The requested file.
   */
  private getTransferFile(fileId: string): TransferFile {
    const file = this.transferFiles.get(fileId);

    if (file === undefined) {
      throw new Error(`file '#${fileId}' does not exist`);
    }

    return file;
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

    // check presence of 'size' field: 0 is fine (an empty file), missing is
    // not -- the download would otherwise complete at once, with no content
    if (metadata.size === undefined || metadata.size === null) {
      throw new Error("no 'size' field");
    }

    // only store it if the file is not in the pool
    if (!this.fileExists(metadata.id)) {
      this.transferFiles.set(
        metadata.id,
        new TransferFile(
          metadata.id,
          metadata.name,
          metadata.type || "application/octet-stream",
          metadata.size,
          this.timeout,
          this.retries,
          this.keepPartsOnFailure
        )
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
    this.transferFiles.delete(fileId);
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
    const file = this.getTransferFile(fileId);
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
    const file = this.getTransferFile(fileId);
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
      this.timeout,
      this.retries,
      this.keepPartsOnFailure
    );
    await f.setBlob(blob);
    this.transferFiles.set(fId, f);

    return f.getMetadata();
  }

  /**
   * Read a specific part of a file.
   *
   * Only that part is read: the file is never loaded as a whole.
   *
   * @param fileId Id of the file.
   * @param offset From where to read.
   * @param limit Maximum lenght of data we want to read.
   * @returns ArrayBuffer containing the requested part of the file.
   */
  public async readFilePart(
    fileId: string,
    offset: number,
    limit: number
  ): Promise<ArrayBuffer> {
    return this.getTransferFile(fileId).readFilePart(offset, limit);
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
    this.getTransferFile(fileId).receiveFilePart(offset, limit, data);
  }

  /**
   * Get informations representing a specific file.
   *
   * @param fileId Id of the file.
   * @returns Informations representing the requested file.
   */
  public getFile(fileId: string): TransferFileBlob {
    return this.getTransferFile(fileId).getFile();
  }

  /**
   * Get informations about a specific file, such as how much of it was already
   * received.
   *
   * @param fileId Id of the file.
   * @returns Informations about the requested file.
   */
  public getFileInfos(fileId: string): TransferFileInfos {
    return this.getTransferFile(fileId).getInfos();
  }

  /**
   * Get the Blob of a specific complete file.
   *
   * @param fileId Id of the file.
   * @returns The Blob of the complete file.
   */
  public getBlob(fileId: string): Blob {
    return this.getTransferFile(fileId).getBlob();
  }

  /**
   * Remove all the data of the file.
   *
   * @param fileId Id of the file.
   */
  public clearFile(fileId: string): void {
    this.getTransferFile(fileId).clear();
  }
}
