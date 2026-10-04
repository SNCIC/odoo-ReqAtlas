import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** 计算任意字节的 sha256（十六进制小写）。 */
export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** 计算文件字节的 sha256（十六进制小写）。 */
export function sha256File(filePath: string): string {
  return sha256Hex(readFileSync(filePath));
}
