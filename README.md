# Manic Miner ZX Spectrum Source Code
A Disassembly of Manic Miner for the ZX Spectrum.

## Browser/WebXR port

Live build: <https://ixxyxr.github.io/Manic-Miner-XR/>

This worktree contains an in-progress 2.5D browser and WebXR port. The original
Z80 program remains the authoritative game engine inside a headless 48K Spectrum
core compiled to WebAssembly. Its 50 Hz state, title/demo sequences, controls,
collision behavior, cavern logic, and beeper output are therefore preserved.

The visible client interprets the original 256×192 output as a lit pixel-relief
stage. Head movement reveals its shallow extrusion in WebXR while gameplay stays
on the original side-on plane.

Build and run:

```powershell
npm install
npm run build
python -m http.server 8080
```

Open `http://127.0.0.1:8080`. Use Q/P or Left/Right to move, Space or Up to jump,
and Enter to leave the title screen. On a compatible secure-context browser,
**Enter VR** enables WebXR; the thumbstick moves and the primary button jumps.

Run deterministic core checks with `npm test`.

Every push to `main` rebuilds the Spectrum core, runs the tests, and publishes
the contents of `dist/` to GitHub Pages using `.github/workflows/pages.yml`.

The runtime uses [RustZX](https://github.com/rustzx/rustzx) for Spectrum hardware
emulation and [Three.js](https://threejs.org/) for WebGL/WebXR presentation.

This isn't the original source code written by Matthew Smith.   
 
It is a disassembly created by William Humphreys of an original binary with a lot of useful help and changes by Simon Brattel. 

It has been created specifically to be assembled with the:

Zeus Z80 Assembler / Disassembler / Emulator developed by Simon Brattel.  

Zeus Download Link: http://www.desdes.com/products/oldfiles/index.htm
                                                                 
Initially I just wanted to see how the game I played as a young child with one of my first home computers had been constructed. 

After much searching on Google and many downloads I couldn't find a version (true to the original) that actually compiled. So I decided to create one.

Manic Miner I'm assuming is still owned by Matthew Smith.

As there seems to be no way to contact him I'm making the assumption that if he sees this and wants it removed he will contact me and I will be happy to do so.

Manic Miner (C) 1983, 1984, 1999, 2000 Matthew Smith - all rights reserved.
