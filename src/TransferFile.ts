import {
  AskFilePartCallback,
  TransferFileMetadata,
} from "./TransferFilePool.js";

type TransferFilePart = {
  limit: number;
  data: ArrayBuffer;
};

type TransferFileParts = Map<number, TransferFilePart>;

/**
 * Someone waiting for a part to arrive, woken up by `receiveFilePart()` or by
 * its own timeout.
 */
type TransferFilePartWaiter = {
  limit: number;
  notify: (received: boolean) => void;
};

export type TransferFileInfos = {
  id: string;
  name: string;
  type: string;
  size: number;
  bufferLength: number;

  /**
   * Number of bytes of the file that are available so far, to display the
   * progress of a download: it goes up as the parts are received, and is the
   * full length of the file once it is complete.
   */
  receivedBytes: number;

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
  private parts: TransferFileParts = new Map(); // while fetching content
  private partsBufferSize: number | undefined = undefined; // size they were asked with
  private partWaiters: Map<number, Set<TransferFilePartWaiter>> = new Map();
  private receivedBytes: number = 0; // bytes held in `parts`
  private data: Blob | undefined = undefined; // full data
  private bufferLength: number;

  // state
  private inFlight: Promise<void> | undefined = undefined; // running download
  private complete: boolean = false; // data is ready and complete
  private errored: boolean = false; // an error occured
  private downloading: boolean = false; // the file is being downloaded

  // store error message (or some random information)
  private message: string | undefined = undefined;

  // configuration
  private timeout: number = 1;
  private retries: number = 10;
  private keepPartsOnFailure: boolean = false;

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
   * @param keepPartsOnFailure Keep the already received parts when a download fails (default: `false`).
   */
  constructor(
    id: string,
    name: string,
    type: string,
    size: number,
    bufferLength: number,
    timeout?: number,
    retries?: number,
    keepPartsOnFailure?: boolean
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
    if (keepPartsOnFailure !== undefined) {
      this.keepPartsOnFailure = keepPartsOnFailure;
    }
  }

  /**
   * Set the file as being downloaded.
   *
   * @param isDownloading True if the file is being downloaded.
   */
  public setDownloading(isDownloading: boolean = true): void {
    this.downloading = isDownloading;

    // Nothing is going to be received anymore: release whoever is waiting for
    // a part, instead of letting them sit there until their timeout.
    if (!isDownloading) {
      const pending = [...this.partWaiters.values()];
      this.partWaiters.clear();

      for (const waiters of pending) {
        for (const waiter of waiters) {
          waiter.notify(false);
        }
      }
    }
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
      type: this.type,
      size: this.size,
      bufferLength: this.bufferLength,

      // once the file is complete the parts are released, but every byte of it
      // is there: the Blob holds them
      receivedBytes: this.complete ? this.bufferLength : this.receivedBytes,

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
      const orderedParts = [...this.parts.entries()]
        .sort(([offsetX], [offsetY]) => offsetX - offsetY)
        .map(([, part]) => part.data);

      this.data = new Blob(orderedParts, {
        type: this.type,
      });
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
    if (this.inFlight !== undefined) {
      // a download is already running: wait for it, instead of resolving right
      // away as if the file was ready
      return this.inFlight;
    }

    if (maxBufferSize <= 0) {
      throw new Error(
        `maxBufferSize should be greater than 0, got: ${maxBufferSize}`
      );
    }

    if (this.bufferLength < 0) {
      throw new Error(
        `bufferLength should not be negative, got: ${this.bufferLength}`
      );
    }

    // A zero-length buffer is only legitimate for a genuinely empty file.
    // Otherwise the metadata is inconsistent and the download would complete
    // instantly with an empty Blob instead of failing.
    if (this.bufferLength === 0 && this.size > 0) {
      throw new Error(
        `file '#${this.id}' announces a size of ${this.size} but a bufferLength of 0`
      );
    }

    if (timeout === undefined) {
      timeout = this.timeout;
    }
    if (retries === undefined) {
      retries = this.retries;
    }

    this.inFlight = this.run(
      maxBufferSize,
      askFilePartCallback,
      parallelCalls,
      timeout,
      retries
    );

    try {
      await this.inFlight;
    } finally {
      this.inFlight = undefined;
    }
  }

  /**
   * Perform the actual download. Callers go through `download()`, which makes
   * sure a single run is in flight at any time.
   *
   * @param maxBufferSize Maximum length for the data to ask at one time.
   * @param askFilePartCallback Function that will be called to ask for some parts of the file.
   * @param parallelCalls Number of parallel calls to perform.
   * @param timeout Timeout for a single check in seconds.
   * @param retries Number of retries before considering it as a failure.
   */
  private async run(
    maxBufferSize: number,
    askFilePartCallback: AskFilePartCallback,
    parallelCalls: number,
    timeout: number,
    retries: number
  ): Promise<void> {
    // Parts kept from a previous attempt are only reusable if they were asked
    // with the same buffer size: mixing sizes would produce a corrupted Blob.
    if (this.partsBufferSize !== maxBufferSize) {
      this.parts = new Map();
      this.receivedBytes = 0;
    }
    this.partsBufferSize = maxBufferSize;

    this.setDownloading(true);
    this.setError(undefined, false);

    try {
      const partsCount = Math.ceil(this.bufferLength / maxBufferSize);

      // A fixed number of workers walk through the parts, rather than turning
      // every part into a queued promise up front: for a big file that would
      // cost a lot of memory before a single byte is even transferred.
      const workers = Math.max(1, Math.min(parallelCalls, partsCount));
      let nextPart = 0;
      let failure: unknown = undefined;

      const worker = async (): Promise<void> => {
        while (failure === undefined) {
          const part = nextPart++;
          if (part >= partsCount) {
            return;
          }

          try {
            await this.waitFilePartWithRetry(
              askFilePartCallback,
              part * maxBufferSize,
              maxBufferSize,
              timeout,
              retries
            );
          } catch (e: unknown) {
            failure = e;
            return;
          }
        }
      };

      // Every worker has settled by the time this resolves, so none of them is
      // still around to store a part after a failure released them.
      await Promise.all(Array.from({ length: workers }, () => worker()));

      if (failure !== undefined) {
        throw failure;
      }

      this.setComplete(true);
      // Build the Blob while the parts are still around, then release them:
      // the Blob holds the data from now on.
      this.getBlob();
      this.parts = new Map();
      this.receivedBytes = 0;
    } catch (e: any) {
      const msg = e?.message || "something went wrong";
      this.setComplete(false);
      this.setError(msg);

      // Drop what was received, unless the caller asked to keep it so that a
      // later attempt can resume instead of asking for everything again.
      if (!this.keepPartsOnFailure) {
        this.parts = new Map();
        this.receivedBytes = 0;
      }

      // re-throw the error we catched, keeping the original one as the cause
      throw new Error(msg, { cause: e });
    } finally {
      // Always run: leaving `downloading` stuck on true would make every later
      // download() call return early as if it had succeeded.
      this.setDownloading(false);
    }
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
   *
   * The Blob is kept as it is: its content is only read when a part of it is
   * requested. A Blob coming from an `<input type="file">` is backed by the
   * file on disk, so a file of any size can be sent without ever being held
   * in memory as a whole.
   */
  public async setBlob(blob: Blob): Promise<void> {
    this.data = blob;
    this.bufferLength = blob.size;
    this.setComplete(true);
    this.setDownloading(false);
    this.setError(undefined, false);
  }

  /**
   * Read `limit` bytes at maximum from `offset` from the file.
   *
   * Only the requested slice is read: the rest of the file stays where it is,
   * instead of being loaded in memory.
   *
   * @param offset Offset from the start.
   * @param limit Maximum number of bytes to return.
   * @returns ArrayBuffer with the requested file part.
   */
  public async readFilePart(
    offset: number,
    limit: number
  ): Promise<ArrayBuffer> {
    if (this.data === undefined) {
      throw new Error(`no content to read for file '#${this.id}'`);
    }

    return this.data.slice(offset, offset + limit).arrayBuffer();
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
    // a part can be delivered twice: only count the one we keep
    const previousPart = this.parts.get(offset);
    if (previousPart !== undefined) {
      this.receivedBytes -= previousPart.data.byteLength;
    }
    this.receivedBytes += data.byteLength;

    this.parts.set(offset, { limit, data });

    // wake up whoever is waiting for this exact part
    const waiters = this.partWaiters.get(offset);
    if (waiters === undefined) {
      return;
    }
    for (const waiter of waiters) {
      if (waiter.limit === limit) {
        waiter.notify(true);
      }
    }
  }

  /**
   * Check the presence of a specific part of the file.
   *
   * @param offset Offset from the start.
   * @param limit The requested limit.
   * @returns true if the part exists.
   */
  public hasPart(offset: number, limit: number): boolean {
    const part = this.parts.get(offset);

    return part !== undefined && part.limit === limit;
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
    if (this.hasPart(offset, limit)) {
      return true;
    }

    // The part is not there yet: register a waiter that `receiveFilePart()`
    // resolves as soon as it lands, so we do not have to poll for it.
    return new Promise<boolean>((resolve) => {
      const waiter: TransferFilePartWaiter = {
        limit,
        notify: (received: boolean) => {
          clearTimeout(timer);

          const waiters = this.partWaiters.get(offset);
          if (waiters !== undefined) {
            waiters.delete(waiter);
            if (waiters.size === 0) {
              this.partWaiters.delete(offset);
            }
          }

          resolve(received);
        },
      };

      const timer = setTimeout(() => waiter.notify(false), timeout * 1000);

      let waiters = this.partWaiters.get(offset);
      if (waiters === undefined) {
        waiters = new Set();
        this.partWaiters.set(offset, waiters);
      }
      waiters.add(waiter);
    });
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

    let success = false;

    for (let i = retries; i >= 0; i--) {
      // the download may have been aborted while we were waiting
      if (!this.isDownloading()) {
        throw new Error("download aborted");
      }

      // ask (or re-ask) for the part, then wait for it to land
      askFilePartCallback(this.id, offset, limit);

      const receivedPart = await this.waitFilePart(offset, limit, timeout);
      if (receivedPart) {
        success = true;
        break;
      }
    }

    if (!success) {
      if (!this.isDownloading()) {
        throw new Error("download aborted");
      }

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
    this.parts = new Map();
    this.partsBufferSize = undefined;
    this.receivedBytes = 0;
  }
}
