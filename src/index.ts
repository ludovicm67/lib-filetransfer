import { TransferFileMetadata, TransferFilePool } from "./TransferFilePool.js";
import Blob from "cross-blob";
import { arrayBufferToString, stringToArrayBuffer } from "./utils.js";


/**
 * SENDER
 */
const senderPool = new TransferFilePool();
senderPool.storeFileMetadata({
  id: "test",
  name: "test.txt",
  type: "text/plain",
  size: 0,
});
console.log(senderPool.fileExists("test"));
senderPool.deleteFile("test");
console.log(senderPool.fileExists("test"));

const file = new Blob(["Hello world!"], {
  type: "text/plain",
});
const fileMetadata = senderPool.addFile(file, "test.txt");


/**
 * RECEIVER
 */
const receiverPool = new TransferFilePool();

// imagine the sender sent the fileMetadata on a dedicated channel…
const receivedFileMetadata: TransferFileMetadata = {...fileMetadata};

// this will crash, since the pool does not know about the file metadata
try {
  receiverPool.downloadFile(receivedFileMetadata.id);
} catch (e) {}

// so we store the file metadata in the pool
receiverPool.storeFileMetadata(receivedFileMetadata);

// imagine the user click on the download button
receiverPool.downloadFile(receivedFileMetadata.id);





/**
 * SOME TESTS
 */
const buffer = await file.arrayBuffer();
console.log(buffer);
const str = arrayBufferToString(buffer);
console.log(str);
const ab = stringToArrayBuffer(str);
console.log(ab);

const l = ab.byteLength;
let offset = 0;
const nbBytesToRead = 5;
const store: Record<string, ArrayBuffer> = {};
while (offset <= l) {
  console.log('offset:', offset);
  const s = ab.slice(offset, offset + nbBytesToRead);
  store[`${offset}`] = s;
  offset = offset + nbBytesToRead;
  console.log(s);
}

const blob3 = new Blob(Object.keys(store).sort((a, b) => {
  const x = parseInt(a);
  const y = parseInt(b);
  if (x > y) return 1;
  if (x < y) return -1;
  return 0;
}).map(k => store[k]), {type: file.type});

const blob2 = new Blob([ab], {type: file.type});
console.log(await blob2.text());
console.log(await file.text());
console.log(await blob3.text());
