import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const git = (args, options = {}) =>
  execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024, ...options });
const text = (args, options = {}) => git(args, options).toString('utf8');
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
  ['api-secret-key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['jwt-token', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b/g],
  ['database-credentials', /postgres(?:ql)?:\/\/[^\s'"`]+:[^\s'"`]+@[^\s'"`]+/g],
  [
    'literal-secret',
    /(?:api[_-]?key|client[_-]?secret|service[_-]?role|password|auth[_-]?token)\s*[:=]\s*['"]([^'"\r\n]{8,})['"]/gi,
  ],
];
const privatePath =
  /(?:^|\/)(?:data|backups|exports)\/|(?:^|\/)\.env(?:\.|$)|\.(?:xlsx|xls|csv|tsv|fsbackup|dump|sqlite3?|db|pem|key)$/i;
const fixturePath = /(?:^|\/)(?:test|tests)\/|^frontend\/scripts\/check-privacy\.mjs$/;
const fixturePasswords = new Set([
  'test-password-123',
  'correct-password',
  'wrong-password',
  'new-test-password',
  'another-test-password',
]);

function scan(path, buffer) {
  const findings = [];
  const example = /(?:^|\/)\.env\.(?:example|sample)$/.test(path);
  if (privatePath.test(path) && !example) {
    findings.push({ path, rule: 'private-artifact' });
  }
  const content = buffer.toString('utf8');
  for (const [rule, pattern] of patterns) {
    for (const match of content.matchAll(pattern)) {
      const placeholder =
        rule === 'database-credentials' &&
        /^postgres(?:ql)?:\/\/user:password@localhost(?::\d+)?\//.test(match[0]);
      const fixture =
        rule === 'literal-secret' && fixturePath.test(path) && fixturePasswords.has(match[1]);
      const translatedFieldLabel =
        rule === 'literal-secret' &&
        path === 'backend/src/common/validation-message.ts' &&
        match[1] === 'Password';
      if (!placeholder && !fixture && !translatedFieldLabel) {
        findings.push({ path, rule, line: content.slice(0, match.index).split('\n').length });
      }
    }
  }
  return findings;
}

const paths = [
  ...new Set(
    text(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
      .split('\0')
      .filter(Boolean),
  ),
].filter((path) => existsSync(path));
const workingFindings = paths.flatMap((path) => scan(path, readFileSync(path)));
const objects = text(['rev-list', '--objects', '--all'])
  .trim()
  .split('\n')
  .map((line) => {
    const separator = line.indexOf(' ');
    return {
      id: separator < 0 ? line : line.slice(0, separator),
      path: separator < 0 ? '' : line.slice(separator + 1),
    };
  });
const metadata = text(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {
  input: objects.map((object) => object.id).join('\n') + '\n',
});
const types = new Map(
  metadata
    .trim()
    .split('\n')
    .map((line) => {
      const [id, type] = line.split(' ');
      return [id, type];
    }),
);
const historyFindings = [];
let blobsChecked = 0;
let localPathReferences = 0;
for (const object of objects) {
  if (types.get(object.id) === 'blob') {
    const content = git(['cat-file', 'blob', object.id]);
    blobsChecked++;
    historyFindings.push(
      ...scan(object.path, content).map((finding) => ({
        ...finding,
        object: object.id.slice(0, 12),
      })),
    );
    if (/[A-Z]:[\\/](?:Users|Documents and Settings)[\\/]/i.test(content.toString('utf8'))) {
      localPathReferences++;
    }
  }
}
const authorEmails = new Set(
  text(['log', '--all', '--format=%ae%n%ce'])
    .trim()
    .split('\n')
    .filter((email) => email && !/@users\.noreply\.github\.com$/i.test(email)),
);
const privateExamples = [
  'backend/.env',
  'backend/.env.production',
  'frontend/.env.production',
  'backend/data/postgres/PG_VERSION',
  'data/postgres/PG_VERSION',
  'backups/check.fsbackup',
  'exports/check.csv',
];
const ignoreChecks = privateExamples.map((path) => {
  let ignored = false;
  try {
    git(['check-ignore', '-q', path]);
    ignored = true;
  } catch {
    ignored = false;
  }
  return { path, ignored };
});
console.log(
  JSON.stringify(
    {
      workingTree: { filesChecked: paths.length, findings: workingFindings },
      history: {
        commits: Number(text(['rev-list', '--count', '--all']).trim()),
        blobsChecked,
        findings: historyFindings,
        localPathReferences,
      },
      gitMetadata: { nonNoreplyAuthorEmailCount: authorEmails.size },
      ignoreChecks,
      limitation:
        'Pattern-based review: a clean result is not a guarantee that arbitrary sensitive information is absent.',
    },
    null,
    2,
  ),
);
if (
  blobsChecked === 0 ||
  workingFindings.length ||
  historyFindings.length ||
  ignoreChecks.some((check) => !check.ignored)
) {
  process.exitCode = 1;
}
