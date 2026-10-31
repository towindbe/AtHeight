/* Token verwalten (nach „npx wrangler login“ und eingetragener KV-id).
   node tokens.mjs neu <name> <tage> [limit]   -> legt Token an, gibt ihn aus
   node tokens.mjs verlaengern <token> <tage>  -> setzt Ablauf auf heute + Tage
   node tokens.mjs sperren <token>             -> löscht den Token
   Zusatz: --local  (lokaler Test-Speicher statt Cloudflare) */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2).filter(a => a !== "--local");
const lokal = process.argv.includes("--local");
const [cmd, a, b, c] = args;
const kv = (...x) => execFileSync("npx", ["wrangler", "kv", "key", ...x, "--binding=TOKENS", lokal ? "--local" : "--remote"],
  { stdio: "inherit", shell: process.platform === "win32" });
const setze = (token, info) => {   // Wert über Datei, damit keine Anführungszeichen verloren gehen
  const datei = join(mkdtempSync(join(tmpdir(), "tok-")), "t.json");
  writeFileSync(datei, JSON.stringify(info));
  kv("put", "t:" + token, "--path", datei);
};
const bis = tage => new Date(Date.now() + tage * 864e5).toISOString().slice(0, 10);

if (cmd === "neu" && a && b) {
  const token = randomBytes(12).toString("hex");
  const info = { name: a, bis: bis(+b), ...(c ? { limit: +c } : {}) };
  setze(token, info);
  console.log(`\nToken: ${token}\nLink:  …/?t=${token}\nGültig bis ${info.bis}`);
} else if (cmd === "verlaengern" && a && b) {
  setze(a, { name: "verlaengert", bis: bis(+b) });
} else if (cmd === "sperren" && a) {
  kv("delete", "t:" + a);
} else {
  console.log("Aufruf: siehe Kopf der Datei tokens.mjs");
}
