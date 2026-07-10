import {copyFileSync} from "node:fs";
copyFileSync(new URL("../wasm-core/target/wasm32-unknown-unknown/release/manic_miner_core.wasm",import.meta.url),new URL("../src/manic_miner_core.wasm",import.meta.url));
console.log("Staged manic_miner_core.wasm for the browser");
