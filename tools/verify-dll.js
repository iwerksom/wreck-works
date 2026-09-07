#!/usr/bin/env node
'use strict';

// M0.3's gate. Answers one question honestly: did *this* build of the F4SE
// plugin actually load in the game and serve a Papyrus call?
//
// Two halves, because either alone is easy to fool:
//
//   1. Static — the artifact on disk is a 64-bit PE DLL that exports the entry
//      points F4SE looks for. Catches a build that produced the wrong thing.
//   2. Dynamic — the plugin's own log is NEWER than the DLL and contains the
//      expected markers. The freshness check is the whole point: without it a
//      log left over from last week passes forever.
//
// Config resolution, first match wins:
//   --config <path> | tools/verify-dll.config.json | the defaults below,
// with FO4HELLO_DLL and FO4HELLO_LOG overriding the paths either way.

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  // Where xmake drops the release build, relative to the plugin repo.
  dll: '../fo4-hello/build/windows/x64/releasedbg/FO4Hello.dll',
  // CommonLibF4 logs to Documents\My Games\Fallout4\F4SE\<PluginName>.log.
  log: '/mnt/c/Users/%USER%/Documents/My Games/Fallout4/F4SE/FO4Hello.log',
  // Exact strings from src/main.cpp. Changing one there means changing it here.
  markers: [
    'FO4Hello: plugin loaded',
    'FO4Hello: papyrus natives registered',
    'FO4Hello: GetAnswer -> 42'
  ],
  // Exports F4SE resolves by name when it considers loading a plugin.
  requiredExports: ['F4SEPlugin_Version']
};

// --- PE parsing -------------------------------------------------------------
// Just enough of the format to answer "is this a 64-bit DLL, and what does it
// export by name". Deliberately not a general PE reader.

function parsePE(buf) {
  if (buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) {
    throw new Error('not a PE file (no MZ signature)');
  }
  const peOff = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(peOff) !== 0x00004550) {
    throw new Error('not a PE file (no PE\\0\\0 signature)');
  }

  const machine = buf.readUInt16LE(peOff + 4);
  const numSections = buf.readUInt16LE(peOff + 6);
  const optSize = buf.readUInt16LE(peOff + 20);
  const characteristics = buf.readUInt16LE(peOff + 22);

  const optOff = peOff + 24;
  const magic = buf.readUInt16LE(optOff);
  const isPE32Plus = magic === 0x20b;
  // The data directory sits after the optional header's fixed part, which is
  // 112 bytes for PE32+ and 96 for PE32.
  const dirOff = optOff + (isPE32Plus ? 112 : 96);
  const exportRVA = buf.readUInt32LE(dirOff);

  const sections = [];
  const secOff = optOff + optSize;
  for (let i = 0; i < numSections; i++) {
    const s = secOff + i * 40;
    sections.push({
      virtualAddress: buf.readUInt32LE(s + 12),
      sizeOfRawData: buf.readUInt32LE(s + 16),
      pointerToRawData: buf.readUInt32LE(s + 20)
    });
  }

  const toOffset = (rva) => {
    for (const s of sections) {
      if (rva >= s.virtualAddress && rva < s.virtualAddress + s.sizeOfRawData) {
        return s.pointerToRawData + (rva - s.virtualAddress);
      }
    }
    return -1;
  };

  const exports = [];
  if (exportRVA) {
    const e = toOffset(exportRVA);
    if (e >= 0) {
      const nameCount = buf.readUInt32LE(e + 24);
      const namesRVA = buf.readUInt32LE(e + 32);
      const namesOff = toOffset(namesRVA);
      for (let i = 0; namesOff >= 0 && i < nameCount; i++) {
        const strOff = toOffset(buf.readUInt32LE(namesOff + i * 4));
        if (strOff < 0) continue;
        const end = buf.indexOf(0, strOff);
        exports.push(buf.toString('ascii', strOff, end < 0 ? strOff : end));
      }
    }
  }

  return {
    isDLL: (characteristics & 0x2000) !== 0,
    isX64: machine === 0x8664 && isPE32Plus,
    exports
  };
}

// --- config -----------------------------------------------------------------

function loadConfig(root) {
  const argIdx = process.argv.indexOf('--config');
  const explicit = argIdx >= 0 ? process.argv[argIdx + 1] : null;
  const candidate = explicit || path.join(root, 'tools', 'verify-dll.config.json');

  let cfg = { ...DEFAULTS };
  if (fs.existsSync(candidate)) {
    cfg = { ...cfg, ...JSON.parse(fs.readFileSync(candidate, 'utf8')) };
  } else if (explicit) {
    throw new Error(`config not found: ${explicit}`);
  }

  if (process.env.FO4HELLO_DLL) cfg.dll = process.env.FO4HELLO_DLL;
  if (process.env.FO4HELLO_LOG) cfg.log = process.env.FO4HELLO_LOG;

  // %USER% is a stand-in for the Windows account name, which differs per
  // machine; keeping it out of the committed config keeps the file portable.
  const user = process.env.FO4_WINDOWS_USER || process.env.USER || '';
  cfg.log = cfg.log.replace('%USER%', user);

  const resolve = (p) => (path.isAbsolute(p) ? p : path.resolve(root, p));
  cfg.dll = resolve(cfg.dll);
  cfg.log = resolve(cfg.log);
  return cfg;
}

// --- checks -----------------------------------------------------------------

function main() {
  const root = path.resolve(__dirname, '..');
  const cfg = loadConfig(root);
  const failures = [];
  const pass = [];

  if (!fs.existsSync(cfg.dll)) {
    failures.push(`DLL not found: ${cfg.dll}\n    Build it first: xmake build (in the fo4-hello repo).`);
    return report(pass, failures, cfg);
  }
  const dllStat = fs.statSync(cfg.dll);
  pass.push(`DLL present: ${cfg.dll}`);

  let pe;
  try {
    pe = parsePE(fs.readFileSync(cfg.dll));
  } catch (err) {
    failures.push(`DLL is not a readable PE image: ${err.message}`);
    return report(pass, failures, cfg);
  }

  if (!pe.isX64) failures.push('DLL is not a 64-bit (PE32+/AMD64) image — Fallout 4 will not load it.');
  else pass.push('DLL is a 64-bit PE32+ image');

  if (!pe.isDLL) failures.push('PE image is not marked as a DLL.');
  else pass.push('PE image is marked as a DLL');

  const missing = cfg.requiredExports.filter((e) => !pe.exports.includes(e));
  if (missing.length) {
    failures.push(
      `missing F4SE export(s): ${missing.join(', ')}\n    Found: ${pe.exports.join(', ') || '(none)'}\n` +
      '    The commonlibf4.plugin xmake rule generates these — check the rule is applied.'
    );
  } else {
    pass.push(`exports present: ${cfg.requiredExports.join(', ')}`);
  }

  if (!fs.existsSync(cfg.log)) {
    failures.push(
      `plugin log not found: ${cfg.log}\n` +
      '    Launch the game via f4se_loader.exe, then in the console run:\n' +
      '      cgf "FO4Hello.GetAnswer"'
    );
    return report(pass, failures, cfg);
  }

  const logStat = fs.statSync(cfg.log);
  if (logStat.mtimeMs < dllStat.mtimeMs) {
    failures.push(
      `log is older than the DLL — it is from a previous build, so it proves nothing.\n` +
      `    DLL: ${dllStat.mtime.toISOString()}\n    log: ${logStat.mtime.toISOString()}\n` +
      '    Re-launch the game with this build and call the natives again.'
    );
  } else {
    pass.push(`log is newer than the DLL (${logStat.mtime.toISOString()})`);
  }

  const text = fs.readFileSync(cfg.log, 'utf8');
  for (const marker of cfg.markers) {
    if (text.includes(marker)) pass.push(`log contains: "${marker}"`);
    else failures.push(`log is missing the marker: "${marker}"`);
  }

  return report(pass, failures, cfg);
}

function report(pass, failures, cfg) {
  const json = process.argv.includes('--json');
  if (json) {
    console.log(JSON.stringify({ ok: failures.length === 0, pass, failures, config: cfg }, null, 2));
  } else {
    for (const p of pass) console.log(`  ok    ${p}`);
    for (const f of failures) console.log(`  FAIL  ${f}`);
    console.log('');
    console.log(failures.length === 0
      ? 'M0.3 gate: PASS — the DLL loaded and Papyrus reached C++.'
      : `M0.3 gate: FAIL — ${failures.length} check(s) failed.`);
  }
  process.exit(failures.length === 0 ? 0 : 1);
}

main();
