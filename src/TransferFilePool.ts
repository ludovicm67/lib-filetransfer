import Blob from "cross-blob";
import { uuid } from 'uuidv4';
import { TransferFile } from "./TransferFile.js";

type TransferFilePoolFiles = Record<string, TransferFile>;

export type TransferFileMetadata = {
  id: string;
  name: string;
  type: string;
  size: number;
};

export class TransferFilePool {
  transferFiles: TransferFilePoolFiles;

  constructor() {
    this.transferFiles = {};
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
   */
  downloadFile(fileId: string): void {
    if (!this.fileExists(fileId)) {
      throw new Error(`file '#${fileId}' does not exist`);
    }

    const file = this.transferFiles[fileId];
    file.download();
  }

  addFile(blob: Blob, name: string): TransferFileMetadata {
    const fId = uuid();

    if (this.fileExists(fId)) {
      throw new Error('impossible to add this file to the pool, please retry');
    }

    const f = new TransferFile(fId, name, blob.type, blob.size);
    f.setBlob(blob);
    f.isComplete();
    this.transferFiles[fId] = f;

    return f.getMetadata();
  }
}
