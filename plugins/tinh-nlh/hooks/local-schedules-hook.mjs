// SessionStart hook of plugin nlh, schedules part (ticket eca924c5). Reads the scheduled tasks of the Claude desktop app
// on this machine (name, when, on or off; see local-schedules.mjs) and tells Claude to pass them in the first
// report_session, so Nếp knows which schedules live only on this machine and another machine can set them again when
// this one is off. Read-only, no network. Nothing found or any error: prints nothing.
import { localSchedules } from './local-schedules.mjs';

try {
  const list = localSchedules();
  if (list.length) {
    process.stdout.write(
      `Schedules that run on this machine (Claude desktop scheduled tasks; name, when, on or off only): ${JSON.stringify(list)}. ` +
        `In the first report_session call of the session pass local_schedules with exactly this JSON, so Nếp shows which schedules live only on this machine. ` +
        `If report_session rejects local_schedules, call it again without it and say nothing more. Never add a prompt, a path or a command to it.\n`,
    );
  }
} catch {
  // Nothing printed: the session starts as usual.
}
