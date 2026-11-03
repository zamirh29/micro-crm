"use client"

/**
 * Browser-side photo OCR.
 *
 * The image never leaves the device as an image: it is downscaled, read by
 * Tesseract (WASM) in the browser, and only the extracted text is posted to the
 * server. That keeps phone photos well below the upload ceiling and avoids
 * shipping a native OCR runtime to the server.
 *
 * Tesseract is imported lazily so the ~15MB engine and English data are only
 * fetched when someone actually scans a photo.
 */

import type { Worker } from "tesseract.js"

/** Longest edge after downscaling. Enough detail for an A4 invoice at ~200dpi. */
const MAX_EDGE = 2000

export interface OcrProgress {
  status: string
  progress: number
}

export interface OcrSession {
  recognize: (image: Blob, onProgress?: (progress: OcrProgress) => void) => Promise<string>
  terminate: () => Promise<void>
}

type Bitmap = ImageBitmap | HTMLImageElement

async function loadBitmap(file: File): Promise<Bitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" applies the EXIF orientation that phone cameras write.
      return await createImageBitmap(file, { imageOrientation: "from-image" })
    } catch {
      // Fall through to the <img> path, which also handles orientation.
    }
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("That image could not be opened"))
    }
    image.src = url
  })
}

/**
 * Downscale a photo and flatten it to JPEG before OCR.
 *
 * A modern phone photo is 3–8MB; this brings it to roughly 150–400KB without
 * losing the text an invoice needs. Grayscale plus a little contrast is a cheap
 * win for Tesseract on phone photos.
 */
export async function prepareImage(file: File, maxEdge = MAX_EDGE): Promise<Blob> {
  const bitmap = await loadBitmap(file)
  const width = "width" in bitmap ? bitmap.width : 0
  const height = "height" in bitmap ? bitmap.height : 0
  if (!width || !height) throw new Error("That image has no readable dimensions")

  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext("2d")
  if (!context) throw new Error("This browser cannot prepare images for reading")

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  // Ignored by browsers that do not support canvas filters; never fatal.
  context.filter = "grayscale(1) contrast(1.12)"
  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight)

  if (typeof ImageBitmap !== "undefined" && bitmap instanceof ImageBitmap) bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.86)
  })
  if (!blob) throw new Error("This browser cannot prepare images for reading")

  return blob
}

/**
 * Start one OCR worker. Reusing a session across a batch avoids re-downloading
 * the language data for every photo.
 */
export async function createOcrSession(): Promise<OcrSession> {
  const { createWorker } = await import("tesseract.js")

  let listener: ((progress: OcrProgress) => void) | null = null
  let worker: Worker | null = null

  try {
    worker = await createWorker("eng", undefined, {
      logger: (message) => {
        listener?.({
          status: String(message.status ?? ""),
          progress: Number(message.progress ?? 0),
        })
      },
    })

    // Without this, OCR collapses the gaps between invoice columns.
    await worker.setParameters({ preserve_interword_spaces: "1" })
  } catch (error) {
    await worker?.terminate().catch(() => {})
    throw new Error(
      error instanceof Error && error.message
        ? `Could not start the text reader: ${error.message}`
        : "Could not start the text reader"
    )
  }

  const ready = worker

  return {
    async recognize(image, onProgress) {
      listener = onProgress ?? null
      try {
        const result = await ready.recognize(image)
        return result.data.text ?? ""
      } finally {
        listener = null
      }
    },
    async terminate() {
      await ready.terminate()
    },
  }
}
