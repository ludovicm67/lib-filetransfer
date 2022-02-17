import { TransferFile } from "./TransferFile";

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

  fileExists(fileId: string) {
    return Object.keys(this.transferFiles).includes(fileId);
  }

  receiveFileMetadata(metadata: TransferFileMetadata) {
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

    // check presence of 'size' field
    if (!metadata.size) {
      throw new Error("no 'size' field");
    }

    if (!this.fileExists(metadata.id)) {
      this.transferFiles[metadata.id] = new TransferFile(
        metadata.id,
        metadata.name,
        metadata.type,
        metadata.size,
      );
    }
  };
}
