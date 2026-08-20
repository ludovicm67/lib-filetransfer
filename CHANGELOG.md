# @ludovicm67/lib-filetransfer

## 3.0.0

### Major Changes

- 3f09367: Stop loading the file being sent into memory, and stop scaling the cost of a download with the number of parts.
  
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
- bf95c49: Drop `bufferLength`, and download 4 parts at a time by default.
  
  **Breaking: `bufferLength` is gone, `size` is the only field left.** The two always held the same number — the length of the file — and having both meant metadata could contradict itself. `TransferFileMetadata` and `TransferFileInfos` now carry `size` alone, and the `TransferFile` constructor lost its `bufferLength` parameter:
  
  ```ts
  // before
  { id, name, type, size: 1024, bufferLength: 1024 }
  // after
  { id, name, type, size: 1024 }
  ```
  
  Metadata travelling over your channel keeps one field fewer. If you were reading `bufferLength`, read `size` instead.
  
  **Breaking: `storeFileMetadata()` now requires `size`.** It is what tells the receiver how much to download: without it the download used to complete instantly, handing back an empty file. A `size` of `0` is still accepted — that is an empty file, which transfers fine.
  
  **Breaking: `parallelCalls` now defaults to `4`** instead of `1`. Asking for parts one at a time leaves the channel idle while each one travels, so a download was serial unless the option was set. Pass `parallelCalls: 1` to get the old behaviour.
  
  Every option of `TransferFilePool` is now documented in the API reference.

### Minor Changes

- adfec37: Report the progress of a download, and expose the file infos from the pool.
  
  - `TransferFilePool` gained a `getFileInfos(fileId)` method. The infos of a file existed on `TransferFile`, but there was no way to reach them from the pool, which is the object applications work with.
  - `TransferFileInfos` gained a `receivedBytes` field, so a progress bar no longer needs the application to count the parts itself. It grows as the parts arrive, is not fooled by a part delivered twice, and is the full length of the file once it is complete — the parts are released at that point, but the data is all there in the `Blob`.
  - `TransferFileInfos` gained the `type` field, which `getMetadata()` already returned.
  
  ```ts
  const { receivedBytes, size } = filePool.getFileInfos(fileId);
  progressBar.style.width = `${(receivedBytes / size) * 100}%`;
  ```
- 1bc51f8: Fix the download state machine, which could leave a file permanently stuck after a failure, and add a `keepPartsOnFailure` option.
  
  Bug fixes:
  
  - A failed download no longer leaves `downloading` set to `true`. Previously the flag was only cleared on the success path, so every later `downloadFile()` call returned early — resolving as if the download had succeeded, while the file stayed incomplete. The only way out was to call `clearFile()`.
  - Calling `downloadFile()` while a download is already running now waits for that download instead of resolving immediately, so the file is really ready when the call resolves.
  - Downloading a file whose metadata announces a non-zero `size` but no `bufferLength` now throws, instead of silently completing with an empty Blob. Genuinely empty files still transfer fine.
  - A part is now asked for once per attempt: the last retry no longer sends an extra request that nothing waits for.
  - Waiting for a part no longer sleeps for another 100 ms after its final check, which shaved a fixed 100 ms off every part that timed out.
  - Errors thrown by a failed download keep the original error as their `cause`.
  
  New option:
  
  - `keepPartsOnFailure` decides what happens to the parts that were already received when a download fails. It defaults to `false`: they are dropped, and the next attempt starts over. Set it to `true` to keep them, so that a later attempt only asks for the missing ones — at the cost of holding them in memory until the download succeeds or `clearFile()` is called, which for a large file can be a lot.
  
    ```ts
    const filePool = new TransferFilePool({ keepPartsOnFailure: true });
    ```
  
    Parts kept from a previous attempt are only reused when the buffer size did not change in between, since mixing sizes would produce a corrupted file.
  
    The `TransferFile` constructor takes the same setting as a new optional last parameter.
- f69e60b: Make downloads faster, and stop polling for the parts that are being received.
  
  - Waiting for a part no longer polls every 100 ms: `receiveFilePart()` now wakes up whoever waits for that part as soon as it lands. Every part used to cost up to 100 ms of pure waiting, whatever the speed of the channel. On a transfer of 40 parts over a link with a 25 ms delay, 4 parts in parallel, the download went from 1015 ms to 259 ms — the theoretical floor being 250 ms.
  - `fileExists()` used to build the list of every id in the pool on each call, and it is called for every received part. It is now a plain lookup: over a pool of 2000 files, 20 000 calls went from 1117 ms to 0.93 ms.
  - `deleteFile()` used to rebuild the whole pool to drop a single file, it now just removes it.
  - Parts are stored by offset instead of a `"<limit>-<offset>"` string key, so putting the file back together no longer runs a regular expression and a `parseInt()` on every comparison of the sort. `getBlob()` over 60 000 parts went from 93 ms to 60 ms, what is left being the building of the `Blob` itself.
  
  `hasPart()` now returns a real boolean. It used to return the part itself — a truthy `ArrayBuffer` — or `undefined`, while being documented as returning `true`. Code doing `if (file.hasPart(...))` keeps working; code using the returned value as data does not.

### Patch Changes

- 6e3c335: Point the npm `homepage` at the documentation site rather than at the README on GitHub, so the link on the package page leads to the live docs and demo.
- 08b8152: Halve what receiving a file costs in memory.
  
  The parts of a download were kept as `ArrayBuffer`s until the file was complete, and putting the file back together copied every one of them into the final `Blob`. Both existed at once at that moment, so receiving a file peaked at twice its size.
  
  Each part is now handed to the runtime as a `Blob` as soon as it arrives, which keeps those bytes out of the JS heap — and lets the runtime put them on disk. Assembling the file then references the parts instead of copying them.
  
  Receiving a 256 MB file went from a peak of 516 MB to 299 MB. Nothing changes in the API: `receiveFilePart()` still takes an `ArrayBuffer`, and `getBlob()` still returns the same `Blob`.

## 2.0.0

### Major Changes

- 9918d44: Remove the use of the `cross-blob` dependency.
  This may break some apps that are using a version of Node older than 18.
- 9918d44: `Blob` is not exported anymore
