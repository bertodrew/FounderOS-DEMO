/**
 * Push this deployment's configuration into Doppler.
 *
 * Dry run by default: it prints what it WOULD upload, with every value masked,
 * so you can see the plan before anything leaves the machine.
 *
 *   npm run doppler:sync                     # show the plan, upload nothing
 *   npm run doppler:sync -- --apply          # upload to the prd config
 *   npm run doppler:sync -- --apply --config dev
 *   npm run doppler:sync -- --out plan.json  # write the payload, upload nothing
 *
 * Values are passed to Doppler through a 0600 temp file, never as command
 * arguments, so they never appear in the process list or your shell history.
 * The file is removed in a finally block whether the upload succeeds or not.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildSecretPlan, REQUIRED_KEYS } from '../lib/doppler-plan';
import { runtimeEnv } from '../lib/creds';

const run = promisify(execFile);

const DEFAULT_PROJECT = 'founder-dashboard';

type Options = { apply: boolean; project: string; config: string; out?: string };

function parseArgs(argv: string[]): Options {
  const valueFor = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    apply: argv.includes('--apply'),
    project: valueFor('--project') ?? DEFAULT_PROJECT,
    config: valueFor('--config') ?? 'prd',
    out: valueFor('--out'),
  };
}

async function dopplerVersion(): Promise<string | null> {
  try {
    const { stdout } = await run('doppler', ['--version']);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const plan = buildSecretPlan({
    available: runtimeEnv(),
    sourceLabel: 'process.env + .env.local',
    generate: (bytes) => randomBytes(bytes).toString('hex'),
  });

  const width = Math.max(...plan.entries.map((e) => e.name.length), 24);
  console.log(`\nDoppler plan · project ${opts.project} · config ${opts.config}\n`);
  for (const entry of plan.entries) {
    const source = entry.source === 'generated' ? 'generated (new)' : entry.source;
    console.log(`  ${entry.name.padEnd(width)}  ${entry.masked.padEnd(10)}  ${source}`);
  }

  if (plan.missing.length > 0) {
    console.log(`\n  Not set anywhere — supply these yourself, nothing is invented for you:`);
    for (const name of plan.missing) {
      const meta = REQUIRED_KEYS.find((k) => k.name === name);
      const flag = plan.missingRequired.includes(name) ? ' [required for production]' : '';
      console.log(`    ${name.padEnd(width)}  ${meta?.description ?? ''}${flag}`);
    }
  }

  console.log(
    `\n  ${plan.entries.length} value${plan.entries.length === 1 ? '' : 's'} ready · ` +
      `${plan.missing.length} missing · ${plan.missingRequired.length} of those block production\n`,
  );

  if (opts.out) {
    writeFileSync(opts.out, JSON.stringify(plan.payload, null, 2), { mode: 0o600 });
    console.log(`  Payload written to ${opts.out} (0600). Delete it once uploaded.\n`);
    return;
  }

  if (!opts.apply) {
    console.log('  Dry run. Nothing was uploaded. Re-run with --apply to push to Doppler.\n');
    return;
  }

  const version = await dopplerVersion();
  if (!version) {
    console.error(
      '  doppler CLI not found on PATH. Install it (https://docs.doppler.com/docs/install-cli),\n' +
        '  run `doppler login`, then re-run this with --apply.\n',
    );
    process.exitCode = 1;
    return;
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'doppler-sync-'));
  const file = path.join(dir, 'secrets.json');
  try {
    writeFileSync(file, JSON.stringify(plan.payload), { mode: 0o600 });
    await run('doppler', [
      'secrets', 'upload', file,
      '--project', opts.project,
      '--config', opts.config,
    ]);
    console.log(`  Uploaded ${plan.entries.length} secrets to ${opts.project}/${opts.config}.\n`);
  } catch {
    // Doppler echoes the failing key name but not its value; still, keep the
    // raw stderr off the log rather than risk it.
    console.error(`  Upload failed. Check \`doppler setup\` for ${opts.project}/${opts.config}.`);
    process.exitCode = 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
