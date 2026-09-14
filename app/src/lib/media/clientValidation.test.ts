import { describe, expect, it } from "vitest";
import { validateImageFile, classifyServerImageError } from "./clientValidation";
import { MAX_IMAGE_BYTES } from "./path";

function fakeFile(size: number, type: string): File {
  // A real File's .size reflects its content length; Blob's constructor
  // computes that for us, so this is a real byte count, not a mock.
  return new File([new Uint8Array(size)], "test.jpg", { type });
}

describe("validateImageFile", () => {
  it("A. accepts a file under 8MB", () => {
    const result = validateImageFile(fakeFile(1024, "image/jpeg"));
    expect(result.ok).toBe(true);
  });

  it("B. accepts a file exactly at the 8MB limit", () => {
    const result = validateImageFile(fakeFile(MAX_IMAGE_BYTES, "image/png"));
    expect(result.ok).toBe(true);
  });

  it("C. rejects a file over 8MB, with the exact required copy", () => {
    const result = validateImageFile(fakeFile(MAX_IMAGE_BYTES + 1, "image/jpeg"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.title).toBe("Image is too large");
      expect(result.body).toBe("This image is larger than 8 MB. Please choose a smaller image.");
    }
  });

  it("F. rejects an unsupported file type before any size check", () => {
    const result = validateImageFile(fakeFile(1024, "application/pdf"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.title).toBe("Unsupported image format");
      expect(result.body).toBe("Please choose a JPG, PNG, or WebP image.");
    }
  });

  it("rejects a zero-byte file with a processing-failure message, not the size message", () => {
    const result = validateImageFile(fakeFile(0, "image/png"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.title).toBe("Image could not be processed");
  });

  it("accepts every allowed MIME type", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validateImageFile(fakeFile(1024, type)).ok).toBe(true);
    }
  });
});

/**
 * The exact control-flow contract both BrandImageField and
 * ModuleItemPhotoField's handleFileChange implement: validate first, and
 * only ever call the pending-state setter (or touch the network) once
 * validation has already passed. This project has no component-render
 * test harness by deliberate design (see vitest.config.ts) - this proves
 * the CONTRACT (never call "start loading" before validation has
 * cleared the file) against the real validateImageFile gate, using
 * call-order spies; it does not mount the actual component. Live
 * browser verification is what proves the two real components honor
 * this contract end-to-end.
 */
describe("upload handler contract - modal state is selected before pending state", () => {
  function simulateHandleFileChange(file: File, setDialogError: (v: unknown) => void, setUploadPending: (v: boolean) => void) {
    const validation = validateImageFile(file);
    if (!validation.ok) {
      setDialogError(validation);
      return;
    }
    setUploadPending(true);
  }

  it("an oversized file sets the dialog error and never sets pending state", () => {
    const calls: string[] = [];
    const setDialogError = (v: unknown) => calls.push(`dialogError:${JSON.stringify(v)}`);
    const setUploadPending = (v: boolean) => calls.push(`pending:${v}`);

    simulateHandleFileChange(fakeFile(MAX_IMAGE_BYTES + 1, "image/jpeg"), setDialogError, setUploadPending);

    expect(calls.some((c) => c.startsWith("dialogError:"))).toBe(true);
    expect(calls.some((c) => c.startsWith("pending:"))).toBe(false);
  });

  it("a valid file sets pending state and never touches the dialog", () => {
    const calls: string[] = [];
    const setDialogError = (v: unknown) => calls.push(`dialogError:${JSON.stringify(v)}`);
    const setUploadPending = (v: boolean) => calls.push(`pending:${v}`);

    simulateHandleFileChange(fakeFile(1024, "image/jpeg"), setDialogError, setUploadPending);

    expect(calls).toEqual(["pending:true"]);
  });
});

describe("classifyServerImageError - G. server rejects despite client validation", () => {
  it("maps a size-related server message to the same 'too large' copy", () => {
    const result = classifyServerImageError("Image must be under 8MB.");
    expect(result.title).toBe("Image is too large");
  });

  it("maps a format-related server message to the same 'unsupported format' copy", () => {
    const result = classifyServerImageError("Please upload a JPG, PNG or WEBP image.");
    expect(result.title).toBe("Unsupported image format");
  });

  it("falls back to a generic processing-failure message for anything else", () => {
    const result = classifyServerImageError("Storage upload failed unexpectedly.");
    expect(result.title).toBe("Image could not be processed");
    expect(result.body).toBe("Please choose another image.");
  });
});
