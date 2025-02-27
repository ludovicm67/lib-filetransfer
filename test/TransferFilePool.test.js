import { describe, it } from "node:test";
import { deepStrictEqual, rejects, throws } from "node:assert";
import { TransferFilePool } from "../lib/index.js";

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
});
