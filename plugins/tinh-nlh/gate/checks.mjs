// Checks of the local gate (ticket 6c4e1825): what to look at in a Bash or PowerShell command, and which findings block a
// git commit or git push. Pure functions, no git, no network: hook.mjs collects the facts and calls these.
// Counted rules come from gate/rules.mjs of NLH-OS/api (passed in as `rules`, never copied here); repeated errors come
// from repeated-errors.json, one check per line.

// Repos the gate applies to: NLH-OS, NLH-GOVERNANCE and every NLH-NEDU-* organisation on GitHub.
const SCOPE = /^(NLH-OS|NLH-GOVERNANCE|NLH-NEDU-[A-Za-z0-9-]+)$/i;
const BASE_BRANCHES = ['dev', 'main'];
const CHECKBOX = /^\s*[-*]\s+\[([ xX])\]\s?(.*)$/;
const COUNT_WORDS = { một: 1, hai: 2, ba: 3, bốn: 4, năm: 5 };
const COMMIT_COUNT = /(\d+|một|hai|ba|bốn|năm)\s+commit\b/i;

// owner/repo of a GitHub remote url when the owner is in scope, else null.
export function scopedRepo(remoteUrl) {
  const match = String(remoteUrl ?? '').trim().match(/github\.com[:/]+([^/]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  return match && SCOPE.test(match[1]) ? `${match[1]}/${match[2]}` : null;
}

// Split a shell line into commands (on unquoted && || ; | and new lines), each a list of words without quotes.
// Quote-aware so a commit message written with a heredoc inside "$(cat <<'EOF' … EOF)" stays one word.
export function splitCommands(line) {
  const commands = [];
  let words = [];
  let word = '';
  let quote = null;
  let started = false;
  const endWord = () => {
    if (started) words.push(word);
    word = '';
    started = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length) commands.push(words);
    words = [];
  };
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < line.length) word += line[++i];
      else word += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (ch === '\\' && i + 1 < line.length && line[i + 1] !== '\n') {
      word += line[++i];
      started = true;
    } else if (ch === ' ' || ch === '\t' || ch === '\r') {
      endWord();
    } else if (ch === '\n' || ch === ';' || ch === '|' || (ch === '&' && line[i + 1] === '&')) {
      if (ch === '&' || (ch === '|' && line[i + 1] === '|')) i += 1;
      endCommand();
    } else {
      word += ch;
      started = true;
    }
  }
  endCommand();
  return commands;
}

// git commit and git push in a command line, each with the folder it runs in (after cd / Set-Location / git -C).
// `join` resolves a folder against the current one (path.resolve in the hook).
export function gitOps(line, cwd, join) {
  const ops = [];
  let dir = cwd;
  for (const words of splitCommands(line)) {
    const [head, ...rest] = words;
    if (/^(cd|Set-Location|sl|pushd|Push-Location)$/i.test(head ?? '')) {
      const target = rest.find((word) => !word.startsWith('-'));
      if (target) dir = join(dir, target);
      continue;
    }
    const at = words.findIndex((word) => /^git(\.exe)?$/i.test(word));
    if (at === -1) continue;
    let opDir = dir;
    let i = at + 1;
    while (i < words.length && words[i].startsWith('-')) {
      if (words[i] === '-C') opDir = join(opDir, words[(i += 1)] ?? '.');
      else if (words[i] === '-c') i += 1;
      i += 1;
    }
    if (words[i] === 'commit' || words[i] === 'push') ops.push({ op: words[i], dir: opDir, args: words.slice(i + 1) });
  }
  return ops;
}

// git commit flags that change what gets counted: --amend adds no commit, -a also commits modified tracked files.
export function commitFlags(args) {
  let amend = false;
  let all = false;
  for (const arg of args) {
    if (arg === '--amend') amend = true;
    else if (arg === '--all') all = true;
    else if (/^-[A-Za-z]+$/.test(arg)) {
      // A short cluster like -am: letters up to the first one that takes a value.
      for (const letter of arg.slice(1)) {
        if (letter === 'a') all = true;
        if ('mFCctS'.includes(letter)) break;
      }
    }
  }
  return { amend, all };
}

// What a git push sends: remote, source ref, destination branch, force or not; skip for deletes and tags.
export function pushTarget(args, currentBranch) {
  const positional = [];
  let force = false;
  let skip = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (/^(-f|--force|--force-with-lease(=.*)?|--force-if-includes)$/.test(arg)) force = true;
    else if (/^(-d|--delete|--tags|--mirror|--all)$/.test(arg)) skip = true;
    else if (/^(-o|--push-option|--repo|--receive-pack|--exec)$/.test(arg)) i += 1;
    else if (!arg.startsWith('-')) positional.push(arg);
  }
  const remote = positional[0] ?? 'origin';
  let refspec = positional[1] ?? currentBranch;
  if (refspec.startsWith('+')) {
    force = true;
    refspec = refspec.slice(1);
  }
  const [src, dst = src] = refspec.split(':');
  const branch = dst.replace(/^refs\/heads\//, '');
  if (dst.startsWith('refs/tags/') || src === '' || positional.length > 2) skip = true;
  return { remote, src: src === 'HEAD' ? currentBranch : src, branch, force, skip };
}

export const isBaseBranch = (branch) => BASE_BRANCHES.includes(branch);

// Glob with * (inside one folder) and ** (across folders). A pattern without "/" matches the file name, with "/" the end of the path.
export function matchesPath(pattern, path) {
  const escape = (part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const source = pattern.split('**').map((chunk) => chunk.split('*').map(escape).join('[^/]*')).join('.*');
  return pattern.includes('/') ? new RegExp(`(^|/)${source}$`).test(path) : new RegExp(`^${source}$`).test(path.split('/').pop());
}

// Counted rules of the PR gate, run on what the PR will look like after this commit or push.
// Facts: { op, branch, base, commitCount, changedFiles, commitAuthorDates, pr, now }.
export function gateFindings(rules, facts) {
  const { op, branch, base, pr, now } = facts;
  const found = rules.checkPullRequest({
    pr: {
      createdAt: pr?.createdAt ?? new Date(now).toISOString(),
      base: pr?.baseRefName ?? base,
      head: branch,
      commitCount: isBaseBranch(branch) ? 0 : facts.commitCount,
      changedFiles: isBaseBranch(branch) ? 0 : facts.changedFiles,
      body: pr?.body ?? null,
      headInDev: false,
    },
    commitAuthorDates: isBaseBranch(branch) ? [] : facts.commitAuthorDates,
    forcePushCount: 0,
    now,
  });
  return found
    .filter((finding) => finding.severity === (rules.SEVERITY?.block ?? 'block'))
    .filter((finding) => {
      const rule = finding.rule.split(' ')[0];
      // PR age and branch age at opening cannot be fixed by this commit or push; the gate reports them on the PR.
      if (rule === 'R01') return false;
      if (rule === 'R18') return op === 'push' && !pr;
      // The description and the target branch exist only once the PR is open.
      if (rule === 'R04' || rule === 'R12') return Boolean(pr);
      return true;
    })
    .map((finding) => ({ id: finding.rule, message: finding.message }));
}

// Values from the repo or the PR description go into text Claude reads: one line, no quotes or backticks, short.
export const plain = (value) => String(value).replace(/[\u0000-\u001f\u007f-\u009f"`<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
const fill = (message, values) => message.replace(/\{(\w+)\}/g, (all, key) => (key in values ? plain(values[key]) : all));

// Checkbox items of the "## Test Plan" section of a PR description: { done, text }.
export function testPlanItems(body) {
  const lines = String(body ?? '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+test plan\s*:?\s*$/i.test(line.trim()));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2}\s+/.test(line));
  return (end === -1 ? rest : rest.slice(0, end))
    .map((line) => line.match(CHECKBOX))
    .filter(Boolean)
    .map((match) => ({ done: match[1] !== ' ', text: match[2].trim() }));
}

// Ticked items of the "## Test Plan" section.
export const tickedItems = (body) => testPlanItems(body).filter((item) => item.done).map((item) => item.text);

// The text under "## Risk" of a PR description, or null when there is none.
export function riskSection(body) {
  const lines = String(body ?? '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+risk\b/i.test(line.trim()));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2}\s+/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

// Unified diff (-U0) to added lines: [{ path, text }]. Deleted files and binary files add none.
export function parseAddedLines(diff, limit = 5000) {
  const lines = [];
  let path = null;
  for (const line of String(diff ?? '').split('\n')) {
    if (line.startsWith('+++ ')) path = line.startsWith('+++ b/') ? line.slice(6) : null;
    else if (line.startsWith('+') && path && lines.length < limit) lines.push({ path, text: line.slice(1) });
  }
  return lines;
}

// Words the village names retire, read from the R19 line of rules/pr-review.md (decisions repo): the text after
// "retires (" up to ")". Nothing hard-coded: no rules text, no words, and the two name checks stay silent.
export function retiredWords(ruleText) {
  const match = String(ruleText ?? '').match(/\bretires \(([^)]{1,300})\)/);
  return match ? match[1].split(',').map((word) => word.trim()).filter((word) => word && word.length <= 20) : [];
}
const fold = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The commit count a PR description states ("2 commit", "một commit"), or null.
export function statedCommitCount(body) {
  const match = String(body ?? '').match(COMMIT_COUNT);
  if (!match) return null;
  const word = match[1].toLowerCase();
  return COUNT_WORDS[word] ?? Number(word);
}

// Repeated errors from repeated-errors.json. Facts also hold: files ([{ status, path }] this op adds), force.
export function repeatedFindings(list, facts) {
  const findings = [];
  const add = (check, values) => findings.push({ id: check.id, message: fill(check.message, values) });
  const added = facts.files.filter((file) => file.status !== 'D');
  for (const check of list) {
    if (!check.on.includes(facts.op)) continue;
    if (check.kind === 'path') {
      for (const file of added) if (check.patterns.some((pattern) => matchesPath(pattern, file.path))) add(check, { path: file.path });
    } else if (check.kind === 'new-path-non-ascii') {
      for (const file of added) if (/^[AR]/.test(file.status) && /[^\x00-\x7f]/.test(file.path)) add(check, { path: file.path });
    } else if (check.kind === 'branch-non-ascii') {
      if (/[^\x00-\x7f]/.test(facts.branch)) add(check, { branch: facts.branch });
    } else if (check.kind === 'test-plan-ticked') {
      if (!facts.pr) continue;
      const pattern = new RegExp(check.pattern, 'i');
      for (const item of tickedItems(facts.pr.body)) if (pattern.test(item)) add(check, { item });
    } else if (check.kind === 'description-commit-count') {
      const said = facts.pr ? statedCommitCount(facts.pr.body) : null;
      if (said !== null && said !== facts.commitCount) add(check, { said, real: facts.commitCount });
    } else if (check.kind === 'test-plan-unticked') {
      if (!facts.pr) continue;
      // Items that wait for CI stay unticked until CI runs (test-plan-ci-ticked blocks ticking them early): not a miss here.
      const waits = new RegExp(`^post-merge\\s*:|${check.except ?? '$^'}`, 'i');
      for (const item of testPlanItems(facts.pr.body)) if (!item.done && !waits.test(item.text)) add(check, { item: item.text });
    } else if (check.kind === 'merge-conflict-base') {
      if (facts.conflictsWithBase === true) add(check, { base: facts.base });
    } else if (check.kind === 'risk-needed') {
      if (!facts.pr) continue;
      const risk = riskSection(facts.pr.body);
      const hit = (group) => facts.files.filter((file) => file.status !== 'D' && new RegExp(group.re, 'i').test(file.path));
      const groups = check.groups.map((group) => ({ ...group, files: hit(group) })).filter((group) => group.files.length);
      if (!groups.length) continue;
      if (risk === null) add(check, { areas: groups.map((group) => group.name).join(', '), why: 'thiếu mục "## Risk"' });
      else {
        // R23.4: for a migration the Risk names the migration file (with or without extension).
        const unnamed = groups.find((group) => group.mention && !group.files.some((file) => risk.includes(file.path.split('/').pop().replace(/\.[^.]+$/, ''))));
        if (unnamed) add(check, { areas: unnamed.name, why: `"## Risk" chưa nhắc tên file ${unnamed.name}: ${unnamed.files[0].path.split('/').pop()}` });
      }
    } else if (check.kind === 'retired-word-lines' || check.kind === 'retired-word-identifiers') {
      const words = facts.retired ?? [];
      if (!words.length) continue;
      const docs = check.kind === 'retired-word-lines';
      // R19 covers decisions, cell files and docs: markdown in the decisions and cells repos, and under docs/ elsewhere.
      // Tests quote old names on purpose, so test files are never checked.
      const wholeRepo = (check.repos ?? []).includes(String(facts.repo ?? '').split('/').pop());
      const inScope = (path) =>
        !(check.skip && new RegExp(check.skip, 'i').test(path)) &&
        (docs ? /\.(md|mdx)$/i.test(path) && (wholeRepo || !check.paths || new RegExp(check.paths, 'i').test(path)) : /\.(mjs|cjs|js|jsx|ts|tsx)$/i.test(path));
      // Docs: the retired word as a whole word. Code: its ASCII form (phiếu -> phieu) as a whole identifier part.
      const forms = docs ? words : words.map(fold).filter((word) => word.length > 3);
      if (!forms.length) continue;
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${forms.map(escapeRegex).join('|')})(?![\\p{L}\\p{N}])`, docs ? 'u' : 'iu');
      for (const { path, text } of facts.addedLines ?? []) {
        if (!inScope(path)) continue;
        // A line that quotes the old name on purpose ("tên cũ: phiếu", the D-0067 table) is not new use.
        if (/tên cũ|trước là|D-0067|retired|formerly/i.test(text)) continue;
        const code = docs ? text : text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-./]/g, ' ');
        const found = code.match(pattern);
        if (found) {
          add(check, { path, word: found[1] });
          break;
        }
      }
    } else if (check.kind === 'force-push-open-pr') {
      if (facts.force && facts.pr) add(check, { pr: facts.pr.number });
    }
  }
  return findings;
}

// The deny reason Claude reads: one line per finding, so it can fix them at once.
export function blockReason(op, findings) {
  return [
    `Nếp gate blocked git ${op}: fix these, then run it again (do not bypass the check).`,
    ...findings.map((finding) => `- ${plain(finding.id)} · ${plain(finding.message)}`),
  ].join('\n');
}

// After a push that passed: tell Claude to write one line on the ticket it works on.
export function pushRecord({ repo, branch, sha, checks, blocked }) {
  [repo, branch] = [plain(repo), plain(branch)];
  const ids = [...new Set(blocked.map(plain))].join(', ');
  const before = blocked.length ? `; blocked ${blocked.length} time(s) before: ${ids}` : '';
  const beforeVi = blocked.length ? `; trước đó chặn ${blocked.length} lần: ${ids}` : '';
  const line = `push ${sha.slice(0, 7)} ${repo}@${branch}: kiểm ${checks.join(', ')}; qua${beforeVi}`;
  return (
    `Nếp gate: push of ${sha.slice(0, 7)} to ${repo} ${branch} passed the local checks (${checks.join(', ')})${before}. ` +
    `If this session works on a Nếp ticket, write one line on it now: add_follow_up kind fact, body "${line}". No ticket: skip.`
  );
}
