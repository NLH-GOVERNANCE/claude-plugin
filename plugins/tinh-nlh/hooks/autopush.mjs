// Auto-push after a commit (ticket eca924c5): pure decisions, no git, no network, no files. autopush-hook.mjs collects
// the facts and calls these; autopush-run.mjs runs the push. The rule: a commit on a work branch of our own
// organisations goes to origin at once, so a machine that turns off loses no work. Never a force push, never a base
// branch, never when the commits waiting to be pushed hold something that looks like a secret or cannot be read in full.
import { gitOps } from '../gate/checks.mjs';

// Organisations whose repos may be pushed to (allow list, exact names). Other owners: never.
export const PUSH_OWNERS = ['NLH-OS', 'NLH-GOVERNANCE', 'NLH-NEDU-CORE'];

const PROTECTED_BRANCH = /^(dev|main|master|HEAD)$|^(release|hotfix)\//i;
const SAFE_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

// owner/repo of a GitHub remote url when the owner is on the allow list, else null. Two shapes only: https://github.com/ORG/REPO
// (parsed with URL: host exactly github.com, no user, password, port, query or fragment, no backslash or control
// character) and the scp form git@github.com:ORG/REPO. ORG matches a listed name whole (any letter case), never a prefix.
export function allowedRemote(url) {
  const text = String(url ?? '').trim();
  if (!text || /[\\\s\u0000-\u001f\u007f-\u009f@]/.test(text.replace(/^git@github\.com:/, ''))) return null;
  let path;
  const scp = text.match(/^git@github\.com:(.+)$/);
  if (scp) {
    path = scp[1];
  } else {
    let parsed;
    try {
      parsed = new URL(text);
    } catch {
      return null;
    }
    if (!/^https:\/\/github\.com\//i.test(text)) return null;
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || text.includes('?') || text.includes('#')) return null;
    path = parsed.pathname.replace(/^\//, '');
  }
  const match = path.match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/);
  if (!match || /^\.+$/.test(match[2])) return null;
  const owner = PUSH_OWNERS.find((name) => name.toLowerCase() === match[1].toLowerCase());
  return owner ? owner + '/' + match[2] : null;
}

export const isProtectedBranch = (branch) => !branch || PROTECTED_BRANCH.test(branch) || !SAFE_BRANCH.test(branch) || branch.includes('..');

// Folders where the command ran `git commit` (after cd / git -C). `join` resolves a folder against the current one.
export function commitDirs(line, cwd, join) {
  if (!/\bgit(\.exe)?\b/i.test(line) || !/\bcommit\b/.test(line)) return [];
  return [...new Set(gitOps(line, cwd, join).filter((op) => op.op === 'commit').map((op) => op.dir))];
}

// Secrets: names of files, and added lines. The key patterns are built from parts so this file does not match itself.
const SECRET_NAME = [
  /^\.env(?!.*\.(example|sample|template)$)(\.|$)/i,
  /\.(pem|p12|pfx|ppk|jks|keystore)$/i,
  /key/i,
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /token/i,
];
const SECRET_LINE = [
  new RegExp(`AGE-SECRET${'-'}KEY-`),
  new RegExp(`gh[pousr]${'_'}[A-Za-z0-9]{20,}`),
  new RegExp(`github${'_'}pat_[A-Za-z0-9_]{20,}`),
  new RegExp(`xox[abposr]${'-'}[A-Za-z0-9-]{10,}`),
  new RegExp(`-----BEGIN [A-Z ]*PRIVATE ${'KEY'}-----`),
  // Anthropic, then any other "sk-" key (OpenAI and the like), AWS access key id, Google API key, Telegram bot token.
  new RegExp(`sk${'-'}ant-[A-Za-z0-9]+-[A-Za-z0-9_-]{20,}`),
  new RegExp(`\\bsk${'-'}(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{20,}`),
  new RegExp(`\\b(AKIA|ASIA)${''}[0-9A-Z]{16}\\b`),
  new RegExp(`AIza${''}[0-9A-Za-z_-]{35}`),
  new RegExp(`\\b[0-9]{8,10}${':'}[A-Za-z0-9_-]{35}\\b`),
  // A literal value of 16 characters or more assigned to VAULT_KEY or api_key (API_KEY, api-key, apiKey...); a name
  // such as process.env.API_KEY, a call or a ${...} placeholder is not a literal value.
  new RegExp(`VAULT${'_'}KEY['"]?\\s*[:=]\\s*['"]?[A-Za-z0-9_+/=-]{16,}`, 'i'),
  new RegExp(`(?<![A-Za-z])api[_-]?${'key'}['"]?\\s*[:=]\\s*['"]?[A-Za-z0-9_+/=-]{16,}`, 'i'),
  // A JSON Web Token (JWT), three base64url parts, the first two JSON objects.
  new RegExp(`\\beyJ[A-Za-z0-9_-]{8,}\\.${'eyJ'}[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}`),
];
export const looksLikeKey = (line) => SECRET_LINE.some((pattern) => pattern.test(line));

// Added lines of a patch from `git log -p`. Only lines inside a hunk count, whatever they start with: a header is
// recognised by position (from a "diff --git" line up to the first "@@"), never by its "+++" prefix, so an added line
// whose text starts with "++" is still read.
export function addedLines(patch) {
  const out = [];
  let header = false;
  for (const line of String(patch).split('\n')) {
    if (/^diff --(git|cc|combined) /.test(line)) header = true;
    else if (header && line.startsWith('@@')) header = false;
    else if (!header && line.startsWith('+')) out.push(line.slice(1));
  }
  return out;
}

// Names of files in the commits waiting to be pushed (deleted and renamed paths too), their patch text read as text,
// binary files included, and their commit messages (pushed with the commits). Findings name a file or a kind, never the value.
export function secretFindings({ names = [], patch = '', messages = '' }) {
  const found = [];
  for (const name of new Set(names)) {
    const base = String(name).split('/').pop();
    if (SECRET_NAME.some((pattern) => pattern.test(base))) found.push(`file ${name}`);
  }
  if (addedLines(patch).some(looksLikeKey)) found.push('a line that looks like a key');
  if (String(messages).split('\n').some(looksLikeKey)) found.push('a commit message that looks like a key');
  return found;
}

// The command that pushes: the checked commit to the same branch name, by its id (never the moving HEAD), to the one url
// that was checked (never the remote name: its urls can change). No force flag, no + refspec.
// Flags say what the config must not change: no submodule recursion, no tags, no signing.
export const PUSH_FLAGS = ['--no-recurse-submodules', '--no-follow-tags', '--no-signed'];
export const pushArgs = (root, url, sha, branch) => ['-C', root, 'push', ...PUSH_FLAGS, url, `${sha}:refs/heads/${branch}`];

// What the local gate is asked: the push of exactly the checked commit (the gate also reads a literal HEAD as a branch
// called HEAD, so HEAD is never sent to it).
export const gateCommand = (sha, branch) => `git push -u origin ${sha}:refs/heads/${branch}`;

// Last guard before spawning: only the exact shape pushArgs makes, to an allowed url and a branch that is not protected.
export function isSafePushArgs(args) {
  if (args.length !== 5 + PUSH_FLAGS.length || args[0] !== '-C' || args[2] !== 'push' || !PUSH_FLAGS.every((flag, i) => args[3 + i] === flag)) return false;
  const url = args[3 + PUSH_FLAGS.length];
  if (!allowedRemote(url)) return false;
  const match = String(args[4 + PUSH_FLAGS.length]).match(/^([0-9a-f]+):refs\/heads\/(.+)$/);
  return Boolean(match && SHA.test(match[1]) && !isProtectedBranch(match[2]) && !/^[-+]/.test(String(args[1])));
}

// How git reaches a server must be the default one, or the real target may differ from the url that was checked.
// Config: every entry of the effective config (`git config --list --show-scope`) in a section that touches the transport
// (url, protocol, ssh, http, remote, core, credential, push, submodule) must be on a short allow list of harmless settings; any
// other entry there is a violation. Other sections (user, branch, push, pull, alias, ...) do not matter here.
// Environment: variables that redirect git, its ssh, its proxy, its trust store, its config or its repo.
// include and includeIf are not listed: `git config --list` already follows them, so what they load is checked entry by entry.
const ALWAYS_BAD_SECTION = new Set(['url', 'protocol', 'ssh']);
const HTTP_OK = new Set(['postbuffer', 'lowspeedlimit', 'lowspeedtime', 'version']);
const REMOTE_OK = new Set(['url', 'fetch', 'pushurl', 'tagopt', 'prune', 'prunetags']);
const SUBMODULE_OK = new Set(['url', 'active', 'branch']);
const CORE_OK = new Set([
  'autocrlf', 'filemode', 'ignorecase', 'safecrlf', 'eol', 'symlinks', 'fscache', 'longpaths', 'precomposeunicode', 'quotepath',
  'bare', 'repositoryformatversion', 'logallrefupdates', 'editor', 'whitespace', 'preloadindex', 'untrackedcache', 'commentchar',
  'excludesfile', 'attributesfile', 'protectntfs', 'trustctime', 'checkstat', 'abbrev', 'compression', 'loosecompression', 'hidedotfiles',
]);
const HELPER_PLAIN = /^(|manager|manager-core|osxkeychain|libsecret|wincred|store|cache)$/;
// The GitHub CLI helper: exactly these strings (bare `gh`, or a full path in the quotes, in a known install folder), nothing before or after.
const GH_PATHS = ['/usr/bin/gh', '/usr/local/bin/gh', '/opt/homebrew/bin/gh', 'C:\\Program Files\\GitHub CLI\\gh.exe', 'C:/Program Files/GitHub CLI/gh.exe'];
const HELPER_GH = new Set(['!gh auth git-credential', ...GH_PATHS.map((path) => `!'${path}' auth git-credential`)]);
const TRANSPORT_ENV = /^(GIT_SSH|GIT_SSH_COMMAND|GIT_SSH_VARIANT|GIT_PROXY_COMMAND|GIT_PROXY_.*|GIT_CONFIG.*|GIT_DIR|GIT_WORK_TREE|GIT_EXEC_PATH|GIT_SSL_.*|GIT_ASKPASS|SSH_ASKPASS|CURL_CA_BUNDLE|SSL_CERT_FILE|SSL_CERT_DIR|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)$/i;

// entries: [{ scope, key, value }]. Returns the keys that are not on the allow list (labels for a test, never printed).
export function transportViolations(entries) {
  const bad = [];
  for (const { scope, key, value } of entries) {
    const parts = String(key).split('.');
    const section = parts[0].toLowerCase();
    const variable = parts[parts.length - 1].toLowerCase();
    const plain = parts.length === 2;
    let ok = true;
    if (ALWAYS_BAD_SECTION.has(section)) ok = false;
    else if (section === 'http') {
      ok =
        HTTP_OK.has(variable) ||
        // Git for Windows and Git for macOS write these two in the system config: its own trust store.
        (scope === 'system' && plain && variable === 'sslbackend' && /^(openssl|schannel)$/i.test(value)) ||
        (scope === 'system' && plain && variable === 'sslcainfo' && /\/etc\/ssl\/certs\/ca-bundle\.crt$/i.test(value));
    } else if (section === 'remote') ok = (parts.length >= 3 && REMOTE_OK.has(variable)) || (plain && variable === 'pushdefault');
    else if (section === 'core') ok = plain && CORE_OK.has(variable);
    else if (section === 'push') ok = plain && (variable === 'default' || variable === 'autosetupremote');
    else if (section === 'submodule') ok = parts.length >= 3 && SUBMODULE_OK.has(variable);
    else if (section === 'credential') {
      ok = variable === 'usehttppath' || (variable === 'helper' && (HELPER_PLAIN.test(value) || (HELPER_GH.has(value) && (scope === 'system' || scope === 'global'))));
    }
    if (!ok) bad.push(String(key));
  }
  return [...new Set(bad)];
}
export const transportEnvNames = (env) => Object.keys(env ?? {}).filter((name) => TRANSPORT_ENV.test(name) && String(env[name] ?? '') !== '');

// What the local gate answered. The gate hook (gate/hook.mjs, unchanged) prints a deny line when it blocks and nothing when it
// lets a push through, which is also what it does when it fails inside. The proof that it really checked is the record it
// writes for a push it let through (push-<tool_use_id>.json in its state folder): the commit id and branch, the list of
// checks that ran ("luật cổng" is added only after the counted rules ran) and whether the rules were missing.
// A yes needs: a clean exit, no timeout, nothing printed, and a record for exactly this commit and branch with the rules
// loaded and run. Silence alone, a crash, a timeout or any other answer is not a yes.
// result: { status, signal, error, stdout } of the finished process; proof: { records, sha, branch, repo, root }.
export function gateVerdict({ status, signal, error, stdout } = {}, { records = null, sha, branch, repo, root } = {}) {
  if (error) return { allowed: false, reason: 'gate did not run' };
  if (signal) return { allowed: false, reason: 'gate timed out or was stopped' };
  if (status !== 0) return { allowed: false, reason: 'gate exit code not 0' };
  if (String(stdout ?? '').trim() !== '') return { allowed: false, reason: /"permissionDecision":\s*"deny"/.test(stdout) ? 'gate said no' : 'gate answer not understood' };
  // The record must be for this commit, this branch, this repo (owner/name, any letter case) and this working folder.
  const sameRepo = (item) => typeof item.repo === 'string' && typeof repo === 'string' && item.repo.toLowerCase() === repo.toLowerCase();
  const record = Array.isArray(records) ? records.find((item) => item && item.sha === sha && item.branch === branch && sameRepo(item) && item.root === root) : null;
  if (!record) return { allowed: false, reason: 'gate left no record that it checked this commit' };
  if (record.rulesMissing !== false) return { allowed: false, reason: 'gate rules not loaded' };
  if (!Array.isArray(record.checks) || !record.checks.includes('luật cổng')) return { allowed: false, reason: 'gate rules did not run' };
  return { allowed: true, reason: 'gate said yes' };
}

// Facts: { env, isCommit, branch, sha, remoteUrls, pushUrls, transportKeys, remoteUnreadable, names, patch, messages, scanFailed }. Returns { push, reason, notice }:
// notice is the one line for Claude, only when a secret or an unreadable patch stopped the push; every other "no" is
// silent. EVERY fetch and push url of origin must be on the allow list (one stranger and nothing is pushed), and there
// must be exactly one of each: git pushes to all push urls, and only one was checked.
// Off by default (CTO, eca924c5): only the exact string "1" turns auto-push on. Unset, "0", "true", " 1" and the rest: off.
export const autoPushOn = (env = {}) => env.NLH_AUTOPUSH === '1';

export function decideAutoPush({ env = {}, isCommit = true, branch, sha, remoteUrls = [], pushUrls = [], transportKeys = [], remoteUnreadable = false, names = [], patch = '', messages = '', scanFailed = false }) {
  if (!autoPushOn(env)) return { push: false, reason: 'off' };
  if (!isCommit) return { push: false, reason: 'not-a-commit' };
  if (isProtectedBranch(branch)) return { push: false, reason: 'protected-branch' };
  if (!SHA.test(String(sha ?? ''))) return { push: false, reason: 'no-commit' };
  if (!remoteUrls.length || !pushUrls.length || ![...remoteUrls, ...pushUrls].every((url) => allowedRemote(url))) {
    return { push: false, reason: 'remote-not-allowed' };
  }
  const oddTransport = [...transportKeys, ...transportEnvNames(env)];
  if (oddTransport.length) {
    return {
      push: false,
      reason: 'transport',
      notice: `Nếp did not auto-push ${branch}: ${oddTransport.length} git setting(s) or variable(s) change the way git reaches GitHub, so the real target may differ from the one checked. Push by hand.`,
    };
  }
  if (remoteUrls.length > 1 || pushUrls.length > 1) {
    return {
      push: false,
      reason: 'many-urls',
      notice: `Nếp did not auto-push ${branch}: origin has more than one url (git pushes to all of them). Keep one, or push by hand.`,
    };
  }
  if (remoteUrls[0] !== pushUrls[0]) {
    return { push: false, reason: 'urls-differ', notice: `Nếp did not auto-push ${branch}: the fetch url and the push url of origin differ. Make them the same, or push by hand.` };
  }
  if (remoteUnreadable) return { push: false, reason: 'remote-unreadable' };
  if (scanFailed) {
    return {
      push: false,
      reason: 'unscannable',
      notice: `Nếp did not auto-push ${branch}: the commits waiting to be pushed could not be read in full (too large or git failed). Check, then push by hand.`,
    };
  }
  const found = secretFindings({ names, patch, messages });
  if (found.length) {
    // Counts and kinds only, never a file name or a value: names are written by whoever made the commit, and the line goes to Claude.
    const files = found.filter((item) => item.startsWith('file ')).length;
    const kinds = [files ? `${files} file(s) with a secret-like name` : '', found.includes('a line that looks like a key') ? 'key-like content' : '', found.includes('a commit message that looks like a key') ? 'a key-like commit message' : ''].filter(Boolean).join(' and ');
    return { push: false, reason: 'secret', notice: `Nếp did not auto-push ${branch}: the commits waiting to be pushed hold ${kinds}. Check, then push by hand.` };
  }
  return { push: true, reason: 'ok', repo: allowedRemote(pushUrls[0]), url: pushUrls[0], sha, branch };
}

// Strip credentials from a line of git output before it is logged.
export const redact = (text) =>
  String(text ?? '')
    .replace(/:\/\/[^@/\s]+@/g, '://***@')
    .replace(new RegExp(`(gh[pousr]${'_'}|github${'_'}pat_|xox[abposr]${'-'})[A-Za-z0-9_-]+`, 'g'), '$1***')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 160);

// The push itself, with the dependencies passed in so a test can change the repo between two steps.
// deps: { facts(root), gate(facts, decision) -> { allowed, reason }, push(args) -> { ok, message }, afterPush(facts), log(line), between() }.
// Steps: read the facts and decide; ask the gate about exactly that commit; read the facts again and cancel if the
// branch or HEAD moved (then start over, at most MAX_ROUNDS times: a commit made meanwhile is checked in its turn);
// push `<sha>:refs/heads/<branch>` with the checked id. Returns a short word for what happened.
export const MAX_ROUNDS = 3;
const sameFacts = (a, b) =>
  a.sha === b.sha && a.branch === b.branch && a.root === b.root && ['pushUrls', 'remoteUrls', 'transportKeys'].every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
export function runAutoPush(root, { env = {}, facts, gate, push, afterPush = () => {}, log = () => {}, between = () => {} }) {
  // The worker checks the switch itself before any git or network, even when started by hand.
  if (!autoPushOn(env)) return 'off';
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const before = facts(root);
    const decision = before ? decideAutoPush({ env, ...before }) : { push: false, reason: 'no-facts' };
    if (!decision.push) {
      if (decision.notice || decision.reason === 'remote-unreadable') log(`${before.branch} not pushed: ${decision.reason} (retry at next commit)`);
      return decision.reason;
    }
    const verdict = gate(before, decision);
    if (!verdict.allowed) {
      log(`${decision.repo} ${before.branch} not pushed: ${verdict.reason}`);
      return 'gate';
    }
    between();
    const after = facts(root);
    // Everything that decided the push must be as it was: the commit, the branch, the folder, both url lists and the
    // transport settings. Anything else changed: nothing is pushed on this round.
    if (!after || !sameFacts(before, after)) continue;
    const again = decideAutoPush({ env, ...after });
    if (!again.push) {
      if (again.notice) log(`${after.branch} not pushed: ${again.reason}`);
      return again.reason;
    }
    const args = pushArgs(after.root, again.url, after.sha, after.branch);
    if (!isSafePushArgs(args)) {
      log(`${again.repo} ${after.branch} refused: unsafe push command`);
      return 'unsafe';
    }
    const result = push(args);
    if (result.ok) {
      afterPush(after);
      log(`${again.repo} ${after.branch} pushed`);
      return 'pushed';
    }
    log(`${again.repo} ${after.branch} push failed (retry at next commit): ${result.message}`);
    return 'failed';
  }
  log('HEAD kept moving: not pushed (retry at next commit)');
  return 'moved';
}
