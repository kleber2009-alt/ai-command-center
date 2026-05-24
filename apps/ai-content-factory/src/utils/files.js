const fs = require('fs');
const path = require('path');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) {
    if (fallback !== null) return fallback;
    throw new Error(`File not found: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function readText(file) {
  return fs.readFileSync(file, 'utf-8');
}

function writeText(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, 'utf-8');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { ensureDir, readJson, writeJson, readText, writeText, today };
