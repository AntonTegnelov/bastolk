import iconv from 'iconv-lite';

/// SIE4 files are CP437, not UTF-8. Decoding one as UTF-8 silently corrupts
/// every Swedish supplier name, so both directions are explicit.
const SIE_ENCODING = 'cp437';

export function decodeSie(buffer: Buffer): string {
  return iconv.decode(buffer, SIE_ENCODING);
}

export function encodeSie(text: string): Buffer {
  return iconv.encode(text, SIE_ENCODING);
}
