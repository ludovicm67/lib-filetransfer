import { describe, it } from "node:test";
import { deepStrictEqual, rejects, throws } from "node:assert";
import { TransferFile, TransferFilePool } from "../lib/index.js";

describe("testing the TransferFilePool class", () => {
  it("should initialize without throwing an error", () => {
    new TransferFilePool();
  });

  it("should return false if the file does not exist", () => {
    const pool = new TransferFilePool();
    const fileExists = pool.fileExists("randomId");
    deepStrictEqual(fileExists, false);
  });

  it("should return true if the file exist", async () => {
    const pool = new TransferFilePool();
    const blob = new Blob(["test"], {
      type: "text/plain",
    });
    const { id } = await pool.addFile(blob, "test.txt");
    const fileExists = pool.fileExists(id);
    deepStrictEqual(fileExists, true);
  });

  it("should return false if the file was deleted", async () => {
    const pool = new TransferFilePool();
    const blob = new Blob(["test"], {
      type: "text/plain",
    });
    const { id } = await pool.addFile(blob, "test.txt");
    pool.deleteFile(id);
    const fileExists = pool.fileExists(id);
    deepStrictEqual(fileExists, false);
  });

  it("should no throw if all required metadata fields are filled", async () => {
    const pool = new TransferFilePool();
    const blob = new Blob(["test"], {
      type: "text/plain",
    });
    const { id, name, type } = await pool.addFile(blob, "test.txt");
    pool.storeFileMetadata({
      id,
      name,
      type,
    });
  });

  it("should throw if the 'id' field is missing", () => {
    const pool = new TransferFilePool();
    throws(() => pool.storeFileMetadata({
      name: "test.txt",
      type: "text/plain",
    }), /no 'id' field/);

    throws(() => pool.storeFileMetadata({
      type: "text/plain",
    }), /no 'id' field/);

    throws(() => pool.storeFileMetadata({}), /no 'id' field/);
    throws(() => pool.storeFileMetadata());
  });

  it("should throw if the 'name' field is missing", () => {
    const pool = new TransferFilePool();
    throws(() => pool.storeFileMetadata({
      id: "randomId",
      type: "text/plain",
    }), /no 'name' field/);

    throws(() => pool.storeFileMetadata({
      id: "randomId",
    }), /no 'name' field/);
  });

  it("should crash when the receiver do not know about the file", async () => {
    /**
     * SENDER
     */
    const senderPool = new TransferFilePool({});
    const file = new Blob(["Hello world!"], {
      type: "text/plain",
    });
    const fileMetadata = await senderPool.addFile(file, "test.txt");

    /**
     * RECEIVER
     */
    let sendCb = (_fileId, _offset, _limit, _data) => { };
    const receiverPool = new TransferFilePool({
      maxBufferSize: 5,
      parallelCalls: 100,
      askFilePartCallback: async (fileId, offset, limit) => {
        // imagine the receiver sending a message to the sender to ask this part of this file…

        // sender part:
        const partData = senderPool.readFilePart(fileId, offset, limit);

        // imagine the sender sends the data to the receiver…
        await new Promise(r => setTimeout(r, Math.random() * 200));

        // receiver part:
        sendCb(fileId, offset, limit, partData);
      }
    });
    sendCb = (fileId, offset, limit, data) => {
      receiverPool.receiveFilePart(fileId, offset, limit, data);
    };

    // imagine the sender sent the fileMetadata on a dedicated channel…
    const receivedFileMetadata = { ...fileMetadata };
    const fileId = receivedFileMetadata.id;
    await rejects(
      async () => {
        await receiverPool.downloadFile(fileId);
      },
      new Error(`file '#${fileId}' does not exist`)
    );
  });

  it("should be able to send a file", async () => {
    /**
     * SENDER
     */
    const senderPool = new TransferFilePool({});
    const file = new Blob(["Hello world!"], {
      type: "text/plain",
    });
    const fileMetadata = await senderPool.addFile(file, "test.txt");

    /**
     * RECEIVER
     */
    let sendCb = (_fileId, _offset, _limit, _data) => { };
    const receiverPool = new TransferFilePool({
      maxBufferSize: 5,
      parallelCalls: 100,
      askFilePartCallback: async (fileId, offset, limit) => {
        // imagine the receiver sending a message to the sender to ask this part of this file…

        // sender part:
        const partData = senderPool.readFilePart(fileId, offset, limit);

        // imagine the sender sends the data to the receiver…
        await new Promise(r => setTimeout(r, Math.random() * 200));

        // receiver part:
        sendCb(fileId, offset, limit, partData);
      }
    });
    sendCb = (fileId, offset, limit, data) => {
      receiverPool.receiveFilePart(fileId, offset, limit, data);
    };

    // imagine the sender sent the fileMetadata on a dedicated channel…
    const receivedFileMetadata = { ...fileMetadata };

    // so we store the file metadata in the pool
    receiverPool.storeFileMetadata(receivedFileMetadata);

    // imagine the user click on the download button
    await receiverPool.downloadFile(receivedFileMetadata.id);
    const finalFile = receiverPool.getFile(receivedFileMetadata.id);
    const finalContent = await finalFile.data.text();

    deepStrictEqual(finalContent, "Hello world!");
  });

  it("should have the same amount of ask and sent parts", async () => {
    let askCounter = 0;
    let sentCounter = 0;

    /**
     * SENDER
     */
    const senderPool = new TransferFilePool({});
    const file = new Blob(["Hello world!"], {
      type: "text/plain",
    });
    const fileMetadata = await senderPool.addFile(file, "test.txt");

    /**
     * RECEIVER
     */
    let sendCb = (_fileId, _offset, _limit, _data) => { };
    const receiverPool = new TransferFilePool({
      maxBufferSize: 5,
      parallelCalls: 100,
      askFilePartCallback: async (fileId, offset, limit) => {
        askCounter++;
        // imagine the receiver sending a message to the sender to ask this part of this file…

        // sender part:
        const partData = senderPool.readFilePart(fileId, offset, limit);

        // imagine the sender sends the data to the receiver…
        await new Promise(r => setTimeout(r, Math.random() * 200));

        // receiver part:
        sendCb(fileId, offset, limit, partData);
      }
    });
    sendCb = (fileId, offset, limit, data) => {
      sentCounter++;
      receiverPool.receiveFilePart(fileId, offset, limit, data);
    };

    // imagine the sender sent the fileMetadata on a dedicated channel…
    const receivedFileMetadata = { ...fileMetadata };

    // so we store the file metadata in the pool
    receiverPool.storeFileMetadata(receivedFileMetadata);

    // imagine the user click on the download button
    await receiverPool.downloadFile(receivedFileMetadata.id);

    // check our counters
    deepStrictEqual(askCounter, sentCounter);
  });


  it("should send the file without any retry", async () => {
    let counter = 0;

    /**
     * SENDER
     */
    const senderPool = new TransferFilePool({});
    const file = new Blob(["Hello world!"], {
      type: "text/plain",
    });
    const fileMetadata = await senderPool.addFile(file, "test.txt");

    /**
     * RECEIVER
     */
    let sendCb = (_fileId, _offset, _limit, _data) => { };
    const receiverPool = new TransferFilePool({
      maxBufferSize: 5,
      parallelCalls: 100,
      askFilePartCallback: async (fileId, offset, limit) => {
        counter++;
        // imagine the receiver sending a message to the sender to ask this part of this file…

        // sender part:
        const partData = senderPool.readFilePart(fileId, offset, limit);

        // imagine the sender sends the data to the receiver…
        await new Promise(r => setTimeout(r, Math.random() * 200));

        // receiver part:
        sendCb(fileId, offset, limit, partData);
      }
    });
    sendCb = (fileId, offset, limit, data) => {
      receiverPool.receiveFilePart(fileId, offset, limit, data);
    };

    // imagine the sender sent the fileMetadata on a dedicated channel…
    const receivedFileMetadata = { ...fileMetadata };

    // so we store the file metadata in the pool
    receiverPool.storeFileMetadata(receivedFileMetadata);

    // imagine the user click on the download button
    await receiverPool.downloadFile(receivedFileMetadata.id);

    // check our counter
    deepStrictEqual(counter, 3); // should ask parts: 0, 5 and 10 => 3 requests
  });

  it("should send the file with exactly one retry", async () => {
    let counter = 0;

    /**
     * SENDER
     */
    const senderPool = new TransferFilePool({});
    const file = new Blob(["Hello world!"], {
      type: "text/plain",
    });
    const fileMetadata = await senderPool.addFile(file, "test.txt");

    /**
     * RECEIVER
     */
    let sendCb = (_fileId, _offset, _limit, _data) => { };
    const receiverPool = new TransferFilePool({
      maxBufferSize: 5,
      parallelCalls: 100,
      askFilePartCallback: async (fileId, offset, limit) => {
        counter++;
        // imagine the receiver sending a message to the sender to ask this part of this file…

        // sender part:
        const partData = senderPool.readFilePart(fileId, offset, limit);

        // imagine the sender sends the data to the receiver…
        await new Promise(r => setTimeout(r, 1500)); // default timeout is set to 1000

        // receiver part:
        sendCb(fileId, offset, limit, partData);
      }
    });
    sendCb = (fileId, offset, limit, data) => {
      receiverPool.receiveFilePart(fileId, offset, limit, data);
    };

    // imagine the sender sent the fileMetadata on a dedicated channel…
    const receivedFileMetadata = { ...fileMetadata };

    // so we store the file metadata in the pool
    receiverPool.storeFileMetadata(receivedFileMetadata);

    // imagine the user click on the download button
    await receiverPool.downloadFile(receivedFileMetadata.id);
    const finalFile = receiverPool.getFile(receivedFileMetadata.id);
    const finalContent = await finalFile.data.text();

    // check our counter
    deepStrictEqual(counter, 6); // should ask parts: 0, 5 and 10 => 3 requests * 2 (for 1 retry)

    // file should not be corrupted
    deepStrictEqual(finalContent, "Hello world!");
  });

  it("should send the file with multiple retries", async () => {
    let counter = 0;

    /**
     * SENDER
     */
    const senderPool = new TransferFilePool({});
    const file = new Blob(["Hello world!"], {
      type: "text/plain",
    });
    const fileMetadata = await senderPool.addFile(file, "test.txt");

    /**
     * RECEIVER
     */
    let sendCb = (_fileId, _offset, _limit, _data) => { };
    const receiverPool = new TransferFilePool({
      maxBufferSize: 5,
      parallelCalls: 100,
      askFilePartCallback: async (fileId, offset, limit) => {
        counter++;
        // imagine the receiver sending a message to the sender to ask this part of this file…

        // sender part:
        const partData = senderPool.readFilePart(fileId, offset, limit);

        // imagine the sender sends the data to the receiver…
        await new Promise(r => setTimeout(r, 3500)); // default timeout is set to 1000

        // receiver part:
        sendCb(fileId, offset, limit, partData);
      }
    });
    sendCb = (fileId, offset, limit, data) => {
      receiverPool.receiveFilePart(fileId, offset, limit, data);
    };

    // imagine the sender sent the fileMetadata on a dedicated channel…
    const receivedFileMetadata = { ...fileMetadata };

    // so we store the file metadata in the pool
    receiverPool.storeFileMetadata(receivedFileMetadata);

    // imagine the user click on the download button
    await receiverPool.downloadFile(receivedFileMetadata.id);
    const finalFile = receiverPool.getFile(receivedFileMetadata.id);
    const finalContent = await finalFile.data.text();

    // check our counter
    deepStrictEqual(counter, 12); // should ask parts: 0, 5 and 10 => 3 requests * 4 (for 3 retry)

    // file should not be corrupted
    deepStrictEqual(finalContent, "Hello world!");
  });

  it("should throw because of too many retries", async () => {
    /**
     * SENDER
     */
    const senderPool = new TransferFilePool({});
    const file = new Blob(["Hello world!"], {
      type: "text/plain",
    });
    const fileMetadata = await senderPool.addFile(file, "test.txt");

    /**
     * RECEIVER
     */
    let sendCb = (_fileId, _offset, _limit, _data) => { };
    const receiverPool = new TransferFilePool({
      maxBufferSize: 5,
      parallelCalls: 100,
      askFilePartCallback: async (fileId, offset, limit) => {
        // imagine the receiver sending a message to the sender to ask this part of this file…

        // sender part:
        const partData = senderPool.readFilePart(fileId, offset, limit);

        // imagine the sender sends the data to the receiver with some delay…
        await new Promise(r => setTimeout(r, 3500)); // default timeout is set to 1000

        // receiver part:
        sendCb(fileId, offset, limit, partData);
      },
      retries: 1,
    });
    sendCb = (fileId, offset, limit, data) => {
      receiverPool.receiveFilePart(fileId, offset, limit, data);
    };

    // imagine the sender sent the fileMetadata on a dedicated channel…
    const receivedFileMetadata = { ...fileMetadata };

    // so we store the file metadata in the pool
    receiverPool.storeFileMetadata(receivedFileMetadata);

    // imagine the user click on the download button
    await rejects(
      async () => {
        await receiverPool.downloadFile(receivedFileMetadata.id);
      },
      /missing part/,
    );
  });

  it("should throw because of aborted file download", async () => {
    /**
     * SENDER
     */
    const senderPool = new TransferFilePool({});
    const file = new Blob(["Hello world!"], {
      type: "text/plain",
    });
    const fileMetadata = await senderPool.addFile(file, "test.txt");

    /**
     * RECEIVER
     */
    let sendCb = (_fileId, _offset, _limit, _data) => { };
    const receiverPool = new TransferFilePool({
      maxBufferSize: 5,
      parallelCalls: 100,
      askFilePartCallback: async (fileId, offset, limit) => {
        // imagine the receiver sending a message to the sender to ask this part of this file…

        // sender part:
        const partData = senderPool.readFilePart(fileId, offset, limit);

        // imagine the sender sends the data to the receiver with some delay…
        await new Promise(r => setTimeout(r, 200));

        // receiver part:
        sendCb(fileId, offset, limit, partData);
      },
      retries: 3,
    });
    sendCb = (fileId, offset, limit, data) => {
      receiverPool.receiveFilePart(fileId, offset, limit, data);
    };

    // imagine the sender sent the fileMetadata on a dedicated channel…
    const receivedFileMetadata = { ...fileMetadata };

    // so we store the file metadata in the pool
    receiverPool.storeFileMetadata(receivedFileMetadata);

    // imagine the user click on the download button
    const downloadPromise = receiverPool.downloadFile(receivedFileMetadata.id);
    receiverPool.abortFileDownload(receivedFileMetadata.id);
    await rejects(downloadPromise, new Error("download aborted"));
  });

  it("should be able to clear a file", async () => {
    /**
     * SENDER
     */
    const senderPool = new TransferFilePool({});
    const file = new Blob(["Hello world!"], {
      type: "text/plain",
    });
    const fileMetadata = await senderPool.addFile(file, "test.txt");

    /**
     * RECEIVER
     */
    let sendCb = (_fileId, _offset, _limit, _data) => { };
    const receiverPool = new TransferFilePool({
      maxBufferSize: 5,
      parallelCalls: 100,
      askFilePartCallback: async (fileId, offset, limit) => {
        // imagine the receiver sending a message to the sender to ask this part of this file…

        // sender part:
        const partData = senderPool.readFilePart(fileId, offset, limit);

        // imagine the sender sends the data to the receiver…
        await new Promise(r => setTimeout(r, Math.random() * 200));

        // receiver part:
        sendCb(fileId, offset, limit, partData);
      }
    });
    sendCb = (fileId, offset, limit, data) => {
      receiverPool.receiveFilePart(fileId, offset, limit, data);
    };

    // imagine the sender sent the fileMetadata on a dedicated channel…
    const receivedFileMetadata = { ...fileMetadata };

    // so we store the file metadata in the pool
    receiverPool.storeFileMetadata(receivedFileMetadata);

    // imagine the user click on the download button
    await receiverPool.downloadFile(receivedFileMetadata.id);
    const finalFile = receiverPool.getFile(receivedFileMetadata.id);
    const finalContent = await finalFile.data.text();
    deepStrictEqual(finalContent, "Hello world!");

    // clear the file ; it should throw an error if we try to access the file again
    receiverPool.clearFile(receivedFileMetadata.id);
    throws(() => receiverPool.getFile(receivedFileMetadata.id), /file is incomplete/);

    // trigger the download of the file again
    await receiverPool.downloadFile(receivedFileMetadata.id);
    const reDownloadedFile = receiverPool.getFile(receivedFileMetadata.id);
    const reDownloadedFileContent = await reDownloadedFile.data.text();
    deepStrictEqual(reDownloadedFileContent, "Hello world!");
  });

  it("should be able to download again after a failed download", async () => {
    /**
     * SENDER
     */
    const senderPool = new TransferFilePool({});
    const file = new Blob(["Hello world!"], {
      type: "text/plain",
    });
    const fileMetadata = await senderPool.addFile(file, "test.txt");

    /**
     * RECEIVER
     */
    let deliver = false; // during the first attempt, no part ever arrives
    const receiverPool = new TransferFilePool({
      maxBufferSize: 5,
      parallelCalls: 100,
      timeout: 0,
      retries: 0,
      askFilePartCallback: (fileId, offset, limit) => {
        if (!deliver) {
          return;
        }
        receiverPool.receiveFilePart(
          fileId,
          offset,
          limit,
          senderPool.readFilePart(fileId, offset, limit)
        );
      },
    });
    receiverPool.storeFileMetadata({ ...fileMetadata });

    // first attempt: it fails, since nothing is ever delivered
    await rejects(
      async () => {
        await receiverPool.downloadFile(fileMetadata.id);
      },
      /missing part/,
    );

    // second attempt: it has to actually retry, and not return right away as
    // if the file was already there
    deliver = true;
    await receiverPool.downloadFile(fileMetadata.id);
    const finalFile = receiverPool.getFile(fileMetadata.id);
    const finalContent = await finalFile.data.text();
    deepStrictEqual(finalContent, "Hello world!");
  });

  it("should wait for the running download when called a second time", async () => {
    /**
     * SENDER
     */
    const senderPool = new TransferFilePool({});
    const file = new Blob(["Hello world!"], {
      type: "text/plain",
    });
    const fileMetadata = await senderPool.addFile(file, "test.txt");

    /**
     * RECEIVER
     */
    let sendCb = (_fileId, _offset, _limit, _data) => { };
    const receiverPool = new TransferFilePool({
      maxBufferSize: 5,
      parallelCalls: 100,
      askFilePartCallback: async (fileId, offset, limit) => {
        const partData = senderPool.readFilePart(fileId, offset, limit);
        await new Promise(r => setTimeout(r, 100));
        sendCb(fileId, offset, limit, partData);
      },
    });
    sendCb = (fileId, offset, limit, data) => {
      receiverPool.receiveFilePart(fileId, offset, limit, data);
    };
    receiverPool.storeFileMetadata({ ...fileMetadata });

    // imagine the user clicking twice on the download button
    const firstCall = receiverPool.downloadFile(fileMetadata.id);
    const secondCall = receiverPool.downloadFile(fileMetadata.id);

    // the second call has to wait for the running download to be over
    await secondCall;
    const finalFile = receiverPool.getFile(fileMetadata.id);
    const finalContent = await finalFile.data.text();
    deepStrictEqual(finalContent, "Hello world!");

    await firstCall;
  });

  it("should be able to send an empty file", async () => {
    /**
     * SENDER
     */
    const senderPool = new TransferFilePool({});
    const file = new Blob([], {
      type: "text/plain",
    });
    const fileMetadata = await senderPool.addFile(file, "empty.txt");

    /**
     * RECEIVER
     */
    const receiverPool = new TransferFilePool({
      maxBufferSize: 5,
      askFilePartCallback: (fileId, offset, limit) => {
        receiverPool.receiveFilePart(
          fileId,
          offset,
          limit,
          senderPool.readFilePart(fileId, offset, limit)
        );
      },
    });
    receiverPool.storeFileMetadata({ ...fileMetadata });

    await receiverPool.downloadFile(fileMetadata.id);
    const finalFile = receiverPool.getFile(fileMetadata.id);
    const finalContent = await finalFile.data.text();
    deepStrictEqual(finalContent, "");
  });

  it("should throw when the announced metadata is inconsistent", async () => {
    const pool = new TransferFilePool({ maxBufferSize: 5 });

    // a size is announced, but no bufferLength: without a check the download
    // would complete instantly, with an empty Blob
    const fileId = pool.storeFileMetadata({
      id: "inconsistent",
      name: "test.txt",
      type: "text/plain",
      size: 12,
    });

    await rejects(
      async () => {
        await pool.downloadFile(fileId);
      },
      /announces a size of 12 but a bufferLength of 0/,
    );
  });

  it("should keep the original error as the cause of a failed download", async () => {
    const pool = new TransferFilePool({
      maxBufferSize: 5,
      timeout: 0,
      retries: 0,
    });
    const fileId = pool.storeFileMetadata({
      id: "never-delivered",
      name: "test.txt",
      type: "text/plain",
      size: 12,
      bufferLength: 12,
    });

    await rejects(
      async () => {
        await pool.downloadFile(fileId);
      },
      (err) => {
        deepStrictEqual(err.message.startsWith("missing part"), true);
        deepStrictEqual(err.cause instanceof Error, true);
        deepStrictEqual(err.cause.message, err.message);
        return true;
      },
    );
  });

  it("should start over after a failed download by default", async () => {
    /**
     * SENDER
     */
    const senderPool = new TransferFilePool({});
    const file = new Blob(["Hello world!"], {
      type: "text/plain",
    });
    const fileMetadata = await senderPool.addFile(file, "test.txt");

    /**
     * RECEIVER
     */
    // "Hello world!" is 12 bytes, so with a buffer of 5 there are 3 parts:
    // offsets 0, 5 and 10. The first attempt only delivers the first one.
    let deliverEverything = false;
    const askedOffsets = [];
    const receiverPool = new TransferFilePool({
      maxBufferSize: 5,
      parallelCalls: 100,
      timeout: 0,
      retries: 0,
      askFilePartCallback: (fileId, offset, limit) => {
        askedOffsets.push(offset);
        if (!deliverEverything && offset !== 0) {
          return;
        }
        receiverPool.receiveFilePart(
          fileId,
          offset,
          limit,
          senderPool.readFilePart(fileId, offset, limit)
        );
      },
    });
    receiverPool.storeFileMetadata({ ...fileMetadata });

    await rejects(
      async () => {
        await receiverPool.downloadFile(fileMetadata.id);
      },
      /missing part/,
    );

    // second attempt: nothing was kept, so every part is asked again
    askedOffsets.length = 0;
    deliverEverything = true;
    await receiverPool.downloadFile(fileMetadata.id);
    deepStrictEqual(askedOffsets.sort((a, b) => a - b), [0, 5, 10]);

    const finalFile = receiverPool.getFile(fileMetadata.id);
    const finalContent = await finalFile.data.text();
    deepStrictEqual(finalContent, "Hello world!");
  });

  it("should resume a failed download when keepPartsOnFailure is set", async () => {
    /**
     * SENDER
     */
    const senderPool = new TransferFilePool({});
    const file = new Blob(["Hello world!"], {
      type: "text/plain",
    });
    const fileMetadata = await senderPool.addFile(file, "test.txt");

    /**
     * RECEIVER
     */
    let deliverEverything = false;
    const askedOffsets = [];
    const receiverPool = new TransferFilePool({
      maxBufferSize: 5,
      parallelCalls: 100,
      timeout: 0,
      retries: 0,
      keepPartsOnFailure: true,
      askFilePartCallback: (fileId, offset, limit) => {
        askedOffsets.push(offset);
        if (!deliverEverything && offset !== 0) {
          return;
        }
        receiverPool.receiveFilePart(
          fileId,
          offset,
          limit,
          senderPool.readFilePart(fileId, offset, limit)
        );
      },
    });
    receiverPool.storeFileMetadata({ ...fileMetadata });

    await rejects(
      async () => {
        await receiverPool.downloadFile(fileMetadata.id);
      },
      /missing part/,
    );
    deepStrictEqual(askedOffsets.sort((a, b) => a - b), [0, 5, 10]);

    // second attempt: the part received before is kept, so it is not asked again
    askedOffsets.length = 0;
    deliverEverything = true;
    await receiverPool.downloadFile(fileMetadata.id);
    deepStrictEqual(askedOffsets.sort((a, b) => a - b), [5, 10]);

    const finalFile = receiverPool.getFile(fileMetadata.id);
    const finalContent = await finalFile.data.text();
    deepStrictEqual(finalContent, "Hello world!");
  });

  it("should not reuse kept parts asked with another buffer size", async () => {
    const content = "Hello world!"; // 12 bytes

    // sender side
    const sender = new TransferFile("s", "test.txt", "text/plain", 12, 0);
    await sender.setBlob(new Blob([content], { type: "text/plain" }));

    // receiver side, keeping the parts of a failed download around
    const receiver = new TransferFile(
      "r", "test.txt", "text/plain", 12, 12, 0, 0, true
    );

    // first attempt with a buffer of 5: only the part at offset 0 is delivered
    await rejects(
      async () => {
        await receiver.download(5, (_fileId, offset, limit) => {
          if (offset !== 0) {
            return;
          }
          receiver.receiveFilePart(offset, limit, sender.readFilePart(offset, limit));
        });
      },
      /missing part/,
    );

    // second attempt with a buffer of 4: the kept 5-byte part cannot be reused,
    // and has to be dropped instead of ending up in the final Blob
    await receiver.download(4, (_fileId, offset, limit) => {
      receiver.receiveFilePart(offset, limit, sender.readFilePart(offset, limit));
    });

    const finalContent = await receiver.getBlob().text();
    deepStrictEqual(finalContent, content);
  });

  it("should reassemble parts received out of order", async () => {
    const file = new TransferFile("f", "test.txt", "text/plain", 12, 12);

    // "Hello world!" split in 3 parts of 5 bytes, delivered backwards
    const encoder = new TextEncoder();
    file.receiveFilePart(10, 5, encoder.encode("d!").buffer);
    file.receiveFilePart(5, 5, encoder.encode(" worl").buffer);
    file.receiveFilePart(0, 5, encoder.encode("Hello").buffer);
    file.setComplete(true);

    const finalContent = await file.getBlob().text();
    deepStrictEqual(finalContent, "Hello world!");
  });

  it("should report the presence of a part as a boolean", () => {
    const file = new TransferFile("f", "test.txt", "text/plain", 12, 12);
    deepStrictEqual(file.hasPart(0, 5), false);

    file.receiveFilePart(0, 5, new ArrayBuffer(5));
    deepStrictEqual(file.hasPart(0, 5), true);

    // a part asked with another buffer size is not the one we are looking for
    deepStrictEqual(file.hasPart(0, 4), false);
    deepStrictEqual(file.hasPart(5, 5), false);
  });

  it("should ignore the deletion of a file that is not in the pool", () => {
    const pool = new TransferFilePool();
    pool.deleteFile("never-added");
    deepStrictEqual(pool.fileExists("never-added"), false);
  });

  it("should download the same file again with different buffer sizes", async () => {
    const content = "Hello world!"; // 12 bytes

    // sender side
    const sender = new TransferFile("s", "test.txt", "text/plain", 12, 0);
    await sender.setBlob(new Blob([content], { type: "text/plain" }));

    // receiver side
    const receiver = new TransferFile("r", "test.txt", "text/plain", 12, 12, 0, 0);

    // the same file, downloaded over and over with another buffer size each
    // time: clearing in between is what makes a new download really happen,
    // since a complete file has nothing left to download
    for (const bufferSize of [5, 20, 100, 75]) {
      receiver.clear();

      let askedParts = 0;
      await receiver.download(bufferSize, (_fileId, offset, limit) => {
        askedParts++;
        receiver.receiveFilePart(offset, limit, sender.readFilePart(offset, limit));
      });

      deepStrictEqual(askedParts, Math.ceil(content.length / bufferSize));

      const finalContent = await receiver.getBlob().text();
      deepStrictEqual(finalContent, content);
    }
  });

  it("should expose the type of the file in its infos", async () => {
    const pool = new TransferFilePool();
    const blob = new Blob(["test"], {
      type: "text/plain",
    });
    const { id } = await pool.addFile(blob, "test.txt");

    const infos = pool.getFileInfos(id);
    deepStrictEqual(infos.type, "text/plain");
    deepStrictEqual(infos.name, "test.txt");
  });

  it("should report the progress of a download", async () => {
    /**
     * SENDER
     */
    const senderPool = new TransferFilePool({});
    const file = new Blob(["Hello world!"], {
      type: "text/plain",
    });
    const fileMetadata = await senderPool.addFile(file, "test.txt");

    // a file that is complete has all of its bytes
    const senderInfos = senderPool.getFileInfos(fileMetadata.id);
    deepStrictEqual(senderInfos.receivedBytes, senderInfos.size);

    /**
     * RECEIVER
     */
    const progress = [];
    const receiverPool = new TransferFilePool({
      maxBufferSize: 5,
      askFilePartCallback: (fileId, offset, limit) => {
        receiverPool.receiveFilePart(
          fileId,
          offset,
          limit,
          senderPool.readFilePart(fileId, offset, limit)
        );
        progress.push(receiverPool.getFileInfos(fileId).receivedBytes);
      },
    });
    receiverPool.storeFileMetadata({ ...fileMetadata });

    // nothing received yet
    deepStrictEqual(receiverPool.getFileInfos(fileMetadata.id).receivedBytes, 0);

    await receiverPool.downloadFile(fileMetadata.id);

    // 3 parts of 5 bytes, the last one being shorter
    deepStrictEqual(progress, [5, 10, 12]);

    // the parts are released once the file is complete, but every byte is there
    const finalInfos = receiverPool.getFileInfos(fileMetadata.id);
    deepStrictEqual(finalInfos.receivedBytes, 12);
    deepStrictEqual(finalInfos.complete, true);
  });

  it("should not count a part received twice", () => {
    const pool = new TransferFilePool({ maxBufferSize: 5 });
    const fileId = pool.storeFileMetadata({
      id: "twice",
      name: "test.txt",
      type: "text/plain",
      size: 12,
      bufferLength: 12,
    });

    pool.receiveFilePart(fileId, 0, 5, new ArrayBuffer(5));
    pool.receiveFilePart(fileId, 0, 5, new ArrayBuffer(5));

    deepStrictEqual(pool.getFileInfos(fileId).receivedBytes, 5);
  });

  it("should reset the progress of a cleared file", async () => {
    /**
     * SENDER
     */
    const senderPool = new TransferFilePool({});
    const file = new Blob(["Hello world!"], {
      type: "text/plain",
    });
    const fileMetadata = await senderPool.addFile(file, "test.txt");

    /**
     * RECEIVER
     */
    const receiverPool = new TransferFilePool({
      maxBufferSize: 5,
      askFilePartCallback: (fileId, offset, limit) => {
        receiverPool.receiveFilePart(
          fileId,
          offset,
          limit,
          senderPool.readFilePart(fileId, offset, limit)
        );
      },
    });
    receiverPool.storeFileMetadata({ ...fileMetadata });

    await receiverPool.downloadFile(fileMetadata.id);
    deepStrictEqual(receiverPool.getFileInfos(fileMetadata.id).receivedBytes, 12);

    receiverPool.clearFile(fileMetadata.id);
    deepStrictEqual(receiverPool.getFileInfos(fileMetadata.id).receivedBytes, 0);
  });

  it("should throw when asking the infos of a file that is not in the pool", () => {
    const pool = new TransferFilePool();
    throws(() => pool.getFileInfos("unknown"), /file '#unknown' does not exist/);
  });
});
