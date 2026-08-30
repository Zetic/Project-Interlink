from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
p = ROOT / 'tests/packedWorldRuntimeCompiler.test.js'
text = p.read_text()

# The original equal-phase fixture used the pre-cutover generic target field on
# staged Jaw Crushers. Keep the ordering assertion but use the canonical field.
text = text.replace("targetParticleSizeMm: 120, throughputKgPerSecond: 8, ratedPowerKw: 8, enabled: true,", "jawProductSizeMm: 120, throughputKgPerSecond: 8, ratedPowerKw: 8, enabled: true,")

# Remove the brittle first-pass append if it exists; replace it with a fixture
# built from the helpers already owned by this test module.
text = re.sub(
    r"\n\ntest\('staged comminution uses each apparatus canonical product-size field'.*?\n\}\);\n?$",
    "",
    text,
    flags=re.S,
)

text += r'''

test('staged comminution compiler uses each apparatus canonical product-size field', () => {
  const world = simpleWorld();
  const blueprint = world.simulation.sessions['site-a'];
  blueprint.nodes = {
    source: blueprint.nodes.source,
    jaw: {
      id: 'jaw', nodeType: 'jawCrusher', inputPortId: 'feed', outputPortId: 'product',
      jawProductSizeMm: 120, throughputKgPerSecond: 8, ratedPowerKw: 8, enabled: false,
    },
    cone: {
      id: 'cone', nodeType: 'coneCrusher', inputPortId: 'feed', outputPortId: 'product',
      coneProductSizeMm: 25, throughputKgPerSecond: 5, ratedPowerKw: 10, enabled: false,
    },
    mill: {
      id: 'mill', nodeType: 'ballMill', inputPortId: 'feed', outputPortId: 'product',
      millProductSizeMm: 0.25, throughputKgPerSecond: 2, ratedPowerKw: 75, enabled: false,
    },
    target: blueprint.nodes.target,
  };
  blueprint.connections = {};

  const compiled = compilePackedWorldRuntime(world);
  const byCanonicalId = new Map(
    compiled.machines
      .filter(machine => machine.kind === 'comminution')
      .map(machine => [compiled.runtimeIds.nodeIds.valueFor(machine.nodeId), machine]),
  );

  assert.equal(byCanonicalId.get('jaw').targetParticleSizeMm, 120);
  assert.equal(byCanonicalId.get('cone').targetParticleSizeMm, 25);
  assert.equal(byCanonicalId.get('mill').targetParticleSizeMm, 0.25);
  assert.notEqual(byCanonicalId.get('jaw').targetSizeId, PACKED_NO_RUNTIME_ID);
  assert.notEqual(byCanonicalId.get('cone').targetSizeId, PACKED_NO_RUNTIME_ID);
  assert.notEqual(byCanonicalId.get('mill').targetSizeId, PACKED_NO_RUNTIME_ID);
});
'''

p.write_text(text.rstrip() + '\n')
print('PR61 compiler regression fixture fixed')
