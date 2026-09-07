#!/usr/bin/env node
/**
 * plan-lint.js — validates the plan-state JSON block embedded in PLAN.md.
 *
 * Usage:
 *   node tools/plan-lint.js <path-to-PLAN.md>
 *   node tools/plan-lint.js <path-to-PLAN.md> --json     # machine-readable report
 *
 * This is the gate for milestone M0.1 (Plan agent v1). It exists so a human
 * or an agent can run one command and get a red/green answer about whether
 * PLAN.md's machine-readable state is internally consistent, before trusting
 * it or writing back to it.
 *
 * Checks, in order:
 *
 *   1. FENCE   — exactly one ```json plan-state ... ``` fence exists and its
 *                content parses as JSON.
 *   2. SCHEMA  — required top-level keys are present with the right shape;
 *                every phase and milestone has its required fields; every
 *                milestone.status and phase.status is one of status_values.
 *   3. REFS    — every milestone.depends_on id resolves to a real milestone
 *                (no orphan depends_on); every milestone.phase resolves to a
 *                real phase; every milestone.track resolves to a real track.
 *   4. HOURS   — for each phase, the sum of its milestones' est_hours equals
 *                the phase's own hours budget. A mismatch usually means a
 *                milestone was added, dropped, or re-estimated without the
 *                phase budget being updated to match.
 *   5. ROUNDTRIP — JSON.stringify(parsed, null, 2) reproduces the fenced
 *                block byte-for-byte. This is what keeps future automated
 *                writes to PLAN.md (the plan-agent skill) honest: if every
 *                write re-serializes with the same call, `git diff` after a
 *                status change touches only the keys that actually changed
 *                — never a reformatting of the whole block. If this check
 *                fails, the block was hand-edited with different formatting
 *                (extra/missing whitespace, key order) and should be re-run
 *                through the same JSON.stringify(obj, null, 2) call before
 *                committing.
 *
 * Exit code 0 = every check passed. Exit code 1 = at least one failed; each
 * failure is printed with a short code (FENCE/SCHEMA/REFS/HOURS/ROUNDTRIP)
 * so failures are greppable from CI output.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FENCE_RE = /```json plan-state\n([\s\S]*?)\n```/g;

function fail(code, msg) {
  return { code, msg };
}

function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.includes('--json');
  const filePath = args.find((a) => !a.startsWith('--'));

  if (!filePath) {
    console.error('usage: node tools/plan-lint.js <path-to-PLAN.md> [--json]');
    process.exit(2);
  }

  const abs = path.resolve(process.cwd(), filePath);
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch (e) {
    console.error(`plan-lint: cannot read ${filePath}: ${e.message}`);
    process.exit(2);
  }

  const failures = [];
  const warnings = [];

  // --- 1. FENCE ---------------------------------------------------------
  const matches = [...text.matchAll(FENCE_RE)];
  if (matches.length === 0) {
    failures.push(fail('FENCE', 'no ```json plan-state fenced block found'));
    report(failures, warnings, jsonOut);
    return;
  }
  if (matches.length > 1) {
    failures.push(fail('FENCE', `expected exactly one plan-state fence, found ${matches.length}`));
  }
  const raw = matches[0][1];

  let state;
  try {
    state = JSON.parse(raw);
  } catch (e) {
    failures.push(fail('FENCE', `plan-state block is not valid JSON: ${e.message}`));
    report(failures, warnings, jsonOut);
    return;
  }

  // --- 2. SCHEMA ----------------------------------------------------------
  const REQUIRED_TOP = [
    'plan_version', 'name', 'owner', 'horizon', 'capacity', 'status_values',
    'tracks', 'phases', 'milestones', 'standing_rules', 'risks',
    'evidence_ledger', 'decisions', 'agent_protocol',
  ];
  for (const key of REQUIRED_TOP) {
    if (!(key in state)) failures.push(fail('SCHEMA', `missing top-level key: ${key}`));
  }

  const statusValues = new Set(Array.isArray(state.status_values) ? state.status_values : []);
  if (statusValues.size === 0) {
    failures.push(fail('SCHEMA', 'status_values is missing or empty'));
  }

  const phaseIds = new Set();
  const REQUIRED_PHASE = ['id', 'name', 'weeks', 'hours', 'objective', 'exit_criteria', 'status'];
  if (Array.isArray(state.phases)) {
    for (const [i, ph] of state.phases.entries()) {
      for (const key of REQUIRED_PHASE) {
        if (!(key in ph)) failures.push(fail('SCHEMA', `phases[${i}] (${ph.id || '?'}) missing key: ${key}`));
      }
      if (typeof ph.hours !== 'number') {
        failures.push(fail('SCHEMA', `phases[${i}] (${ph.id || '?'}) hours must be a number`));
      }
      if (ph.status && !statusValues.has(ph.status)) {
        failures.push(fail('SCHEMA', `phases[${i}] (${ph.id}) has invalid status: ${ph.status}`));
      }
      if (ph.id) {
        if (phaseIds.has(ph.id)) failures.push(fail('SCHEMA', `duplicate phase id: ${ph.id}`));
        phaseIds.add(ph.id);
      }
    }
  } else {
    failures.push(fail('SCHEMA', 'phases must be an array'));
  }

  const trackIds = new Set((Array.isArray(state.tracks) ? state.tracks : []).map((t) => t.id));

  const milestoneIds = new Set();
  const REQUIRED_MILESTONE = [
    'id', 'track', 'phase', 'name', 'deliverable', 'outputs', 'gate',
    'depends_on', 'est_hours', 'actual_hours', 'status', 'evidence',
  ];
  if (Array.isArray(state.milestones)) {
    for (const [i, m] of state.milestones.entries()) {
      const tag = m.id || `#${i}`;
      for (const key of REQUIRED_MILESTONE) {
        if (!(key in m)) failures.push(fail('SCHEMA', `milestones[${tag}] missing key: ${key}`));
      }
      if (typeof m.est_hours !== 'number') {
        failures.push(fail('SCHEMA', `milestones[${tag}] est_hours must be a number`));
      }
      if (typeof m.actual_hours !== 'number') {
        failures.push(fail('SCHEMA', `milestones[${tag}] actual_hours must be a number`));
      }
      if (!Array.isArray(m.outputs)) {
        failures.push(fail('SCHEMA', `milestones[${tag}] outputs must be an array`));
      }
      if (!Array.isArray(m.depends_on)) {
        failures.push(fail('SCHEMA', `milestones[${tag}] depends_on must be an array`));
      }
      if (!Array.isArray(m.evidence)) {
        failures.push(fail('SCHEMA', `milestones[${tag}] evidence must be an array`));
      }
      if (m.gate) {
        if (!('kind' in m.gate)) failures.push(fail('SCHEMA', `milestones[${tag}] gate missing kind`));
        if (m.gate.kind === 'review' && m.gate.cmd !== null) {
          failures.push(fail('SCHEMA', `milestones[${tag}] gate.kind is "review" but gate.cmd is not null`));
        }
        if (m.gate.kind === 'cmd' && !m.gate.cmd) {
          failures.push(fail('SCHEMA', `milestones[${tag}] gate.kind is "cmd" but gate.cmd is empty`));
        }
      } else {
        failures.push(fail('SCHEMA', `milestones[${tag}] missing gate`));
      }
      if (m.status && !statusValues.has(m.status)) {
        failures.push(fail('SCHEMA', `milestones[${tag}] has invalid status: ${m.status}`));
      }
      if (m.status === 'done' && m.gate && m.gate.kind === 'review') {
        const hasApproval = m.evidence && m.evidence.some((e) => typeof e === 'string' && /approved|reviewer|signed off/i.test(e));
        if (!hasApproval) {
          warnings.push(`milestones[${tag}] is "done" with a review gate but no approver/date found in evidence (gate discipline requires a recorded approver and date for review gates)`);
        }
      }
      if (m.id) {
        if (milestoneIds.has(m.id)) failures.push(fail('SCHEMA', `duplicate milestone id: ${m.id}`));
        milestoneIds.add(m.id);
      }
    }
  } else {
    failures.push(fail('SCHEMA', 'milestones must be an array'));
  }

  // --- 3. REFS --------------------------------------------------------------
  if (Array.isArray(state.milestones)) {
    for (const m of state.milestones) {
      const tag = m.id || '?';
      for (const dep of m.depends_on || []) {
        if (!milestoneIds.has(dep)) {
          failures.push(fail('REFS', `milestones[${tag}] depends_on references unknown milestone: ${dep}`));
        }
      }
      if (m.phase && !phaseIds.has(m.phase)) {
        failures.push(fail('REFS', `milestones[${tag}] phase references unknown phase: ${m.phase}`));
      }
      if (m.track && !trackIds.has(m.track)) {
        failures.push(fail('REFS', `milestones[${tag}] track references unknown track: ${m.track}`));
      }
    }
  }

  // --- 4. HOURS ---------------------------------------------------------
  if (Array.isArray(state.phases) && Array.isArray(state.milestones)) {
    const sumByPhase = {};
    for (const m of state.milestones) {
      if (m.status === 'dropped') continue; // dropped work doesn't count against budget
      if (!m.phase) continue;
      sumByPhase[m.phase] = (sumByPhase[m.phase] || 0) + (Number(m.est_hours) || 0);
    }
    for (const ph of state.phases) {
      const sum = sumByPhase[ph.id] || 0;
      if (sum !== ph.hours) {
        failures.push(fail(
          'HOURS',
          `phase ${ph.id}: milestone est_hours sum to ${sum}, phase budget says ${ph.hours}`,
        ));
      }
    }
  }

  // --- 5. ROUNDTRIP -------------------------------------------------------
  const reserialized = JSON.stringify(state, null, 2);
  if (reserialized !== raw) {
    failures.push(fail(
      'ROUNDTRIP',
      'JSON.stringify(state, null, 2) does not byte-match the fenced block — ' +
      're-run the block through the same serialization before committing, so future ' +
      'automated diffs touch only the keys that changed',
    ));
  }

  report(failures, warnings, jsonOut);
}

function report(failures, warnings, jsonOut) {
  if (jsonOut) {
    console.log(JSON.stringify({ ok: failures.length === 0, failures, warnings }, null, 2));
  } else {
    for (const w of warnings) console.warn(`WARN  ${w}`);
    for (const f of failures) console.error(`FAIL  [${f.code}] ${f.msg}`);
    if (failures.length === 0) {
      console.log(`plan-lint: OK${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : ''}`);
    } else {
      console.error(`plan-lint: ${failures.length} failure${failures.length === 1 ? '' : 's'}`);
    }
  }
  process.exit(failures.length === 0 ? 0 : 1);
}

main();
