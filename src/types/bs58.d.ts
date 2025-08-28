declare module 'bs58' {
  function encode(buffer: Uint8Array): string;
  function decode(string: string): Uint8Array;
  export = { encode, decode };
}
