/**
 * A CLASSROOM CAN SIGN IN (2026-11-20).
 *
 * The login limiter allowed 5 attempts per 15 minutes per ADDRESS and counted
 * correct ones too. A school lab is one address, so the sixth student of a
 * class to sign in was refused "Too many login attempts" with the right
 * password, and so was everyone after them. Now only FAILED sign-ins count:
 * 5 per address + typed name, 50 per address across all names.
 * Judged by status codes from ONE fixed address (the fixtures normally give
 * every Session its own address, which would hide exactly this).
 *
 *   L-01  THE CASE THAT MATTERS: 30 correct sign-ins from one address, all 200
 *   L-02  control: 5 wrong guesses at one name, the 6th is refused 429
 *         (without this L-01 passes against no limiter at all)
 *   L-03  one pupil's typos do not lock the room: from the same address a
 *         classmate's correct sign-in is 200
 *   L-04  control: 50 wrong guesses spread over 50 names from one address,
 *         the 51st is refused 429 (no spraying a password across usernames)
 */
import { build, Session } from "./fixtures.mjs";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(5)} ${what.padEnd(64)} ${note}`);
};
async function attempt(ip, username, password) {
  const s = new Session("lab");
  s.clientIp = ip;
  const r = await s.post("/api/login/username", { username, password });
  return r.status;
}

const { orgs } = await build();
const A = orgs.A;
const accounts = [
  { u: A.adminUsername, p: A.adminPassword },
  ...A.students.map((s) => ({ u: s.username, p: s.password })),
];
if (accounts.some((a) => !a.u || !a.p)) throw new Error("fixture accounts missing a username or password");

const LAB = "10.250.1.1";
const codes = [];
for (let i = 0; i < 30; i++) {
  const a = accounts[i % accounts.length];
  codes.push(await attempt(LAB, a.u, a.p));
}
const firstBad = codes.findIndex((c) => c !== 200);
rec("L-01", "30 correct sign-ins from one address all succeed",
  firstBad === -1, firstBad === -1 ? "30 x 200" : `attempt ${firstBad + 1} -> ${codes[firstBad]}`);

const guesses = [];
for (let i = 0; i < 6; i++) guesses.push(await attempt(LAB, "no.such.pupil", `wrong-${i}`));
rec("L-02", "6th wrong guess at one name from one address is 429",
  guesses.slice(0, 5).every((c) => c === 401) && guesses[5] === 429, guesses.join(","));

const classmate = accounts[1] ?? accounts[0];
const after = await attempt(LAB, classmate.u, classmate.p);
rec("L-03", "a classmate still signs in from the same address", after === 200, `HTTP ${after}`);

const SPRAY = "10.250.2.1";
const spray = [];
for (let i = 0; i < 51; i++) spray.push(await attempt(SPRAY, `spray.name.${i}`, "Password1!"));
rec("L-04", "51st wrong guess across 51 names from one address is 429",
  spray.slice(0, 50).every((c) => c === 401) && spray[50] === 429,
  `401s=${spray.slice(0, 50).filter((c) => c === 401).length} last=${spray[50]}`);

const failed = results.filter((r) => !r.pass).length;
console.log(`\nlogin-limit: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
