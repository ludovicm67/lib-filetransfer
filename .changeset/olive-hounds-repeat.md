---
"@ludovicm67/lib-filetransfer": minor
---

Fix the download state machine, which could leave a file permanently stuck after a failure, and add a `keepPartsOnFailure` option.

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
