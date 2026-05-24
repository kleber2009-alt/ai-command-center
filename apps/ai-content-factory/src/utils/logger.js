const fs = require('fs');
const path = require('path');
const paths = require('./paths');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ts() {
  return new Date().toISOString();
}

function write(file, line) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, line + '\n');
}

function pipelineLog(kind, level, message, extra = {}) {
  const line = JSON.stringify({ ts: ts(), level, kind, message, ...extra });
  write(path.join(paths.logs, `${today()}-${kind}.log`), line);
  const prefix = level === 'error' ? '✗' : level === 'warn' ? '!' : '·';
  // eslint-disable-next-line no-console
  console.log(`${prefix} [${kind}] ${message}`);
}

const log = {
  info: (kind, message, extra) => pipelineLog(kind, 'info', message, extra),
  warn: (kind, message, extra) => pipelineLog(kind, 'warn', message, extra),
  error: (kind, message, extra) => pipelineLog(kind, 'error', message, extra),
  claudeCall(entry) {
    ensureDir(paths.logs);
    write(path.join(paths.logs, 'claude-calls.jsonl'), JSON.stringify({ ts: ts(), ...entry }));
  },
};

module.exports = log;
