import {createHash} from "node:crypto";
import {copyFileSync,cpSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
const output=fileURLToPath(new URL("../dist/",import.meta.url));

rmSync(output,{recursive:true,force:true});
mkdirSync(output,{recursive:true});
for(const file of["index.html","styles.css"])copyFileSync(`${root}${file}`,`${output}${file}`);
cpSync(`${root}src`,`${output}src`,{recursive:true});
const hash=createHash("sha256");
for(const file of["index.html","styles.css","src/main.js","src/xr-input.js","src/audio-worklet.js","src/manic_miner_core.wasm"])hash.update(readFileSync(`${root}${file}`));
writeFileSync(`${output}version.json`,`${hash.digest("hex").slice(0,12)}\n`);
writeFileSync(`${output}.nojekyll`,"");
console.log("Staged browser site in dist/");
