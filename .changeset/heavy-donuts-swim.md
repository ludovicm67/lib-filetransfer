---
"@ludovicm67/lib-filetransfer": major
---

Stop loading the file being sent into memory, and stop scaling the cost of a download with the number of parts.

**Breaking: `readFilePart()` is now asynchronous**, on both `TransferFilePool` and `TransferFile`. It returns a `Promise<ArrayBuffer>` instead of an `ArrayBuffer`, so the call has to be awaited:

```ts
const data = await filePool.readFilePart(fileId, offset, limit);
```

That is what makes the rest possible: adding a file no longer reads it, it keeps the `Blob` and reads only the slice that is asked for. A `Blob` taken from an `<input type="file">` is backed by the file on disk, so a file of any size can now be sent without ever being held in memory as a whole. Adding a 256 MB file used to take 768 MB of memory — the original `Blob`, a needless copy of it, and an `ArrayBuffer` of the whole thing — and now takes none beyond the `Blob` itself.

A side effect worth knowing: a peer that finished downloading a file can now serve it to another peer, since reads work off the reassembled `Blob`.

**Breaking: `maxBufferSize` now defaults to `16384`** (16 KiB) instead of `1000`, the message size a WebRTC data channel handles everywhere. The old default meant a thousand requests per megabyte.

Other changes:

- A download no longer turns every part into a queued promise before it starts. A fixed number of workers walk through the parts instead, so what a download costs upfront depends on `parallelCalls`, not on the size of the file. For a 20 MB file split in 1000-byte parts, that upfront cost went from 13.6 MB to nothing measurable.
- Aborting a download now interrupts the parts being waited for, instead of letting them sit until their timeout expires.
- The `p-limit` dependency is gone: the package is down to two dependencies.
