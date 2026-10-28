// SessionStart hook of plugin nlh, machine part (D-0065 · 5/5). Reads this machine's random id (speaker.mjs machineId,
// ~/.tinh-nlh/machine-id), makes it once when missing, and tells Claude to pass it in report_session, so the hub ties
// this session's connection to the machine and my_work shows the work of the villagers (dân làng) the machine sits in.
// Also tells Claude when to write a handoff before stopping. No network; the files are the machine id and this plugin's plugin.json (its version goes in report_session as plugin_version).
import { machineId, pluginVersion, takeLoaError } from '../speaker/speaker.mjs';

const id = machineId(process.env.NLH_MACHINE_DIR || undefined);
const version = pluginVersion();
// The time zone of this computer, so Claude says the UTC times of Nếp's tools as the user says them.
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const offset = -new Date().getTimezoneOffset() / 60;
// Loa stopped on this machine and nobody saw it (it runs with no window): say one sentence, and report it to the CTO cell.
const failed = takeLoaError(process.env.NLH_TOWER_DIR || undefined);
if (failed) {
  process.stdout.write(
    `Loa (the speaker that tells this user about new work) could not start on this machine${failed.at ? ` at ${failed.at}` : ''}: "${failed.reason}". ` +
      `After doing what the user asked, say exactly one sentence: "Loa gặp trục trặc nên chưa tự báo việc mới được. Nếp đã báo kỹ thuật và sẽ tự thử lại." ` +
      `No technical words and no instruction for the user. Then open one ticket with open_ticket for cell dai-dien-kien-truc-son, ` +
      `title "Loa không chạy trên một máy", need: the reason above${id ? ` and machine id ${id}` : ''}, nothing else.\n`,
  );
}
if (id) {
  process.stdout.write(
    `This machine: id ${id} (random, made once on this machine). Pass machine_id ${id} in every report_session call. ` +
      (version ? `Also pass plugin_version ${version} (this plugin's version) in the same call, nothing else about the plugin. ` : '') +
      `In the first turn, right after my_context, call report_session once with this session's id, machine_id ${id} and status started, ` +
      `so Nếp sends this machine the work of the villagers it sits in; the user picks them in Nếp (Máy của tôi), Loa is not needed for that. ` +
      `Before this session stops while it holds a ticket (the user says they stop or switch machine, Claude Code warns the usage limit is near, ` +
      `or the machine is about to turn off): write a handoff on that ticket first, the /nlh:handoff way. If the reason is the usage limit or the ` +
      `machine turning off, then also call report_session with machine_id ${id} and machine_stop quota or shutdown, so another machine sitting in ` +
      `the same villager carries on at once.\n`,
  );
}
if (zone) {
  process.stdout.write(
    `Time zone of this machine: ${zone} (UTC${offset >= 0 ? '+' : '-'}${Math.abs(offset)}). Nếp's tools give times in UTC: tell the user a time in this zone, as a person says it ("lúc 8 giờ tối"), never the word UTC.\n`,
  );
}
