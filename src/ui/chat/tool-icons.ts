import type { ComponentType } from 'react';
import {
  IconAgentPresetOutlineRegular,
  IconAlarmClockOutlineRegular,
  IconApiOutlineRegular,
  IconChecklistOutlineRegular,
  IconCompactOutlineRegular,
  IconCordisPluginOutlineRegular,
  IconDatabaseOutlineRegular,
  IconDeliverDocRegular,
  IconEditOutlineRegular,
  IconFlatListOutlineRegular,
  IconFolderOpenOutlineRegular,
  IconGaugeOutlineRegular,
  IconGlobeOutlineRegular,
  IconListPenOutlineRegular,
  IconPaperclipOutlineRegular,
  IconQueueOutlineRegular,
  IconSearchOutlineRegular,
  IconSkillOutlineRegular,
  IconSparkleRegular,
} from '../icons/index';
import type { IconProps } from '../icons/props';

// meka 0.68.0: src/tools/registry.rs::BUILTIN_TOOL_NAMES, mapped to the dsh glyph
// set (mekaweb's lucide mapping with the nearest dsh icon for each family). An
// entry ending in `_` covers every tool named with that prefix. MCP server tools
// are named `mcp__{server}__{tool}`, so they share the `mcp_` prefix.
const toolIcons: Readonly<Record<string, ComponentType<IconProps>>> = {
  agent_: IconAgentPresetOutlineRegular,
  context_check: IconGaugeOutlineRegular,
  context_compact: IconCompactOutlineRegular,
  context_replace: IconCompactOutlineRegular,
  conversation_: IconFlatListOutlineRegular,
  file_edit: IconEditOutlineRegular,
  file_find: IconFolderOpenOutlineRegular,
  file_read: IconDeliverDocRegular,
  file_search: IconSearchOutlineRegular,
  file_write: IconEditOutlineRegular,
  image_render: IconPaperclipOutlineRegular,
  mcp_: IconCordisPluginOutlineRegular,
  memory_: IconDatabaseOutlineRegular,
  schedule_: IconAlarmClockOutlineRegular,
  scratchpad_: IconListPenOutlineRegular,
  shell_execute: IconApiOutlineRegular,
  skill_: IconSkillOutlineRegular,
  task_: IconQueueOutlineRegular,
  todo_: IconChecklistOutlineRegular,
  tool_: IconSparkleRegular,
  web_fetch: IconGlobeOutlineRegular,
  web_search: IconGlobeOutlineRegular,
  // The supported 0.59 API uses these older names.
  edit_file: IconEditOutlineRegular,
  execute_command: IconApiOutlineRegular,
  fetch_url: IconGlobeOutlineRegular,
  find_files: IconFolderOpenOutlineRegular,
  load_tool: IconSparkleRegular,
  read_file: IconDeliverDocRegular,
  render_image: IconPaperclipOutlineRegular,
  search_contents: IconSearchOutlineRegular,
  write_file: IconEditOutlineRegular,
};

/** The tool's own entry in `toolIcons`, else its family's, else the generic tool glyph. */
export function toolIcon(name: string): ComponentType<IconProps> {
  const prefix = name.slice(0, name.indexOf('_') + 1);
  const key = [name, prefix].find((candidate) => Object.hasOwn(toolIcons, candidate));
  return (key ? toolIcons[key] : undefined) ?? IconSparkleRegular;
}
