// SessionStart hook of plugin nlh, machine part (D-0065 · 5/5). Reads this machine's random id (speaker.mjs machineId,
// ~/.tinh-nlh/machine-id), makes it once when missing, and tells Claude to pass it in report_session, so the hub ties
// this session's connection to the machine and my_work shows the work of the villagers (dân làng) the machine sits in.
// Also tells Claude when to write a handoff before stopping. No network; the files are the machine id and this plugin's plugin.json (its version goes in report_session as plugin_version).
import { machineId, pluginVersion } from '../speaker/speaker.mjs';

const id = machineId(process.env.NLH_MACHINE_DIR || undefined);
const version = pluginVersion();
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
