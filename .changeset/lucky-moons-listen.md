---
"@ludovicm67/lib-filetransfer": minor
---

Report the progress of a download, and expose the file infos from the pool.

- `TransferFilePool` gained a `getFileInfos(fileId)` method. The infos of a file existed on `TransferFile`, but there was no way to reach them from the pool, which is the object applications work with.
- `TransferFileInfos` gained a `receivedBytes` field, so a progress bar no longer needs the application to count the parts itself. It grows as the parts arrive, is not fooled by a part delivered twice, and is the full length of the file once it is complete — the parts are released at that point, but the data is all there in the `Blob`.
- `TransferFileInfos` gained the `type` field, which `getMetadata()` already returned.

```ts
const { receivedBytes, size } = filePool.getFileInfos(fileId);
progressBar.style.width = `${(receivedBytes / size) * 100}%`;
```
