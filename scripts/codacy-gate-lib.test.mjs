import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { addedLinesFromDiff, biomeGateFailures, eslintGateFailures } from './codacy-gate-lib.mjs'
import { isAuditedRustUnsafe, sarifGateFailures, scannerOutputFailures, scannerProcessFailures } from './codacy-sarif.mjs'

test('reports findings only on added lines', () => {
  const root = '/repo'
  const additions = addedLinesFromDiff([
    '+++ b/src/example.ts',
    '@@ -2,2 +2,3 @@',
    ' unchanged',
    '+new issue',
    ' existing issue',
  ].join('\n'), root)
  const sarif = { runs: [{
    tool: { driver: { name: 'Example' } },
    results: [3, 4].map((line) => ({
      locations: [{ physicalLocation: { artifactLocation: { uri: 'src/example.ts' }, region: { startLine: line } } }],
      message: { text: `line ${line}` },
      ruleId: 'rule',
    })),
  }] }

  assert.deepEqual(sarifGateFailures(sarif, additions, root).map((failure) => failure.line), [3])
})

test('fails closed when a scanner does not complete', () => {
  const failures = sarifGateFailures({ runs: [{
    invocations: [{ executionSuccessful: false }],
    tool: { driver: { name: 'Broken scanner' } },
  }] }, new Map())

  assert.equal(failures[0]?.message, 'Broken scanner did not complete successfully')
})

test('fails closed when the legacy CLI returns an empty merged report', () => {
  assert.equal(sarifGateFailures({ version: '2.1.0', runs: [] }, new Map()).length, 1)
})

test('fails closed when a wrapper swallows its scanner SIGTERM', () => {
  const wrapper = spawnSync(process.execPath, ['-e', `
    const { spawnSync } = require('node:child_process')
    const scanner = spawnSync(process.execPath, ['-e', 'process.kill(process.pid, "SIGTERM")'])
    if (scanner.signal !== 'SIGTERM') process.exit(2)
    console.error('Tool failed to run: failed to run Trivy: signal: terminated')
    console.log(JSON.stringify({ version: '2.1.0', runs: [] }))
  `], { encoding: 'utf8', timeout: 5000 })

  assert.equal(wrapper.status, 0)
  assert.match(wrapper.stderr, /signal: terminated/u)
  assert.equal(scannerProcessFailures(wrapper, 'trivy').length, 1)
  assert.equal(scannerOutputFailures(wrapper, new Map(), '', 'trivy').length, 1)
  assert.equal(sarifGateFailures(JSON.parse(wrapper.stdout), new Map()).length, 1)
})

test('a success-shaped report cannot hide the scanner failure diagnostic', () => {
  const stdout = JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'Trivy' } }, results: [] }] })
  const result = { status: 0, stdout, stderr: 'Tool failed to run: context deadline exceeded' }
  assert.equal(scannerProcessFailures(result, 'trivy').length, 1)
  assert.equal(scannerOutputFailures(result, new Map(), '', 'trivy').length, 1)
})

test('rejects missing, truncated and malformed structured scanner output', () => {
  for (const stdout of [undefined, '', '{"runs":', 'null', '{}', '{"runs":[]}']) {
    assert.equal(scannerOutputFailures({ status: 0, stdout }, new Map(), '', 'trivy').length, 1)
  }
})

test('accepts complete structured output from each expected scanner', () => {
  for (const [tool, name] of [['trivy', 'Trivy'], ['opengrep', 'Opengrep OSS']]) {
    const stdout = JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name } }, results: [] }] })
    assert.deepEqual(scannerOutputFailures({ status: 0, stdout }, new Map(), '', tool), [])
  }
})

test('rejects nonzero, signaled, timed-out and failed-to-spawn processes', () => {
  for (const result of [{ status: 1 }, { status: 0, signal: 'SIGTERM' },
    { status: null, error: { code: 'ETIMEDOUT' } }, { status: null, error: { code: 'ENOENT' } }]) {
    assert.equal(scannerProcessFailures(result, 'trivy').length, 1)
  }
  assert.deepEqual(scannerProcessFailures({ status: 0, stderr: 'INFO scanning enabled' }, 'trivy'), [])
})

test('requires the expected scanner and its complete results array', () => {
  const run = { tool: { driver: { name: 'Trivy' } }, results: [] }
  const report = { version: '2.1.0', runs: [run] }
  assert.deepEqual(sarifGateFailures(report, new Map(), '', 'trivy'), [])
  assert.equal(sarifGateFailures(report, new Map(), '', 'opengrep').length, 1)
  assert.equal(sarifGateFailures({ ...report, runs: [run, run] }, new Map(), '', 'trivy').length, 1)
  assert.equal(sarifGateFailures({ ...report, version: 'wrong' }, new Map(), '', 'trivy').length, 1)
  assert.equal(sarifGateFailures({ runs: [{}] }, new Map()).length, 1)
  for (const partial of [null, {}, { runs: null }, { runs: [null] }]) {
    assert.equal(sarifGateFailures(partial, new Map()).length, 1)
  }
})

test('rejects errors in successful-looking SARIF invocations', () => {
  for (const invocation of [{}, { executionSuccessful: true, exitCode: 2 },
    { executionSuccessful: true, toolExecutionNotifications: [{ level: 'error' }] }]) {
    assert.equal(sarifGateFailures({ runs: [{ invocations: [invocation], results: [] }] }, new Map()).length, 1)
  }
})

test('recognizes only explicitly audited Rust unsafe findings', () => {
  const additions = addedLinesFromDiff([
    '+++ b/src/example.rs',
    '@@ -0,0 +1,2 @@',
    '+// SAFETY: callback pointer is non-null.',
    '+let event = unsafe { pointer.as_ref() };',
  ].join('\n'), '/repo')
  const finding = {
    line: 2,
    path: '/repo/src/example.rs',
    rule: 'codacy.tools-configs.rust.lang.security.unsafe-usage.unsafe-usage',
  }

  assert.equal(isAuditedRustUnsafe(finding, additions), true)
  assert.equal(isAuditedRustUnsafe({ ...finding, line: 1 }, additions), false)
  assert.equal(isAuditedRustUnsafe({ ...finding, rule: 'different-rule' }, additions), false)
})

test('reports Biome diagnostics on added lines at every severity', () => {
  const additions = new Map([['/repo/src/example.ts', new Set([7])]])
  const report = { diagnostics: [{
    category: 'lint/style/example',
    location: { path: 'src/example.ts', start: { line: 7 } },
    message: 'minor issue',
    severity: 'info',
  }] }

  assert.equal(biomeGateFailures(report, additions, '/repo').length, 1)
})

test('reports security ESLint findings only on added lines at every severity', () => {
  const additions = new Map([['/repo/src/example.ts', new Set([7])]])
  const report = [{ filePath: '/repo/src/example.ts', messages: [
    { line: 6, message: 'existing issue', ruleId: 'security/existing', severity: 2 },
    { line: 7, message: 'new warning', ruleId: 'security/new', severity: 1 },
  ] }]

  assert.deepEqual(eslintGateFailures(report, additions), [{
    line: 7,
    message: 'new warning',
    path: '/repo/src/example.ts',
    rule: 'security/new',
    tool: 'Codacy ESLint security rules',
  }])
})
