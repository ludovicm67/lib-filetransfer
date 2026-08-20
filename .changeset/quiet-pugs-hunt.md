---
"@ludovicm67/lib-filetransfer": minor
---

Make downloads faster, and stop polling for the parts that are being received.

- Waiting for a part no longer polls every 100 ms: `receiveFilePart()` now wakes up whoever waits for that part as soon as it lands. Every part used to cost up to 100 ms of pure waiting, whatever the speed of the channel. On a transfer of 40 parts over a link with a 25 ms delay, 4 parts in parallel, the download went from 1015 ms to 259 ms — the theoretical floor being 250 ms.
- `fileExists()` used to build the list of every id in the pool on each call, and it is called for every received part. It is now a plain lookup: over a pool of 2000 files, 20 000 calls went from 1117 ms to 0.93 ms.
- `deleteFile()` used to rebuild the whole pool to drop a single file, it now just removes it.
- Parts are stored by offset instead of a `"<limit>-<offset>"` string key, so putting the file back together no longer runs a regular expression and a `parseInt()` on every comparison of the sort. `getBlob()` over 60 000 parts went from 93 ms to 60 ms, what is left being the building of the `Blob` itself.

`hasPart()` now returns a real boolean. It used to return the part itself — a truthy `ArrayBuffer` — or `undefined`, while being documented as returning `true`. Code doing `if (file.hasPart(...))` keeps working; code using the returned value as data does not.
