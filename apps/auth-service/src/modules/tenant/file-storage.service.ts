/**
 * FileStorageService
 *
 * Disk-based file storage adapter.
 * Swap the `store()` implementation for S3/MinIO when needed.
 */
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ApiException } from '../../common/http';

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);

  /** Absolute path to the uploads directory */
  private readonly uploadDir: string;

  /** Public base URL for serving stored files */
  private readonly publicBaseUrl: string;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');
    this.publicBaseUrl =
      (process.env.PUBLIC_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Persist a buffer to disk and return its public URL.
   * @param buffer  Raw file bytes.
   * @param mimeType  MIME type used to derive extension.
   * @param prefix  Optional path prefix (e.g. 'logos').
   */
  async store(
    buffer: Buffer,
    mimeType: string,
    prefix = 'uploads',
  ): Promise<string> {
    const ext = this.extensionFor(mimeType);
    const safePrefix = this.sanitizePrefix(prefix);
    const filename = `${safePrefix}-${crypto.randomUUID()}${ext}`;
    const base = path.resolve(this.uploadDir);
    const filePath = path.resolve(base, filename);
    if (path.dirname(filePath) !== base) {
      throw new ApiException('BAD_REQUEST', { detail: 'Invalid storage prefix' });
    }

    await fs.promises.writeFile(filePath, buffer);
    this.logger.debug(`Stored file: ${filePath}`);

    return `${this.publicBaseUrl}/uploads/${filename}`;
  }

  /**
   * Neutralise path separators, traversal, absolute paths and null bytes by
   * collapsing everything outside [A-Za-z0-9_-] (so the prefix is a flat name).
   */
  private sanitizePrefix(prefix: string): string {
    const cleaned = prefix.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 64);
    return cleaned.length > 0 ? cleaned : 'uploads';
  }

  private extensionFor(mimeType: string): string {
    switch (mimeType) {
      case 'image/png':
        return '.png';
      case 'image/jpeg':
      case 'image/jpg':
        return '.jpg';
      case 'image/svg+xml':
        return '.svg';
      default:
        return '';
    }
  }
}
