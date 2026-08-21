import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderFeatureResources } from '../src/workspace/inspector/featureInspectorUI.js';

test('feature resource markup separates description, engineering properties, and mineral texture', () => {
  const html = renderFeatureResources({
    resources: [{
      name: 'Iron Ore',
      availabilityClass: 'Abundant',
      descriptor: 'Mixed oxide',
      occurrenceProperties: [
        { id: 'bond-cwi', label: 'Bond Crushing Work Index', value: 10.81, unit: 'kWh/t' },
        { id: 'bond-bwi', label: 'Bond Ball Mill Work Index', value: 14.24, unit: 'kWh/t' },
        { id: 'bond-ai', label: 'Bond Abrasion Index', value: 0.281, unit: '' },
        { id: 'mineral-density', label: 'Mineral mixture density', value: 3989.2, unit: 'kg/m³' },
      ],
      mineralTextures: [{
        speciesId: 'hematite',
        label: 'Hematite',
        grainSizeUm: { d10: 24.7, d50: 50.3, d90: 110.9 },
        occurrenceModes: { free: 0.30, boundary: 0.24, intergrown: 0.33, included: 0.14 },
      }],
    }],
  });

  assert.match(html, /Iron Ore/);
  assert.match(html, /Mixed oxide/);
  assert.match(html, /Bond Crushing Work Index/);
  assert.match(html, /10\.81 kWh\/t/);
  assert.match(html, /0\.281/);
  assert.match(html, /3,989 kg\/m³/);
  assert.match(html, /D10 \/ D50 \/ D90/);
  assert.match(html, /24\.7 \/ 50\.3 \/ 110\.9 µm/);
  assert.match(html, /Free<\/span> 30%/);
  assert.match(html, /Included<\/span> 14%/);
  assert.doesNotMatch(html, /texture-/);
});

test('feature resource markup escapes occurrence-provided text', () => {
  const html = renderFeatureResources({
    resources: [{
      name: '<script>bad()</script>',
      availabilityClass: 'Abundant',
      descriptor: '<img src=x onerror=bad()>',
      occurrenceProperties: [],
      mineralTextures: [],
    }],
  });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;script&gt;/);
});
