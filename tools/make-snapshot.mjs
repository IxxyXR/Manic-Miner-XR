import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const memory=readFileSync(new URL("../ManicMiner.bin",import.meta.url));
if(memory.length!==0x10000) throw new Error(`Expected a 64K memory image, found ${memory.length} bytes`);
const headerSize=27,ramBase=0x4000,stackPointer=0x9cfc,entryPoint=0x8400;
const snapshot=Buffer.alloc(headerSize+0xc000);
snapshot[23]=stackPointer&0xff;snapshot[24]=stackPointer>>8;snapshot[25]=0;snapshot[26]=0;
memory.copy(snapshot,headerSize,ramBase);
snapshot.writeUInt16LE(entryPoint,headerSize+stackPointer-ramBase);
mkdirSync(new URL("../generated/",import.meta.url),{recursive:true});
writeFileSync(new URL("../generated/ManicMiner.sna",import.meta.url),snapshot);
console.log(`Wrote ${snapshot.length}-byte 48K SNA; PC=${entryPoint.toString(16)}, SP=${stackPointer.toString(16)}`);
