import { escHtml } from '../shell/utils.js';

function formatPropertyValue(property) {
  if (property?.id === 'mineral-density') {
    return `${Math.round(property.value).toLocaleString('en-US')} ${property.unit}`;
  }
  const decimals = property?.id === 'bond-ai' ? 3 : 2;
  const value = Number(property?.value);
  const formatted = Number.isFinite(value) ? value.toFixed(decimals) : String(property?.value ?? '—');
  return `${formatted}${property?.unit ? ` ${property.unit}` : ''}`;
}

function occurrencePropertyRows(properties = []) {
  if (!properties.length) return '';
  return `<div class="ws-ins-resource-subsection"><div class="ws-ins-resource-subtitle">Engineering</div><div class="ws-ins-property-list">${properties.map(property => `<div class="ws-ins-property-row"><span>${escHtml(property.label)}</span><span class="ws-ins-property-value">${escHtml(formatPropertyValue(property))}</span></div>`).join('')}</div></div>`;
}

function textureModePair(labelA, valueA, labelB, valueB) {
  return `<div><span>${labelA}</span> ${(valueA * 100).toFixed(0)}% <span>· ${labelB}</span> ${(valueB * 100).toFixed(0)}%</div>`;
}

function mineralTextureBlock(texture) {
  const { d10, d50, d90 } = texture.grainSizeUm ?? {};
  const modes = texture.occurrenceModes ?? {};
  return `<div class="ws-ins-mineral"><div class="ws-ins-mineral-name">${escHtml(texture.label ?? texture.speciesId)}</div><div class="ws-ins-mineral-grains"><span>D10 / D50 / D90</span><strong>${escHtml(`${d10} / ${d50} / ${d90} µm`)}</strong></div><div class="ws-ins-mineral-modes">${textureModePair('Free', modes.free ?? 0, 'Boundary', modes.boundary ?? 0)}${textureModePair('Intergrown', modes.intergrown ?? 0, 'Included', modes.included ?? 0)}</div></div>`;
}

function mineralTextureSection(textures = []) {
  if (!textures.length) return '';
  return `<div class="ws-ins-resource-subsection"><div class="ws-ins-resource-subtitle">Mineral texture</div>${textures.map(mineralTextureBlock).join('')}</div>`;
}

function resourceCard(resource) {
  return `<div class="ws-ins-resource"><div class="ws-ins-resource-header"><strong>${escHtml(resource.name)}</strong><span>${escHtml(resource.availabilityClass)}</span></div>${resource.descriptor ? `<div class="ws-ins-resource-note">${escHtml(resource.descriptor)}</div>` : ''}${occurrencePropertyRows(resource.occurrenceProperties)}${mineralTextureSection(resource.mineralTextures)}</div>`;
}

export function renderFeatureResources(details) {
  if (!details?.resources?.length) {
    return '<div class="ws-ins-note">No resource access is currently exposed.</div>';
  }
  return details.resources.map(resourceCard).join('');
}
