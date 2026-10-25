import * as fs from 'fs';
import * as path from 'path';
import { FileStorageService } from './file-storage.service';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: { writeFile: jest.fn() },
}));

describe('FileStorageService', () => {
  const env = { ...process.env };
  let exists: jest.SpyInstance;
  let mkdir: jest.SpyInstance;
  let write: jest.SpyInstance;

  beforeEach(() => {
    exists = fs.existsSync as unknown as jest.Mock;
    mkdir = fs.mkdirSync as unknown as jest.Mock;
    write = fs.promises.writeFile as unknown as jest.Mock;
    exists.mockReset();
    mkdir.mockReset();
    write.mockReset().mockResolvedValue(undefined);
    delete process.env.UPLOAD_DIR;
    delete process.env.PUBLIC_BASE_URL;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('creates the upload dir when absent (default under cwd)', () => {
    exists.mockReturnValue(false);
    new FileStorageService();
    expect(mkdir).toHaveBeenCalledWith(path.join(process.cwd(), 'uploads'), { recursive: true });
  });

  it('does not recreate an existing dir and honors UPLOAD_DIR', () => {
    process.env.UPLOAD_DIR = '/data/up';
    exists.mockReturnValue(true);
    new FileStorageService();
    expect(mkdir).not.toHaveBeenCalled();
    expect(exists).toHaveBeenCalledWith('/data/up');
  });

  it.each([
    ['image/png', '.png'], ['image/jpeg', '.jpg'], ['image/jpg', '.jpg'], ['image/svg+xml', '.svg'], ['application/x-sh', ''], ['', ''],
  ])('store(%s) uses extension %p', async (mime, ext) => {
    exists.mockReturnValue(true);
    process.env.UPLOAD_DIR = '/data/up';
    const url = await new FileStorageService().store(Buffer.from('x'), mime, 'logo');
    const [file, buf] = write.mock.calls[0];
    expect(path.dirname(file)).toBe('/data/up');
    expect(path.basename(file)).toMatch(new RegExp(`^logo-[0-9a-f-]{36}${ext.replace('.', '\\.')}$`));
    expect(buf).toEqual(Buffer.from('x'));
    expect(url).toBe(`http://localhost:4000/uploads/${path.basename(file)}`);
  });

  it('trims trailing slash of PUBLIC_BASE_URL and defaults prefix', async () => {
    exists.mockReturnValue(true);
    process.env.PUBLIC_BASE_URL = 'https://cdn.example.com/';
    const url = await new FileStorageService().store(Buffer.alloc(0), 'image/png');
    expect(url).toMatch(/^https:\/\/cdn\.example\.com\/uploads\/uploads-[0-9a-f-]{36}\.png$/);
  });

  it('generates unique filenames', async () => {
    exists.mockReturnValue(true);
    const s = new FileStorageService();
    const a = await s.store(Buffer.alloc(0), 'image/png', 'p');
    const b = await s.store(Buffer.alloc(0), 'image/png', 'p');
    expect(a).not.toBe(b);
  });

  it('propagates write failures', async () => {
    exists.mockReturnValue(true);
    write.mockRejectedValue(new Error('ENOSPC'));
    await expect(new FileStorageService().store(Buffer.alloc(0), 'image/png')).rejects.toThrow('ENOSPC');
  });

  // BUG: file-storage.service.ts joins the caller-supplied prefix into the filesystem path unsanitised,
  // so a prefix like "../../etc/x" escapes the upload directory (path traversal).
  it('prefix cannot escape the upload directory', async () => {
    exists.mockReturnValue(true);
    process.env.UPLOAD_DIR = '/data/up';
    await new FileStorageService().store(Buffer.alloc(0), 'image/png', '../../etc/evil');
    expect(path.dirname(write.mock.calls[0][0])).toBe('/data/up');
  });
});
