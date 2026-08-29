from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor missing in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    'src/simulation/liveWorldReconfigure.js',
    """  for (const hopper of previousSetup?.hoppers ?? []) {\n    if (!nextHopperIds.has(hopper.nodeId)) wasmWorld.remove_hopper_if_empty_live(hopper.nodeId);\n  }""",
    """  for (const hopper of previousSetup?.hoppers ?? []) {\n    if (nextHopperIds.has(hopper.nodeId)) continue;\n    if (resetRuntimeIds.has(hopper.nodeId)) {\n      // Reset Site is the explicit destructive exception to ordinary live-edit\n      // removal. Clear the candidate clone first, then use the same empty-only\n      // removal guard so no non-reset edit can discard retained material.\n      wasmWorld.replace_hopper_state_live(\n        hopper.nodeId,\n        hopper.capacityKg,\n        [], [], [], [], [], 0,\n      );\n    }\n    wasmWorld.remove_hopper_if_empty_live(hopper.nodeId);\n  }""",
)

replace_once(
    'src/workspace/workspaceController.js',
    """function onResetSite() {\n  const siteId = wsState.selectedSiteId;\n  if (!siteId) return;\n  clearCatalogPointerGesture();\n  const session = createSiteSession(wsState.selectedOccurrenceId, siteId);\n  wsState.siteSessions[siteId] = session;""",
    """function onResetSite() {\n  const siteId = wsState.selectedSiteId;\n  if (!siteId) return;\n  clearCatalogPointerGesture();\n  const previousNodeIds = Object.keys(wsState.siteSessions[siteId]?.blueprint?.nodes ?? {});\n  const session = createSiteSession(wsState.selectedOccurrenceId, siteId);\n  const resetNodeIds = [...new Set([\n    ...previousNodeIds,\n    ...Object.keys(session.blueprint.nodes ?? {}),\n  ])];\n  wsState.siteSessions[siteId] = session;""",
)

replace_once(
    'src/workspace/workspaceController.js',
    """  queueRuntimeReconfigure({ resetNodeIds: Object.keys(session.blueprint.nodes ?? {}) });""",
    """  queueRuntimeReconfigure({ resetNodeIds });""",
)
