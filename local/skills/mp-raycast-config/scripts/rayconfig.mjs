#!/usr/bin/env node
/**
 * Read and rebuild Raycast `.rayconfig` export files.
 *
 * Format recovered from Raycast's own backend bundle (`Raycast\backend\index.mjs`):
 *
 *   file     = gzip(JSON envelope)
 *   envelope = { exportedAt, appVersion, osName, osVersion, osArch,
 *                schemaVersion, data: <hex>, encryption?: { iv, salt, authTag } }
 *   data     = hex( aes-256-gcm( gzip(JSON payload) ) )   when a password was set
 *            = hex( gzip(JSON payload) )                  when it was not
 *   key      = crypto.scrypt(password, salt, 32)          Node defaults: N=16384, r=8, p=1
 *
 * Raycast's export UI demands a password, but its import path accepts an unencrypted
 * file — so `encode` may omit the password and the result still imports.
 *
 * Usage:
 *   node rayconfig.mjs decode <input.rayconfig> <output.json> [password]
 *   node rayconfig.mjs encode <input.json> <output.rayconfig> [password]
 */

import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { gzip, gunzip } from "node:zlib";
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const deriveKey = promisify(scrypt);

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const INITIALISATION_VECTOR_LENGTH = 16;

async function decode(inputPath, outputPath, password) {
  const envelope = JSON.parse(await decompress(await readFile(inputPath)));
  const storedPayload = Buffer.from(envelope.data, "hex");

  let compressedPayload;
  if (envelope.encryption) {
    if (!password) throw new Error("This export is encrypted — a password is required.");
    const { iv, salt, authTag } = envelope.encryption;
    const key = await deriveKey(password, Buffer.from(salt, "hex"), KEY_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"), {});
    decipher.setAuthTag(Buffer.from(authTag, "hex"));
    // A wrong password fails here with "unable to authenticate data" rather than silently.
    compressedPayload = Buffer.concat([decipher.update(storedPayload), decipher.final()]);
  } else {
    compressedPayload = storedPayload;
  }

  const payload = JSON.parse(await decompress(compressedPayload));
  await writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");

  const summary = Object.entries(payload)
    .map(([category, value]) => `${category}: ${summarise(value)}`)
    .join("\n  ");
  console.log(`exported ${envelope.exportedAt} by Raycast ${envelope.appVersion}\n  ${summary}`);
  return { envelope, payload };
}

function summarise(value) {
  if (Array.isArray(value)) return `${value.length} entries`;
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, inner]) => (Array.isArray(inner) ? `${key}=${inner.length}` : key))
      .join(", ");
  }
  return String(value);
}

async function encode(inputPath, outputPath, password) {
  const payload = JSON.parse(await readFile(inputPath, "utf8"));
  const compressedPayload = await compress(JSON.stringify(payload));

  const envelope = {
    exportedAt: new Date().toISOString(),
    appVersion: process.env.RAYCAST_VERSION ?? "0.71.0.0",
    osName: "Windows 11 Professional",
    osVersion: "10.0.26200.0",
    osArch: "amd64",
    schemaVersion: 2,
  };

  if (password) {
    const salt = randomBytes(SALT_LENGTH);
    const key = await deriveKey(password, salt, KEY_LENGTH);
    const initialisationVector = randomBytes(INITIALISATION_VECTOR_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key, initialisationVector, {});
    const encrypted = Buffer.concat([cipher.update(compressedPayload), cipher.final()]);
    envelope.data = encrypted.toString("hex");
    envelope.encryption = {
      iv: initialisationVector.toString("hex"),
      salt: salt.toString("hex"),
      authTag: cipher.getAuthTag().toString("hex"),
    };
  } else {
    envelope.data = compressedPayload.toString("hex");
  }

  await writeFile(outputPath, await compress(JSON.stringify(envelope)));
  console.log(`wrote ${outputPath}${password ? " (encrypted)" : " (unencrypted)"}`);
}

const [command, inputPath, outputPath, password] = process.argv.slice(2);
if (command === "decode") await decode(inputPath, outputPath, password);
else if (command === "encode") await encode(inputPath, outputPath, password);
else {
  console.error("usage: node rayconfig.mjs decode|encode <input> <output> [password]");
  process.exit(1);
}
