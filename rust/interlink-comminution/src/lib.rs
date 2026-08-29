use std::collections::HashMap;

use interlink_core::{FractionDescriptor, PackedHopperState, PackedSolidState, SOLID_MATERIAL_TOLERANCE};
use interlink_processes::{PackedOperatingState, PackedSolidStream, APPARATUS_TRANSFER_TOLERANCE_KG};

const LEGACY_CWI_KWH_PER_T: f64 = 10.0;
const LEGACY_BWI_KWH_PER_T: f64 = 15.0;
const LEGACY_ABRASION_INDEX: f64 = 0.3;
const GENERIC_GRAIN_D10_UM: f64 = 50.0;
const GENERIC_GRAIN_D50_UM: f64 = 125.0;
const GENERIC_GRAIN_D90_UM: f64 = 300.0;
const GENERIC_OCCURRENCE_MODES: [f64; 4] = [0.15, 0.35, 0.35, 0.15];
const MODE_REQUIRED_SIZE_MULTIPLIER: [f64; 4] = [1.0, 1.3, 2.0, 4.0];
const LIBERATION_GRAIN_RATIOS: [f64; 3] = [0.25, 0.5, 2.0];

fn finite_positive(value: f64, label: &str) -> Result<(), String> {
    if !value.is_finite() || value <= 0.0 {
        return Err(format!("{label} must be finite and positive"));
    }
    Ok(())
}

fn finite_non_negative(value: f64, label: &str) -> Result<(), String> {
    if !value.is_finite() || value < 0.0 {
        return Err(format!("{label} must be finite and non-negative"));
    }
    Ok(())
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

#[derive(Debug, Clone, Copy)]
pub struct PackedParticleSizeBin {
    pub runtime_id: u8,
    pub order_index: usize,
    pub max_mm: f64,
    pub representative_mm: f64,
    pub canonical: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct PackedSpeciesTexture {
    pub d10_um: f64,
    pub d50_um: f64,
    pub d90_um: f64,
    pub occurrence_modes: [f64; 4],
}

impl PackedSpeciesTexture {
    pub fn new(
        d10_um: f64,
        d50_um: f64,
        d90_um: f64,
        occurrence_modes: [f64; 4],
    ) -> Result<Self, String> {
        finite_positive(d10_um, "texture d10")?;
        finite_positive(d50_um, "texture d50")?;
        finite_positive(d90_um, "texture d90")?;
        if !(d10_um < d50_um && d50_um < d90_um) {
            return Err("texture grain sizes must satisfy d10 < d50 < d90".to_string());
        }
        let mut total = 0.0;
        for mode in occurrence_modes {
            if !mode.is_finite() || !(0.0..=1.0).contains(&mode) {
                return Err("texture occurrence modes must be within [0, 1]".to_string());
            }
            total += mode;
        }
        if (total - 1.0).abs() > 0.005 {
            return Err("texture occurrence modes must sum to one".to_string());
        }
        Ok(Self { d10_um, d50_um, d90_um, occurrence_modes })
    }

    fn generic() -> Self {
        Self {
            d10_um: GENERIC_GRAIN_D10_UM,
            d50_um: GENERIC_GRAIN_D50_UM,
            d90_um: GENERIC_GRAIN_D90_UM,
            occurrence_modes: GENERIC_OCCURRENCE_MODES,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PackedComminutionProperties {
    pub bond_crushing_work_index_kwh_per_t: f64,
    pub bond_ball_mill_work_index_kwh_per_t: f64,
    pub bond_abrasion_index: f64,
}

impl PackedComminutionProperties {
    pub fn new(cwi: f64, bwi: f64, abrasion: f64) -> Result<Self, String> {
        finite_positive(cwi, "Bond Crushing Work Index")?;
        finite_positive(bwi, "Bond Ball Mill Work Index")?;
        finite_non_negative(abrasion, "Bond Abrasion Index")?;
        Ok(Self {
            bond_crushing_work_index_kwh_per_t: cwi,
            bond_ball_mill_work_index_kwh_per_t: bwi,
            bond_abrasion_index: abrasion,
        })
    }

    fn legacy() -> Self {
        Self {
            bond_crushing_work_index_kwh_per_t: LEGACY_CWI_KWH_PER_T,
            bond_ball_mill_work_index_kwh_per_t: LEGACY_BWI_KWH_PER_T,
            bond_abrasion_index: LEGACY_ABRASION_INDEX,
        }
    }
}

/// Runtime-local tables compiled from the canonical JS authoring vocabulary.
/// Numeric IDs are execution details; strings never enter the hot kernel.
#[derive(Debug, Clone, Default)]
pub struct PackedComminutionTables {
    size_bins: HashMap<u8, PackedParticleSizeBin>,
    canonical_size_ids: Vec<Option<u8>>,
    liberation_index_by_id: HashMap<u8, usize>,
    liberation_ids: Vec<Option<u8>>,
    species_textures: HashMap<(u32, u16), PackedSpeciesTexture>,
    texture_properties: HashMap<u32, PackedComminutionProperties>,
    legacy_lt_one_mm_id: Option<u8>,
}

impl PackedComminutionTables {
    pub fn new() -> Self { Self::default() }

    pub fn add_size_bin(
        &mut self,
        runtime_id: u8,
        order_index: usize,
        max_mm: f64,
        representative_mm: f64,
        canonical: bool,
    ) -> Result<(), String> {
        if max_mm.is_nan() || max_mm <= 0.0 {
            return Err("particle-size max must be positive or infinity".to_string());
        }
        finite_positive(representative_mm, "particle-size representative")?;
        self.size_bins.insert(runtime_id, PackedParticleSizeBin {
            runtime_id,
            order_index,
            max_mm,
            representative_mm,
            canonical,
        });
        if canonical {
            if self.canonical_size_ids.len() <= order_index {
                self.canonical_size_ids.resize(order_index + 1, None);
            }
            self.canonical_size_ids[order_index] = Some(runtime_id);
        }
        Ok(())
    }

    pub fn set_legacy_lt_one_mm_id(&mut self, runtime_id: u8) {
        self.legacy_lt_one_mm_id = Some(runtime_id);
    }

    pub fn add_liberation_class(&mut self, runtime_id: u8, order_index: usize) {
        self.liberation_index_by_id.insert(runtime_id, order_index);
        if self.liberation_ids.len() <= order_index {
            self.liberation_ids.resize(order_index + 1, None);
        }
        self.liberation_ids[order_index] = Some(runtime_id);
    }

    pub fn set_species_texture(
        &mut self,
        texture_profile_id: u32,
        species_id: u16,
        texture: PackedSpeciesTexture,
    ) {
        self.species_textures.insert((texture_profile_id, species_id), texture);
    }

    pub fn set_texture_properties(
        &mut self,
        texture_profile_id: u32,
        properties: PackedComminutionProperties,
    ) {
        self.texture_properties.insert(texture_profile_id, properties);
    }

    fn size_bin(&self, id: u8) -> Result<PackedParticleSizeBin, String> {
        self.size_bins.get(&id).copied().ok_or_else(|| format!("Missing packed particle-size bin {id}"))
    }

    fn canonical_size_id(&self, index: isize) -> Result<u8, String> {
        if self.canonical_size_ids.is_empty() {
            return Err("packed comminution table has no canonical particle bins".to_string());
        }
        let clamped = index.max(0).min(self.canonical_size_ids.len() as isize - 1) as usize;
        self.canonical_size_ids[clamped]
            .ok_or_else(|| format!("Missing canonical packed particle-size bin at index {clamped}"))
    }

    fn liberation_index(&self, id: u8) -> Result<usize, String> {
        self.liberation_index_by_id.get(&id).copied().ok_or_else(|| format!("Missing packed liberation class {id}"))
    }

    fn liberation_id(&self, index: usize) -> Result<u8, String> {
        self.liberation_ids.get(index).and_then(|id| *id)
            .ok_or_else(|| format!("Missing packed liberation class at index {index}"))
    }

    fn texture(&self, texture_id: u32, species_id: u16) -> Result<PackedSpeciesTexture, String> {
        if texture_id == 0 {
            return Ok(PackedSpeciesTexture::generic());
        }
        self.species_textures.get(&(texture_id, species_id)).copied().ok_or_else(|| {
            format!("Packed mineral texture {texture_id} is missing runtime species {species_id}")
        })
    }

    fn properties(&self, texture_id: u32) -> PackedComminutionProperties {
        if texture_id == 0 {
            PackedComminutionProperties::legacy()
        } else {
            self.texture_properties.get(&texture_id).copied().unwrap_or_else(PackedComminutionProperties::legacy)
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PackedComminutionEquipment {
    LegacyCrusher,
    JawCrusher,
    ConeCrusher,
    BallMill,
}

impl PackedComminutionEquipment {
    pub fn from_name(value: &str) -> Result<Self, String> {
        match value {
            "crusher" | "legacy-crusher" => Ok(Self::LegacyCrusher),
            "jawCrusher" | "jaw-crusher" => Ok(Self::JawCrusher),
            "coneCrusher" | "cone-crusher" => Ok(Self::ConeCrusher),
            "ballMill" | "ball-mill" => Ok(Self::BallMill),
            _ => Err(format!("Unknown packed comminution equipment '{value}'")),
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::LegacyCrusher => "Crusher",
            Self::JawCrusher => "Jaw Crusher",
            Self::ConeCrusher => "Cone Crusher",
            Self::BallMill => "Ball Mill",
        }
    }

    fn staged_profile(self) -> Result<EquipmentProfile, String> {
        match self {
            Self::JawCrusher => Ok(EquipmentProfile {
                max_feed_particle_size_mm: 1000.0,
                product_shares: &[(1, 0.15), (0, 0.55), (-1, 0.20), (-2, 0.10)],
                intergranular_breakage_efficiency: 0.02,
                uses_ball_mill_work_index: false,
            }),
            Self::ConeCrusher => Ok(EquipmentProfile {
                max_feed_particle_size_mm: 250.0,
                product_shares: &[(1, 0.10), (0, 0.55), (-1, 0.25), (-2, 0.10)],
                intergranular_breakage_efficiency: 0.10,
                uses_ball_mill_work_index: false,
            }),
            Self::BallMill => Ok(EquipmentProfile {
                max_feed_particle_size_mm: 25.0,
                product_shares: &[(1, 0.05), (0, 0.45), (-1, 0.30), (-2, 0.15), (-3, 0.05)],
                intergranular_breakage_efficiency: 0.95,
                uses_ball_mill_work_index: true,
            }),
            Self::LegacyCrusher => Err("legacy Crusher does not use staged comminution profile".to_string()),
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct EquipmentProfile {
    max_feed_particle_size_mm: f64,
    product_shares: &'static [(isize, f64)],
    intergranular_breakage_efficiency: f64,
    uses_ball_mill_work_index: bool,
}

fn merge_size_shares(entries: Vec<(u8, f64)>) -> Vec<(u8, f64)> {
    let mut merged = Vec::<(u8, f64)>::new();
    for (id, share) in entries {
        if let Some(existing) = merged.iter_mut().find(|(existing_id, _)| *existing_id == id) {
            existing.1 += share;
        } else {
            merged.push((id, share));
        }
    }
    merged
}

fn staged_output_size_shares(
    input_size_id: u8,
    target_size_id: u8,
    profile: EquipmentProfile,
    tables: &PackedComminutionTables,
) -> Result<Vec<(u8, f64)>, String> {
    let input_index = tables.size_bin(input_size_id)?.order_index;
    let target_index = tables.size_bin(target_size_id)?.order_index;
    if input_index <= target_index {
        return Ok(vec![(input_size_id, 1.0)]);
    }
    let entries = profile.product_shares.iter().map(|(offset, share)| {
        Ok((tables.canonical_size_id(target_index as isize + *offset)?, *share))
    }).collect::<Result<Vec<_>, String>>()?;
    Ok(merge_size_shares(entries))
}

fn legacy_output_size_shares(
    input_size_id: u8,
    target_size_id: u8,
    target_particle_size_mm: f64,
    tables: &PackedComminutionTables,
) -> Result<Vec<(u8, f64)>, String> {
    let input_index = tables.size_bin(input_size_id)?.order_index;
    let target_index = tables.size_bin(target_size_id)?.order_index;
    if input_index <= target_index {
        return Ok(vec![(input_size_id, 1.0)]);
    }
    if target_particle_size_mm == 10.0 || target_particle_size_mm == 12.0 {
        let finer = tables.canonical_size_id(target_index as isize - 1)?;
        let mut finest = tables.canonical_size_id(target_index as isize - 2)?;
        if let (Some(legacy), Ok(bin)) = (tables.legacy_lt_one_mm_id, tables.size_bin(finest)) {
            if (bin.representative_mm - 0.75).abs() < 1e-12 {
                finest = legacy;
            }
        }
        return Ok(merge_size_shares(vec![(target_size_id, 0.65), (finer, 0.25), (finest, 0.10)]));
    }
    Ok(merge_size_shares(vec![
        (tables.canonical_size_id(target_index as isize + 1)?, 0.10),
        (target_size_id, 0.55),
        (tables.canonical_size_id(target_index as isize - 1)?, 0.25),
        (tables.canonical_size_id(target_index as isize - 2)?, 0.10),
    ]))
}

fn grain_size_cdf(texture: PackedSpeciesTexture, particle_size_um: f64) -> f64 {
    let points = [
        (texture.d10_um.ln(), 0.10),
        (texture.d50_um.ln(), 0.50),
        (texture.d90_um.ln(), 0.90),
    ];
    let x = particle_size_um.ln();
    let (a, b) = if x <= points[1].0 { (points[0], points[1]) } else { (points[1], points[2]) };
    let slope = (b.1 - a.1) / (b.0 - a.0);
    clamp(a.1 + slope * (x - a.0), 0.0, 1.0)
}

fn cumulative_liberation_share(
    texture: PackedSpeciesTexture,
    particle_size_um: f64,
    grain_ratio: f64,
) -> f64 {
    let mut share = 0.0;
    for mode_index in 0..4 {
        let required_grain_size_um = particle_size_um * MODE_REQUIRED_SIZE_MULTIPLIER[mode_index] * grain_ratio;
        let fraction_large_enough = 1.0 - grain_size_cdf(texture, required_grain_size_um);
        share += texture.occurrence_modes[mode_index] * fraction_large_enough;
    }
    clamp(share, 0.0, 1.0)
}

fn liberation_distribution(
    texture: PackedSpeciesTexture,
    particle_size_mm: f64,
) -> [f64; 4] {
    let particle_size_um = particle_size_mm * 1000.0;
    let partial_or_better = cumulative_liberation_share(texture, particle_size_um, LIBERATION_GRAIN_RATIOS[0]);
    let mostly_or_better = partial_or_better.min(cumulative_liberation_share(texture, particle_size_um, LIBERATION_GRAIN_RATIOS[1]));
    let liberated = mostly_or_better.min(cumulative_liberation_share(texture, particle_size_um, LIBERATION_GRAIN_RATIOS[2]));
    [
        clamp(1.0 - partial_or_better, 0.0, 1.0),
        clamp(partial_or_better - mostly_or_better, 0.0, 1.0),
        clamp(mostly_or_better - liberated, 0.0, 1.0),
        clamp(liberated, 0.0, 1.0),
    ]
}

fn monotonic_liberation_target(
    physical: [f64; 4],
    input_liberation_id: u8,
    tables: &PackedComminutionTables,
) -> Result<Vec<f64>, String> {
    let input_index = tables.liberation_index(input_liberation_id)?;
    let class_count = tables.liberation_ids.len();
    if class_count != 4 {
        return Err("packed comminution currently requires four liberation classes".to_string());
    }
    let mut shares = physical.to_vec();
    let mut folded = 0.0;
    for share in shares.iter_mut().take(input_index) {
        folded += *share;
        *share = 0.0;
    }
    shares[input_index] += folded;
    let total: f64 = shares.iter().sum();
    if total <= 0.0 {
        shares.fill(0.0);
        shares[input_index] = 1.0;
    } else {
        for share in &mut shares { *share /= total; }
    }
    Ok(shares)
}

fn intergranular_progress(
    profile: EquipmentProfile,
    input_size_id: u8,
    output_size_id: u8,
    tables: &PackedComminutionTables,
) -> Result<f64, String> {
    let input = tables.size_bin(input_size_id)?.representative_mm;
    let output = tables.size_bin(output_size_id)?.representative_mm;
    if output >= input { return Ok(0.0); }
    Ok(clamp((1.0 - output / input) * profile.intergranular_breakage_efficiency, 0.0, 1.0))
}

fn staged_fraction_allocations(
    descriptor: FractionDescriptor,
    quantity: f64,
    size_shares: &[(u8, f64)],
    profile: EquipmentProfile,
    tables: &PackedComminutionTables,
) -> Result<Vec<(u8, u8, f64)>, String> {
    let mut merged: HashMap<(u8, u8), f64> = HashMap::new();
    for (size_id, size_share) in size_shares {
        let mass = quantity * *size_share;
        let progress = intergranular_progress(profile, descriptor.size_bin_id, *size_id, tables)?;
        if progress <= 0.0 {
            *merged.entry((*size_id, descriptor.liberation_class_id)).or_insert(0.0) += mass;
            continue;
        }
        let texture = tables.texture(descriptor.texture_profile_id, descriptor.species_id)?;
        let physical = liberation_distribution(texture, tables.size_bin(*size_id)?.representative_mm);
        let target = monotonic_liberation_target(physical, descriptor.liberation_class_id, tables)?;
        let input_index = tables.liberation_index(descriptor.liberation_class_id)?;
        for (class_index, target_share) in target.iter().enumerate() {
            let mut share = progress * *target_share;
            if class_index == input_index { share += 1.0 - progress; }
            if share <= 0.0 { continue; }
            let lib_id = tables.liberation_id(class_index)?;
            *merged.entry((*size_id, lib_id)).or_insert(0.0) += mass * share;
        }
    }

    if merged.is_empty() {
        return Err("comminution produced no allocation for non-empty fraction".to_string());
    }
    let mut entries: Vec<_> = merged.into_iter().map(|((size, lib), q)| (size, lib, q)).collect();
    let largest_index = entries.iter().enumerate()
        .max_by(|a, b| a.1.2.partial_cmp(&b.1.2).unwrap())
        .map(|(index, _)| index).unwrap();
    let mut residual = 0.0;
    for (index, entry) in entries.iter_mut().enumerate() {
        if index != largest_index && entry.2 <= SOLID_MATERIAL_TOLERANCE {
            residual += entry.2;
            entry.2 = 0.0;
        }
    }
    entries[largest_index].2 += residual;
    Ok(entries)
}

pub fn staged_comminute(
    feed: &PackedSolidState,
    target_size_id: u8,
    equipment: PackedComminutionEquipment,
    tables: &PackedComminutionTables,
) -> Result<PackedSolidState, String> {
    if feed.total_quantity() <= SOLID_MATERIAL_TOLERANCE {
        return Err(format!("{} requires non-empty feed", equipment.label()));
    }
    let profile = equipment.staged_profile()?;
    for index in 0..feed.len() {
        let descriptor = feed.descriptor_at(index).unwrap();
        let bin = tables.size_bin(descriptor.size_bin_id)?;
        if bin.max_mm > profile.max_feed_particle_size_mm {
            return Err(format!("{} requires feed particle size <= {} mm", equipment.label(), profile.max_feed_particle_size_mm));
        }
    }

    let mut product = PackedSolidState::new();
    for index in 0..feed.len() {
        let descriptor = feed.descriptor_at(index).unwrap();
        let quantity = feed.quantity_at(index).unwrap();
        let size_shares = staged_output_size_shares(descriptor.size_bin_id, target_size_id, profile, tables)?;
        for (size_id, lib_id, child_quantity) in staged_fraction_allocations(
            descriptor,
            quantity,
            &size_shares,
            profile,
            tables,
        )? {
            if child_quantity <= 0.0 { continue; }
            product.push_fraction(FractionDescriptor {
                species_id: descriptor.species_id,
                size_bin_id: size_id,
                liberation_class_id: lib_id,
                texture_profile_id: descriptor.texture_profile_id,
            }, child_quantity)?;
        }
    }
    let input_total = feed.total_quantity();
    let output_total = product.total_quantity();
    if (input_total - output_total).abs() > 1e-9 * input_total.max(1.0) {
        return Err(format!("{} violated solid-matter conservation", equipment.label()));
    }
    Ok(product)
}

fn legacy_distribute_liberation(
    product: &mut PackedSolidState,
    descriptor: FractionDescriptor,
    output_size_id: u8,
    mass: f64,
    tables: &PackedComminutionTables,
) -> Result<(), String> {
    let input_index = tables.liberation_index(descriptor.liberation_class_id)?;
    let output_size_index = tables.size_bin(output_size_id)?.order_index;
    let input_size_index = tables.size_bin(descriptor.size_bin_id)?.order_index;
    let max_index = tables.liberation_ids.len().saturating_sub(1);
    let size_improvement = input_size_index.saturating_sub(output_size_index);
    let max_lift = (if size_improvement >= 2 { 2 } else if size_improvement >= 1 { 1 } else { 0 })
        .min(max_index.saturating_sub(input_index));
    let mut add = |lib_index: usize, quantity: f64| -> Result<(), String> {
        product.push_fraction(FractionDescriptor {
            species_id: descriptor.species_id,
            size_bin_id: output_size_id,
            liberation_class_id: tables.liberation_id(lib_index)?,
            texture_profile_id: descriptor.texture_profile_id,
        }, quantity)
    };
    if max_lift == 0 || input_index >= max_index {
        return add(input_index, mass);
    }
    let improved = clamp(0.2 + 0.2 * size_improvement as f64, 0.0, if max_lift >= 2 { 0.8 } else { 0.65 });
    let same = 1.0 - improved;
    if same > 0.0 { add(input_index, mass * same)?; }
    if max_lift == 1 {
        add(input_index + 1, mass * improved)?;
    } else {
        add(input_index + 1, mass * improved * 0.65)?;
        add(input_index + 2, mass * improved * 0.35)?;
    }
    Ok(())
}

pub fn legacy_crush(
    feed: &PackedSolidState,
    target_size_id: u8,
    target_particle_size_mm: f64,
    tables: &PackedComminutionTables,
) -> Result<PackedSolidState, String> {
    finite_positive(target_particle_size_mm, "Crusher target particle size")?;
    if feed.total_quantity() <= SOLID_MATERIAL_TOLERANCE {
        return Err("Crusher requires non-empty feed".to_string());
    }
    let mut product = PackedSolidState::new();
    for index in 0..feed.len() {
        let descriptor = feed.descriptor_at(index).unwrap();
        let quantity = feed.quantity_at(index).unwrap();
        let shares = legacy_output_size_shares(descriptor.size_bin_id, target_size_id, target_particle_size_mm, tables)?;
        for (size_id, share) in shares {
            legacy_distribute_liberation(&mut product, descriptor, size_id, quantity * share, tables)?;
        }
    }
    let input_total = feed.total_quantity();
    let output_total = product.total_quantity();
    if (input_total - output_total).abs() > 1e-9 * input_total.max(1.0) {
        return Err("Crusher violated solid-matter conservation".to_string());
    }
    Ok(product)
}

fn particle_size_percentile_um(state: &PackedSolidState, percentile: f64, tables: &PackedComminutionTables) -> Result<Option<f64>, String> {
    let total = state.total_quantity();
    if total <= 0.0 { return Ok(None); }
    let mut by_index: HashMap<usize, f64> = HashMap::new();
    for index in 0..state.len() {
        let descriptor = state.descriptor_at(index).unwrap();
        let bin_index = tables.size_bin(descriptor.size_bin_id)?.order_index;
        *by_index.entry(bin_index).or_insert(0.0) += state.quantity_at(index).unwrap();
    }
    let target = total * percentile;
    let mut cumulative = 0.0;
    for order_index in 0..tables.canonical_size_ids.len() {
        cumulative += by_index.get(&order_index).copied().unwrap_or(0.0);
        if cumulative >= target {
            let id = tables.canonical_size_id(order_index as isize)?;
            return Ok(Some(tables.size_bin(id)?.representative_mm * 1000.0));
        }
    }
    let id = tables.canonical_size_id(tables.canonical_size_ids.len() as isize - 1)?;
    Ok(Some(tables.size_bin(id)?.representative_mm * 1000.0))
}

pub fn weighted_comminution_properties(feed: &PackedSolidState, tables: &PackedComminutionTables) -> PackedComminutionProperties {
    let mut total = 0.0;
    let mut cwi = 0.0;
    let mut bwi = 0.0;
    let mut ai = 0.0;
    for index in 0..feed.len() {
        let descriptor = feed.descriptor_at(index).unwrap();
        let quantity = feed.quantity_at(index).unwrap();
        let props = tables.properties(descriptor.texture_profile_id);
        total += quantity;
        cwi += quantity * props.bond_crushing_work_index_kwh_per_t;
        bwi += quantity * props.bond_ball_mill_work_index_kwh_per_t;
        ai += quantity * props.bond_abrasion_index;
    }
    if total <= 0.0 { return PackedComminutionProperties::legacy(); }
    PackedComminutionProperties {
        bond_crushing_work_index_kwh_per_t: cwi / total,
        bond_ball_mill_work_index_kwh_per_t: bwi / total,
        bond_abrasion_index: ai / total,
    }
}

pub fn comminution_specific_energy_kwh_per_t(
    feed: &PackedSolidState,
    target_size_id: u8,
    equipment: PackedComminutionEquipment,
    tables: &PackedComminutionTables,
) -> Result<f64, String> {
    let product = staged_comminute(feed, target_size_id, equipment, tables)?;
    let Some(feed_p80_um) = particle_size_percentile_um(feed, 0.8, tables)? else { return Ok(0.0); };
    let Some(product_p80_um) = particle_size_percentile_um(&product, 0.8, tables)? else { return Ok(0.0); };
    if product_p80_um >= feed_p80_um { return Ok(0.0); }
    let props = weighted_comminution_properties(feed, tables);
    let profile = equipment.staged_profile()?;
    let work_index = if profile.uses_ball_mill_work_index {
        props.bond_ball_mill_work_index_kwh_per_t
    } else {
        props.bond_crushing_work_index_kwh_per_t
    };
    Ok(work_index * 10.0 * (1.0 / product_p80_um.sqrt() - 1.0 / feed_p80_um.sqrt()))
}

#[derive(Debug, Clone)]
pub struct PackedComminutionProcessResult {
    pub actual_feed: PackedSolidState,
    pub product: PackedSolidState,
    pub specific_energy_kwh_per_t: f64,
    pub power_limited_throughput_kg_per_second: f64,
    pub properties: PackedComminutionProperties,
    pub actual_power_kw: f64,
}

pub fn apply_continuous_staged_comminution(
    feed: &PackedSolidState,
    target_size_id: u8,
    equipment: PackedComminutionEquipment,
    throughput_capacity_kg_per_second: f64,
    rated_power_kw: f64,
    tables: &PackedComminutionTables,
) -> Result<PackedComminutionProcessResult, String> {
    finite_positive(throughput_capacity_kg_per_second, "comminution throughput capacity")?;
    finite_positive(rated_power_kw, "comminution rated power")?;
    let feed_total_rate = feed.total_quantity();
    let specific_energy = if feed_total_rate > 0.0 {
        comminution_specific_energy_kwh_per_t(feed, target_size_id, equipment, tables)?
    } else { 0.0 };
    let power_limited = if specific_energy > 0.0 {
        rated_power_kw / (specific_energy * 3.6)
    } else { f64::INFINITY };
    let allowed_rate = throughput_capacity_kg_per_second.min(power_limited);
    let factor = if feed_total_rate > 0.0 { (allowed_rate / feed_total_rate).min(1.0) } else { 1.0 };
    let actual_feed = feed.scaled(factor)?;
    let product = staged_comminute(&actual_feed, target_size_id, equipment, tables)?;
    let properties = weighted_comminution_properties(feed, tables);
    let actual_power_kw = specific_energy * actual_feed.total_quantity() * 3.6;
    Ok(PackedComminutionProcessResult {
        actual_feed,
        product,
        specific_energy_kwh_per_t: specific_energy,
        power_limited_throughput_kg_per_second: power_limited,
        properties,
        actual_power_kw,
    })
}

#[derive(Debug, Clone, Copy)]
pub struct PackedComminutionConfig {
    pub equipment: PackedComminutionEquipment,
    pub target_size_id: u8,
    pub target_particle_size_mm: f64,
    pub throughput_kg_per_second: f64,
    pub rated_power_kw: Option<f64>,
    pub enabled: bool,
}

impl PackedComminutionConfig {
    pub fn new(
        equipment: PackedComminutionEquipment,
        target_size_id: u8,
        target_particle_size_mm: f64,
        throughput_kg_per_second: f64,
        rated_power_kw: Option<f64>,
        enabled: bool,
    ) -> Result<Self, String> {
        finite_positive(target_particle_size_mm, "comminution target particle size")?;
        finite_positive(throughput_kg_per_second, "comminution throughput")?;
        if equipment != PackedComminutionEquipment::LegacyCrusher {
            finite_positive(rated_power_kw.ok_or_else(|| "staged comminution requires rated power".to_string())?, "comminution rated power")?;
        }
        Ok(Self { equipment, target_size_id, target_particle_size_mm, throughput_kg_per_second, rated_power_kw, enabled })
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PackedComminutionTickResult {
    pub operating_state: PackedOperatingState,
    pub transferred_mass_kg: f64,
}

#[derive(Debug, Clone)]
pub struct PackedComminutionRuntime {
    config: PackedComminutionConfig,
    input_stream: PackedSolidStream,
    output_stream: PackedSolidStream,
    operating_state: PackedOperatingState,
    last_error: Option<String>,
    last_specific_energy_kwh_per_t: f64,
    last_power_kw: f64,
    last_bond_abrasion_index: f64,
    abrasion_exposure_tonne_ai: f64,
}

impl PackedComminutionRuntime {
    pub fn new(config: PackedComminutionConfig) -> Self {
        Self {
            operating_state: if config.enabled { PackedOperatingState::Idle } else { PackedOperatingState::Off },
            config,
            input_stream: PackedSolidStream::new(),
            output_stream: PackedSolidStream::new(),
            last_error: None,
            last_specific_energy_kwh_per_t: 0.0,
            last_power_kw: 0.0,
            last_bond_abrasion_index: 0.0,
            abrasion_exposure_tonne_ai: 0.0,
        }
    }

    pub fn input_stream(&self) -> &PackedSolidStream { &self.input_stream }
    pub fn output_stream(&self) -> &PackedSolidStream { &self.output_stream }
    pub fn operating_state(&self) -> PackedOperatingState { self.operating_state }
    pub fn last_error(&self) -> Option<&str> { self.last_error.as_deref() }
    pub fn last_specific_energy_kwh_per_t(&self) -> f64 { self.last_specific_energy_kwh_per_t }
    pub fn last_power_kw(&self) -> f64 { self.last_power_kw }
    pub fn last_bond_abrasion_index(&self) -> f64 { self.last_bond_abrasion_index }
    pub fn abrasion_exposure_tonne_ai(&self) -> f64 { self.abrasion_exposure_tonne_ai }

    fn finish(&mut self, state: PackedOperatingState, transferred_mass_kg: f64) -> PackedComminutionTickResult {
        self.operating_state = state;
        PackedComminutionTickResult { operating_state: state, transferred_mass_kg }
    }

    fn idle_diagnostics(&mut self) {
        self.last_specific_energy_kwh_per_t = 0.0;
        self.last_power_kw = 0.0;
    }

    pub fn tick_hopper_to_hopper(
        &mut self,
        source: &mut PackedHopperState,
        target: &mut PackedHopperState,
        tables: &PackedComminutionTables,
        dt: f64,
    ) -> Result<PackedComminutionTickResult, String> {
        finite_positive(dt, "comminution simulation dt")?;
        self.input_stream.clear();
        self.output_stream.clear();
        if self.config.equipment != PackedComminutionEquipment::LegacyCrusher {
            self.last_error = None;
        }

        if !self.config.enabled {
            if self.config.equipment != PackedComminutionEquipment::LegacyCrusher { self.last_error = None; }
            self.idle_diagnostics();
            return Ok(self.finish(PackedOperatingState::Off, 0.0));
        }
        let stored_mass = source.stored_mass_kg();
        if stored_mass <= SOLID_MATERIAL_TOLERANCE {
            self.last_error = None;
            self.idle_diagnostics();
            return Ok(self.finish(PackedOperatingState::Idle, 0.0));
        }
        let free_output = target.free_capacity_kg();
        if free_output <= SOLID_MATERIAL_TOLERANCE {
            self.last_error = Some("Product storage is full".to_string());
            self.idle_diagnostics();
            return Ok(self.finish(PackedOperatingState::Blocked, 0.0));
        }
        let mechanical_rate = self.config.throughput_kg_per_second.min(stored_mass / dt).min(free_output / dt);
        if mechanical_rate <= 0.0 {
            self.idle_diagnostics();
            return Ok(self.finish(PackedOperatingState::Blocked, 0.0));
        }
        let candidate_feed = source.body().solid_state().scaled(mechanical_rate / stored_mass)?;

        let (actual_feed, product, specific_energy, actual_power, properties) = if self.config.equipment == PackedComminutionEquipment::LegacyCrusher {
            match legacy_crush(&candidate_feed, self.config.target_size_id, self.config.target_particle_size_mm, tables) {
                Ok(product) => (candidate_feed, product, 0.0, 0.0, PackedComminutionProperties::legacy()),
                Err(error) => {
                    self.last_error = Some(error);
                    self.idle_diagnostics();
                    return Ok(self.finish(PackedOperatingState::Blocked, 0.0));
                }
            }
        } else {
            match apply_continuous_staged_comminution(
                &candidate_feed,
                self.config.target_size_id,
                self.config.equipment,
                self.config.throughput_kg_per_second,
                self.config.rated_power_kw.unwrap(),
                tables,
            ) {
                Ok(result) => (
                    result.actual_feed,
                    result.product,
                    result.specific_energy_kwh_per_t,
                    result.actual_power_kw,
                    result.properties,
                ),
                Err(error) => {
                    self.last_error = Some(error);
                    self.idle_diagnostics();
                    return Ok(self.finish(PackedOperatingState::Blocked, 0.0));
                }
            }
        };

        let planned_rate = actual_feed.total_quantity();
        if planned_rate <= APPARATUS_TRANSFER_TOLERANCE_KG {
            self.last_error = None;
            self.idle_diagnostics();
            return Ok(self.finish(PackedOperatingState::Idle, 0.0));
        }
        let expected_output_kg = product.total_quantity() * dt;
        if expected_output_kg > target.free_capacity_kg() + APPARATUS_TRANSFER_TOLERANCE_KG {
            self.last_error = Some(format!("{} product exceeds output capacity", self.config.equipment.label()));
            self.idle_diagnostics();
            return Ok(self.finish(PackedOperatingState::Blocked, 0.0));
        }

        let mut staged_source = source.clone();
        let mut staged_target = target.clone();
        let withdrawal = staged_source.withdraw_rate(planned_rate, dt)?;
        if withdrawal.actual_mass_kg <= APPARATUS_TRANSFER_TOLERANCE_KG {
            self.last_error = None;
            self.idle_diagnostics();
            return Ok(self.finish(PackedOperatingState::Idle, 0.0));
        }
        let actual_feed_stream = withdrawal.body.solid_state().scaled(1.0 / dt)?;
        let specific_enthalpy = withdrawal.body.specific_sensible_enthalpy_j_per_kg();
        let accepted = staged_target.receive_flow(&product, dt, specific_enthalpy)?;
        let tolerance = APPARATUS_TRANSFER_TOLERANCE_KG * expected_output_kg.max(1.0);
        if (accepted - expected_output_kg).abs() > tolerance {
            return Err(format!("{} could not commit its planned output atomically", self.config.equipment.label()));
        }

        *source = staged_source;
        *target = staged_target;
        self.input_stream.set_flow(&actual_feed_stream, specific_enthalpy)?;
        self.output_stream.set_flow(&product, specific_enthalpy)?;
        self.last_specific_energy_kwh_per_t = specific_energy;
        self.last_power_kw = actual_power;
        self.last_bond_abrasion_index = properties.bond_abrasion_index;
        if self.config.equipment != PackedComminutionEquipment::LegacyCrusher {
            self.abrasion_exposure_tonne_ai += (expected_output_kg / 1000.0) * properties.bond_abrasion_index;
        }
        self.last_error = None;
        Ok(self.finish(PackedOperatingState::Running, withdrawal.actual_mass_kg))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use interlink_core::PackedSolidBody;

    fn tables() -> PackedComminutionTables {
        let mut t = PackedComminutionTables::new();
        let reps = [0.002,0.006,0.012,0.024,0.0475,0.094,0.1875,0.375,0.75,3.0,10.0,20.0,42.5,90.0,185.0,375.0,750.0,1200.0];
        let maxes = [0.004,0.008,0.016,0.032,0.063,0.125,0.25,0.5,1.0,5.0,15.0,25.0,60.0,120.0,250.0,500.0,1000.0,f64::INFINITY];
        for i in 0..reps.len() { t.add_size_bin(i as u8, i, maxes[i], reps[i], true).unwrap(); }
        for i in 0..4 { t.add_liberation_class(i as u8, i); }
        t
    }

    fn one_fraction(size_id: u8, quantity: f64) -> PackedSolidState {
        let mut state = PackedSolidState::new();
        state.push_fraction(FractionDescriptor { species_id: 1, size_bin_id: size_id, liberation_class_id: 0, texture_profile_id: 0 }, quantity).unwrap();
        state
    }

    fn by_size(state: &PackedSolidState) -> HashMap<u8, f64> {
        let mut out = HashMap::new();
        for i in 0..state.len() {
            let d = state.descriptor_at(i).unwrap();
            *out.entry(d.size_bin_id).or_insert(0.0) += state.quantity_at(i).unwrap();
        }
        out
    }

    #[test]
    fn jaw_psd_matches_production_profile() {
        let t = tables();
        let product = staged_comminute(&one_fraction(16, 100.0), 13, PackedComminutionEquipment::JawCrusher, &t).unwrap();
        let sizes = by_size(&product);
        assert!((sizes[&14] - 15.0).abs() < 1e-9);
        assert!((sizes[&13] - 55.0).abs() < 1e-9);
        assert!((sizes[&12] - 20.0).abs() < 1e-9);
        assert!((sizes[&11] - 10.0).abs() < 1e-9);
        assert!((product.total_quantity() - 100.0).abs() < 1e-9);
    }

    #[test]
    fn cone_rejects_oversized_feed() {
        let t = tables();
        let error = staged_comminute(&one_fraction(16, 100.0), 11, PackedComminutionEquipment::ConeCrusher, &t).unwrap_err();
        assert!(error.contains("<= 250"));
    }

    #[test]
    fn ball_mill_psd_matches_production_profile() {
        let t = tables();
        let product = staged_comminute(&one_fraction(11, 100.0), 6, PackedComminutionEquipment::BallMill, &t).unwrap();
        let sizes = by_size(&product);
        assert!((sizes[&7] - 5.0).abs() < 1e-9);
        assert!((sizes[&6] - 45.0).abs() < 1e-9);
        assert!((sizes[&5] - 30.0).abs() < 1e-9);
        assert!((sizes[&4] - 15.0).abs() < 1e-9);
        assert!((sizes[&3] - 5.0).abs() < 1e-9);
    }

    #[test]
    fn harder_ball_mill_feed_is_more_power_limited() {
        let mut t = tables();
        let texture = PackedSpeciesTexture::new(72.0, 180.0, 450.0, GENERIC_OCCURRENCE_MODES).unwrap();
        t.set_species_texture(1, 1, texture);
        t.set_species_texture(2, 1, texture);
        t.set_texture_properties(1, PackedComminutionProperties::new(10.0, 9.0, 0.2).unwrap());
        t.set_texture_properties(2, PackedComminutionProperties::new(10.0, 22.0, 0.6).unwrap());
        let mut easy = one_fraction(11, 10.0);
        easy = easy.scaled(1.0).unwrap();
        let d = easy.descriptor_at(0).unwrap();
        let q = easy.quantity_at(0).unwrap();
        let mut easy_textured = PackedSolidState::new();
        easy_textured.push_fraction(FractionDescriptor { texture_profile_id: 1, ..d }, q).unwrap();
        let mut hard_textured = PackedSolidState::new();
        hard_textured.push_fraction(FractionDescriptor { texture_profile_id: 2, ..d }, q).unwrap();
        let easy_r = apply_continuous_staged_comminution(&easy_textured, 6, PackedComminutionEquipment::BallMill, 10.0, 25.0, &t).unwrap();
        let hard_r = apply_continuous_staged_comminution(&hard_textured, 6, PackedComminutionEquipment::BallMill, 10.0, 25.0, &t).unwrap();
        assert!(easy_r.specific_energy_kwh_per_t < hard_r.specific_energy_kwh_per_t);
        assert!(easy_r.actual_feed.total_quantity() > hard_r.actual_feed.total_quantity());
        assert!(easy_r.actual_power_kw <= 25.0 + 1e-9);
        assert!(hard_r.actual_power_kw <= 25.0 + 1e-9);
    }

    #[test]
    fn apparatus_tick_preserves_mass_and_sensible_energy() {
        let t = tables();
        let feed = one_fraction(16, 100.0);
        let mut source = PackedHopperState::new(200.0, PackedSolidBody::new(feed, 10_000.0).unwrap()).unwrap();
        let mut target = PackedHopperState::empty(100.0).unwrap();
        let config = PackedComminutionConfig::new(PackedComminutionEquipment::JawCrusher, 13, 120.0, 5.0, Some(1000.0), true).unwrap();
        let mut runtime = PackedComminutionRuntime::new(config);
        let before_energy = source.body().sensible_enthalpy_j() + target.body().sensible_enthalpy_j();
        let result = runtime.tick_hopper_to_hopper(&mut source, &mut target, &t, 0.1).unwrap();
        assert_eq!(result.operating_state, PackedOperatingState::Running);
        assert!((source.stored_mass_kg() + target.stored_mass_kg() - 100.0).abs() < 1e-9);
        let after_energy = source.body().sensible_enthalpy_j() + target.body().sensible_enthalpy_j();
        assert!((after_energy - before_energy).abs() < 1e-9);
        assert!(runtime.output_stream().total_mass_flow_kg_per_second() > 0.0);
    }
}
