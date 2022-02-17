import { TransferFilePool } from "./TransferFilePool.js";
import Blob from "cross-blob";

const pool = new TransferFilePool();
pool.storeFileMetadata({
  id: "test",
  name: "test.txt",
  type: "text/plain",
  size: 0,
});
console.log(pool.fileExists("test"));
pool.deleteFile("test");
console.log(pool.fileExists("test"));

const file = new Blob(["Hello world!"], {
  type: "text/plain",
});

console.log(pool.addFile(file, "test.txt"));
