import { TransferFilePool } from "./TransferFilePool";

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
