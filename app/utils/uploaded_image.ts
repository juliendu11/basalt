import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import app from '@adonisjs/core/services/app'
import type { MultipartFile } from '@adonisjs/core/bodyparser'

/**
 * Moves a validated upload into `public/uploads/<directory>` under a random
 * name (never the client-supplied filename) and returns the path relative
 * to `public/`, as stored in `*.image_path` columns — the static file
 * middleware serves it back at `/${imagePath}`.
 */
export async function storeUploadedImage(file: MultipartFile, directory: string): Promise<string> {
  const name = `${randomUUID()}.${file.extname}`
  await file.move(app.makePath('public', 'uploads', directory), { name })
  return `uploads/${directory}/${name}`
}

/**
 * Best-effort delete of a previously stored image (e.g. when replaced or
 * removed) — swallows a missing file rather than failing the request.
 */
export async function deleteUploadedImage(imagePath: string | null): Promise<void> {
  if (!imagePath) return

  try {
    await unlink(app.makePath('public', imagePath))
  } catch {
    // Already gone — nothing to clean up.
  }
}
