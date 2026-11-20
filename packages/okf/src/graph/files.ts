import { mkdir, writeFile, rename, rm, realpath, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export async function atomicWrite(file: string, bytes: Uint8Array | string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}
export async function physicalPath(file: string): Promise<string> {
  const suffix: string[] = [];
  let current = path.resolve(file);
  for (;;) {
    try { return path.join(await realpath(current), ...suffix.reverse()); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      suffix.push(path.basename(current));
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

export async function assertOutside(root: string, output: string): Promise<void> {
  const relative = path.relative(await realpath(root), await physicalPath(output));
  if (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw new Error('Graph output must be outside the canonical knowledge directory');
}

/** Stage every artifact before replacing any; restore prior files on commit failure.
 * Single-writer publication. Concurrent readers must still compare source hashes.
 */
export async function publishFiles(outputs: Map<string, string | Uint8Array | null>): Promise<void> {
  const staged: { file: string; temporary: string; backup: string; existed: boolean; remove: boolean }[] = [];
  const committed: typeof staged = [];
  let preserveBackups = false;
  try {
    for (const [file, bytes] of outputs) {
      await mkdir(path.dirname(file), { recursive: true });
      const item = { file, temporary: `${file}.${randomUUID()}.tmp`, backup: `${file}.${randomUUID()}.bak`, existed: false, remove: bytes === null };
      staged.push(item);
      try { await copyFile(file, item.backup, constants.COPYFILE_EXCL); item.existed = true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (bytes !== null) await writeFile(item.temporary, bytes, { flag: 'wx' });
    }
    for (const item of staged) {
      if (item.remove) await rm(item.file, { force: true });
      else await rename(item.temporary, item.file);
      committed.push(item);
    }
  } catch (error) {
    const failures: unknown[] = [error];
    for (const item of [...committed].reverse()) {
      try {
        if (item.existed) await rename(item.backup, item.file);
        else await rm(item.file, { force: true });
      } catch (restoreError) { failures.push(restoreError); }
    }
    if (failures.length > 1) {
      preserveBackups = true;
      throw new AggregateError(failures, 'Publication and rollback failed; .bak files retained for recovery');
    }
    throw error;
  } finally {
    for (const item of staged) {
      await rm(item.temporary, { force: true });
      if (!preserveBackups) await rm(item.backup, { force: true });
    }
  }
}
