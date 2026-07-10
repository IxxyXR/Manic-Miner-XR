import {copyFileSync,cpSync,mkdirSync,rmSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
const output=fileURLToPath(new URL("../dist/",import.meta.url));

rmSync(output,{recursive:true,force:true});
mkdirSync(output,{recursive:true});
for(const file of["index.html","styles.css"])copyFileSync(`${root}${file}`,`${output}${file}`);
cpSync(`${root}src`,`${output}src`,{recursive:true});
writeFileSync(`${output}.nojekyll`,"");
console.log("Staged browser site in dist/");
