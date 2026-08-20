---
"@ludovicm67/lib-filetransfer": patch
---

Halve what receiving a file costs in memory.

The parts of a download were kept as `ArrayBuffer`s until the file was complete, and putting the file back together copied every one of them into the final `Blob`. Both existed at once at that moment, so receiving a file peaked at twice its size.

Each part is now handed to the runtime as a `Blob` as soon as it arrives, which keeps those bytes out of the JS heap — and lets the runtime put them on disk. Assembling the file then references the parts instead of copying them.

Receiving a 256 MB file went from a peak of 516 MB to 299 MB. Nothing changes in the API: `receiveFilePart()` still takes an `ArrayBuffer`, and `getBlob()` still returns the same `Blob`.
