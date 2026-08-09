#!/usr/bin/env node
'use strict';

// Bridge between a grilling session and the companion mobile voice app.
// Sessions live outside any repo so one hub can list them across projects:
// MPX_VOICE_GRILL_ROOT when set, otherwise <home>/.mpx-voice-grill/sessions.

const fs = require('fs');
const os = require('os');
const path = require('path');

const POLL_INTERVAL_MS = 3000;
const DEFAULT_WAIT_TIMEOUT_SECONDS = 540;

function sessionsRoot() {
  return (
    process.env.MPX_VOICE_GRILL_ROOT ||
    path.join(os.homedir(), '.mpx-voice-grill', 'sessions')
  );
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function sessionDir(sessionId) {
  return path.join(sessionsRoot(), sessionId);
}

function loadSessionMeta(sessionId) {
  const metaPath = path.join(sessionDir(sessionId), 'session.json');
  if (!fs.existsSync(metaPath)) {
    fail(`Unknown session '${sessionId}' — no session.json under ${sessionDir(sessionId)}`);
  }
  return { metaPath, meta: readJson(metaPath) };
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith('--')) {
      flags[argv[index]] = argv[index + 1];
      index += 1;
    } else {
      positional.push(argv[index]);
    }
  }
  return { positional, flags };
}

function commandInit(flags) {
  const project = flags['--project'];
  const topic = flags['--topic'];
  if (!project || !topic) {
    fail('Usage: grill-voice.js init --project <name> --topic <topic>');
  }
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const sessionId = `${slugify(project)}--${slugify(topic)}--${stamp}`;
  const dir = sessionDir(sessionId);
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
  writeJson(path.join(dir, 'session.json'), {
    schema: 1,
    sessionId,
    project,
    projectPath: process.cwd(),
    topic,
    createdAt: now.toISOString(),
    status: 'evaluating',
    currentRound: 0,
  });
  console.log(sessionId);
}

function commandPublish(positional) {
  const [sessionId, roundFile] = positional;
  if (!sessionId || !roundFile) {
    fail('Usage: grill-voice.js publish <sessionId> <roundJsonFile>');
  }
  const round = readJson(roundFile);
  if (round.sessionId !== sessionId) {
    fail(`Round file sessionId '${round.sessionId}' does not match '${sessionId}'`);
  }
  if (!Number.isInteger(round.round) || !Array.isArray(round.questions) || round.questions.length === 0) {
    fail('Round file needs an integer "round" and a non-empty "questions" array — see CONTRACT.md');
  }
  for (const question of round.questions) {
    if (!question.id || !question.text) {
      fail('Every question needs "id" and "text" — see CONTRACT.md');
    }
  }
  const { metaPath, meta } = loadSessionMeta(sessionId);
  const target = path.join(sessionDir(sessionId), `round-${round.round}.json`);
  writeJson(target, round);
  meta.status = 'awaiting_answers';
  meta.currentRound = round.round;
  writeJson(metaPath, meta);
  console.log(target);
}

async function commandWait(positional, flags) {
  const [sessionId, roundText] = positional;
  const round = Number(roundText);
  if (!sessionId || !Number.isInteger(round)) {
    fail('Usage: grill-voice.js wait <sessionId> <round> [--timeout-seconds N]');
  }
  const timeoutSeconds = Number(flags['--timeout-seconds'] || DEFAULT_WAIT_TIMEOUT_SECONDS);
  const answersPath = path.join(sessionDir(sessionId), `round-${round}.answers.json`);
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    if (fs.existsSync(answersPath)) {
      // Small settle delay so a writer that just created the file finishes writing.
      await new Promise((resolve) => setTimeout(resolve, 500));
      const answers = readJson(answersPath);
      const { metaPath, meta } = loadSessionMeta(sessionId);
      meta.status = 'evaluating';
      writeJson(metaPath, meta);
      console.log(JSON.stringify(answers, null, 2));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  console.error(`Still waiting for ${answersPath} after ${timeoutSeconds}s — run wait again.`);
  process.exit(2);
}

function commandComplete(positional) {
  const [sessionId] = positional;
  if (!sessionId) {
    fail('Usage: grill-voice.js complete <sessionId>');
  }
  const { metaPath, meta } = loadSessionMeta(sessionId);
  meta.status = 'completed';
  meta.completedAt = new Date().toISOString();
  writeJson(metaPath, meta);
  console.log(`Session ${sessionId} completed.`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  if (command === 'init') return commandInit(flags);
  if (command === 'publish') return commandPublish(positional);
  if (command === 'wait') return commandWait(positional, flags);
  if (command === 'complete') return commandComplete(positional);
  fail('Usage: grill-voice.js <init|publish|wait|complete> ...');
}

main().catch((error) => fail(error.message));
