from pathlib import Path

world_test = Path('tests/mapWorldModel.test.js')
text = world_test.read_text()
old = """      kind: 'resource-access',
      label: 'resources',
"""
new = """      kind: 'resource-access',
      medium: 'resource',
      label: 'resources',
"""
if old not in text:
    raise SystemExit('resource-access expectation not found')
world_test.write_text(text.replace(old, new, 1))

phase4_test = Path('tests/phase4Graph.test.js')
text = phase4_test.read_text()
old = """  assert.match(renderer, /from '.\\/camera\\/mapCamera\\.js'/); assert.match(renderer, /from '.\\/rendering\\/mechanicalRenderer\\.js'/); assert.doesNotMatch(renderer, /APPARATUS_DEFINITIONS\\s*=|workspaceController/);
"""
new = """  assert.match(renderer, /camera\\/mapCamera/); assert.match(renderer, /rendering\\/mechanicalRenderer/); assert.doesNotMatch(renderer, /APPARATUS_DEFINITIONS\\s*=|workspaceController/);
"""
if old not in text:
    raise SystemExit('architecture assertion not found')
phase4_test.write_text(text.replace(old, new, 1))

renderer = Path('src/map/mapRenderer.ts')
text = renderer.read_text()
old = """  svg.addEventListener('click', event => {
    const state = store.getState(); const planet = state.world?.planet; if (!planet) return;
"""
new = """  svg.addEventListener('click', event => {
    if (suppressClick) { event.preventDefault(); event.stopPropagation(); return; }
    const state = store.getState(); const planet = state.world?.planet; if (!planet) return;
"""
if old not in text:
    raise SystemExit('map click handler not found')
renderer.write_text(text.replace(old, new, 1))
