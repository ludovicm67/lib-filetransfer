import Blob from "cross-blob";
import { TransferFilePool } from "../../lib/index.js";

describe("testing the TransferFilePool class", () => {
  it("should initialize without throwing an error", () => {
    new TransferFilePool();
  });

  it("should return false if the file does not exist", () => {
    const pool = new TransferFilePool();
    const fileExists = pool.fileExists("randomId");
    expect(fileExists).toBeFalse();
  });

  it("should return true if the file exist", async () => {
    const pool = new TransferFilePool();
    const blob = new Blob(["test"], {
      type: "text/plain",
    });
    const { id } = await pool.addFile(blob, "test.txt");
    const fileExists = pool.fileExists(id);
    expect(fileExists).toBeTrue();
  });

  it("should no throw if all required metadata fields are filled", async () => {
    const pool = new TransferFilePool();
    const blob = new Blob(["test"], {
      type: "text/plain",
    });
    const { id, name, type } = await pool.addFile(blob, "test.txt");
    pool.storeFileMetadata({
      id,
      name,
      type,
    });
  });

  it("should throw if the 'id' field is missing", () => {
    const pool = new TransferFilePool();
    expect(() => pool.storeFileMetadata({
      name: "test.txt",
      type: "text/plain",
    })).toThrowError("no 'id' field");

    expect(() => pool.storeFileMetadata({
      type: "text/plain",
    })).toThrowError("no 'id' field");

    expect(() => pool.storeFileMetadata({})).toThrowError("no 'id' field");
    expect(() => pool.storeFileMetadata()).toThrow();
  });

  it("should throw if the 'name' field is missing", () => {
    const pool = new TransferFilePool();
    expect(() => pool.storeFileMetadata({
      id: "randomId",
      type: "text/plain",
    })).toThrowError("no 'name' field");

    expect(() => pool.storeFileMetadata({
      id: "randomId",
    })).toThrowError("no 'name' field");
  });

  it("should throw if the 'type' field is missing", () => {
    const pool = new TransferFilePool();
    expect(() => pool.storeFileMetadata({
      id: "randomId",
      name: "test.txt",
    })).toThrowError("no 'type' field");
  });
});
