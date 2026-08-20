---
"@ludovicm67/lib-filetransfer": major
---

Drop `bufferLength`, and download 4 parts at a time by default.

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
