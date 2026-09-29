// Loads, validates and saves room.json. No Electron imports here so it can be
// exercised from plain Node (see scripts/check-room.js).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');

const SCHEMA = require('../../schema/room.schema.json');
const DEFAULT_ROOM_FILE = path.join(__dirname, 'default-room.json');
const SCHEMA_FILE = path.join(__dirname, '..', '..', 'schema', 'room.schema.json');
const MAX_BACKUPS = 50;
const MAX_ERRORS_SHOWN = 8;

const ajv = new Ajv({ allErrors: true, useDefaults: true, strict: false });
const validate = ajv.compile(SCHEMA);

class RoomStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.roomFile = path.join(dataDir, 'room.json');
    this.assetsDir = path.join(dataDir, 'assets');
    this.backupsDir = path.join(dataDir, 'backups');
    this.lastWritten = null;
  }

  // Create the folder layout on first run. Never overwrites an existing room.json.
  ensure() {
    for (const dir of [this.dataDir, this.assetsDir, this.backupsDir]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.mkdirSync(path.join(this.assetsDir, 'slideshow'), { recursive: true });
    if (!fs.existsSync(this.roomFile)) {
      fs.copyFileSync(DEFAULT_ROOM_FILE, this.roomFile);
    }
    // A copy of the schema next to room.json gives editors like VS Code autocomplete.
    try {
      fs.writeFileSync(path.join(this.dataDir, 'room.schema.json'), fs.readFileSync(SCHEMA_FILE));
    } catch (err) {
      console.error('Could not copy room.schema.json:', err.message);
    }
  }

  // Returns { ok: true, room, warnings } or { ok: false, error: { title, details[] } }.
  load() {
    let text;
    try {
      text = fs.readFileSync(this.roomFile, 'utf8');
    } catch (err) {
      return fail('SimRoom could not read room.json', [err.message]);
    }
    return this.parse(text);
  }

  parse(text) {
    let room;
    try {
      room = JSON.parse(text.replace(/^﻿/, ''));
    } catch (err) {
      return fail('room.json is not valid JSON', [describeJsonError(err, text)]);
    }
    const result = checkRoom(room);
    if (!result.ok) return result;
    return { ok: true, room, warnings: result.warnings };
  }

  // Validates, backs up the current file, then writes atomically.
  save(room) {
    const copy = structuredClone(room);
    const result = checkRoom(copy);
    if (!result.ok) {
      const err = new Error(result.error.title + ': ' + result.error.details.join('; '));
      err.details = result.error.details;
      throw err;
    }
    this.backup();
    const text = JSON.stringify(copy, null, 2) + '\n';
    const tmp = this.roomFile + '.tmp';
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, this.roomFile);
    this.lastWritten = text;
    return copy;
  }

  backup() {
    if (!fs.existsSync(this.roomFile)) return null;
    fs.mkdirSync(this.backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '');
    let target = path.join(this.backupsDir, `room-${stamp}.json`);
    for (let n = 2; fs.existsSync(target); n++) {
      target = path.join(this.backupsDir, `room-${stamp}-${n}.json`);
    }
    fs.copyFileSync(this.roomFile, target);
    this.pruneBackups();
    return target;
  }

  pruneBackups() {
    const files = fs.readdirSync(this.backupsDir)
      .filter((f) => /^room-.*\.json$/.test(f))
      .sort();
    for (const f of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) {
      fs.rmSync(path.join(this.backupsDir, f), { force: true });
    }
  }

  // Keeps the broken file (renamed) and starts over from the sample room.
  resetToSample() {
    if (fs.existsSync(this.roomFile)) {
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '');
      fs.renameSync(this.roomFile, path.join(this.dataDir, `room.broken-${stamp}.json`));
    }
    fs.copyFileSync(DEFAULT_ROOM_FILE, this.roomFile);
  }

  // True if the file on disk is something we did not just write ourselves.
  changedOnDisk() {
    try {
      return fs.readFileSync(this.roomFile, 'utf8') !== this.lastWritten;
    } catch {
      return true;
    }
  }

  // Resolve a path inside assets/, refusing anything that escapes the folder.
  assetPath(relative) {
    const full = path.resolve(this.assetsDir, relative);
    const rel = path.relative(this.assetsDir, full);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return full;
  }
}

// Schema validation (fills in defaults in place) plus checks JSON Schema can't express.
function checkRoom(room) {
  if (!validate(room)) {
    const details = friendlyErrors(validate.errors, room);
    return fail('room.json has settings SimRoom does not understand', details);
  }

  const details = [];
  const seen = new Map();
  walkTiles(room.tiles, (tile, where) => {
    if (seen.has(tile.id)) {
      details.push(`${where}: the id "${tile.id}" is already used by ${seen.get(tile.id)}. Every tile needs its own id.`);
    } else {
      seen.set(tile.id, where);
    }
  });
  const customIds = new Set();
  for (const theme of room.theme.custom) {
    if (customIds.has(theme.id)) details.push(`theme.custom: two custom themes use the id "${theme.id}".`);
    customIds.add(theme.id);
  }
  if (details.length) return fail('room.json has duplicate ids', details);

  const warnings = [];
  const presets = ['clubhouse', 'cinema', 'arcade', 'sonoran', 'metal', 'black'];
  if (!presets.includes(room.theme.active) && !customIds.has(room.theme.active)) {
    warnings.push(`Theme "${room.theme.active}" was not found, so Clubhouse is shown instead.`);
  }
  return { ok: true, warnings };
}

function walkTiles(tiles, fn, trail = 'tiles') {
  tiles.forEach((tile, i) => {
    const where = `${trail}[${i}] "${tile.label}"`;
    fn(tile, where);
    if (Array.isArray(tile.tiles)) walkTiles(tile.tiles, fn, `${where} → tiles`);
  });
}

// Turn Ajv errors into sentences a non-programmer can act on.
function friendlyErrors(errors, room) {
  // if/then wrappers repeat the real error; drop them.
  const useful = errors.filter((e) => e.keyword !== 'if');
  const lines = [];
  for (const e of useful) {
    const where = describePath(e.instancePath, room);
    let msg;
    switch (e.keyword) {
      case 'required': msg = `is missing "${e.params.missingProperty}"`; break;
      case 'additionalProperties': msg = `has an unknown setting "${e.params.additionalProperty}" (check the spelling)`; break;
      case 'enum': msg = `must be one of: ${e.params.allowedValues.map((v) => JSON.stringify(v)).join(', ')}`; break;
      case 'const': msg = `must be ${JSON.stringify(e.params.allowedValue)}`; break;
      case 'type': msg = `must be ${e.params.type.replace(',', ' or ')}`; break;
      case 'pattern': msg = e.instancePath.match(/color|background|tile|text|muted|accent|border|from|to/i)
        ? 'must be a hex color like #1f5238'
        : 'contains characters that are not allowed (use letters, numbers, - and _)'; break;
      case 'minimum': case 'maximum': msg = `must be ${e.keyword === 'minimum' ? 'at least' : 'at most'} ${e.params.limit}`; break;
      case 'maxLength': msg = `is too long (max ${e.params.limit} characters)`; break;
      default: msg = e.message;
    }
    const line = `${where} ${msg}.`;
    if (!lines.includes(line)) lines.push(line);
  }
  if (lines.length > MAX_ERRORS_SHOWN) {
    const more = lines.length - MAX_ERRORS_SHOWN;
    lines.length = MAX_ERRORS_SHOWN;
    lines.push(`…and ${more} more.`);
  }
  return lines;
}

// "/tiles/2/tiles/0/url" -> 'tiles[2] "Theater" → tiles[0] "Netflix" → url'
function describePath(pointer, room) {
  if (!pointer) return 'The file';
  const parts = pointer.split('/').slice(1).map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let node = room;
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    node = node == null ? undefined : node[key];
    if (/^\d+$/.test(key) && out.length) {
      const label = node && typeof node === 'object' && (node.label || node.name);
      out[out.length - 1] += `[${key}]` + (label ? ` "${label}"` : '');
    } else {
      out.push(key);
    }
  }
  return out.join(' → ');
}

function describeJsonError(err, text) {
  // V8 messages look like: Unexpected token } in JSON at position 812 (line 30 column 5)
  const hint = 'A missing or extra comma is the usual cause.';
  const m = /position (\d+)/.exec(err.message);
  if (!m || /line \d+/.test(err.message)) return `${err.message}. ${hint}`;
  const pos = Number(m[1]);
  const before = text.slice(0, pos);
  const line = before.split('\n').length;
  const column = pos - before.lastIndexOf('\n');
  return `${err.message} (line ${line}, column ${column}). ${hint}`;
}

function fail(title, details) {
  return { ok: false, error: { title, details } };
}

module.exports = { RoomStore, checkRoom, walkTiles, DEFAULT_ROOM_FILE };
