use std::collections::HashMap;

use serde::{Deserialize, Serialize};

pub const SIMULATION_STEP_SECONDS: f64 = 0.1;
pub const SOLID_MATERIAL_TOLERANCE: f64 = 1e-9;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FractionDescriptor {
    pub species_id: u16,
    pub size_bin_id: u8,
    pub liberation_class_id: u8,
    /// Runtime-local texture identifier. Zero means untextured.
    pub texture_profile_id: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackedSolidColumns {
    pub species_ids: Vec<u16>,
    pub size_bin_ids: Vec<u8>,
    pub liberation_class_ids: Vec<u8>,
    pub texture_profile_ids: Vec<u32>,
    pub quantities: Vec<f64>,
}

impl PackedSolidColumns {
    pub fn len(&self) -> usize {
        self.quantities.len()
    }

    pub fn is_empty(&self) -> bool {
        self.quantities.is_empty()
    }

    fn validate_lengths(&self) -> Result<(), String> {
        let len = self.quantities.len();
        if self.species_ids.len() != len
            || self.size_bin_ids.len() != len
            || self.liberation_class_ids.len() != len
            || self.texture_profile_ids.len() != len
        {
            return Err("packed solid columns must have identical lengths".to_string());
        }
        Ok(())
    }
}

/// Data-oriented execution representation for solid particulate populations.
///
/// Readable JS/save state keeps string identifiers; the runtime compiler maps
/// those identifiers to compact numeric IDs before entering this structure.
/// Identical descriptors merge into one canonical row just like the current
/// JavaScript sparse fraction-key representation.
#[derive(Debug, Clone)]
pub struct PackedSolidState {
    species_ids: Vec<u16>,
    size_bin_ids: Vec<u8>,
    liberation_class_ids: Vec<u8>,
    texture_profile_ids: Vec<u32>,
    quantities: Vec<f64>,
    index_by_descriptor: HashMap<FractionDescriptor, usize>,
}

impl Default for PackedSolidState {
    fn default() -> Self {
        Self::new()
    }
}

impl PackedSolidState {
    pub fn new() -> Self {
        Self {
            species_ids: Vec::new(),
            size_bin_ids: Vec::new(),
            liberation_class_ids: Vec::new(),
            texture_profile_ids: Vec::new(),
            quantities: Vec::new(),
            index_by_descriptor: HashMap::new(),
        }
    }

    pub fn from_columns(columns: PackedSolidColumns) -> Result<Self, String> {
        columns.validate_lengths()?;
        let mut state = Self::new();
        for index in 0..columns.len() {
            state.push_fraction(
                FractionDescriptor {
                    species_id: columns.species_ids[index],
                    size_bin_id: columns.size_bin_ids[index],
                    liberation_class_id: columns.liberation_class_ids[index],
                    texture_profile_id: columns.texture_profile_ids[index],
                },
                columns.quantities[index],
            )?;
        }
        Ok(state)
    }

    pub fn len(&self) -> usize {
        self.quantities.len()
    }

    pub fn is_empty(&self) -> bool {
        self.quantities.is_empty()
    }

    pub fn clear(&mut self) {
        self.species_ids.clear();
        self.size_bin_ids.clear();
        self.liberation_class_ids.clear();
        self.texture_profile_ids.clear();
        self.quantities.clear();
        self.index_by_descriptor.clear();
    }

    pub fn push_fraction(
        &mut self,
        descriptor: FractionDescriptor,
        quantity: f64,
    ) -> Result<(), String> {
        validate_quantity(quantity)?;
        if quantity <= SOLID_MATERIAL_TOLERANCE {
            return Ok(());
        }

        if let Some(index) = self.index_by_descriptor.get(&descriptor).copied() {
            self.quantities[index] += quantity;
            return Ok(());
        }

        let index = self.quantities.len();
        self.species_ids.push(descriptor.species_id);
        self.size_bin_ids.push(descriptor.size_bin_id);
        self.liberation_class_ids
            .push(descriptor.liberation_class_id);
        self.texture_profile_ids.push(descriptor.texture_profile_id);
        self.quantities.push(quantity);
        self.index_by_descriptor.insert(descriptor, index);
        Ok(())
    }

    pub fn total_quantity(&self) -> f64 {
        self.quantities
            .iter()
            .copied()
            .filter(|quantity| *quantity > SOLID_MATERIAL_TOLERANCE)
            .sum()
    }

    pub fn scale_in_place(&mut self, factor: f64) -> Result<(), String> {
        if !factor.is_finite() || factor < 0.0 {
            return Err("solid material scale factor must be finite and non-negative".to_string());
        }
        if factor <= SOLID_MATERIAL_TOLERANCE {
            self.clear();
            return Ok(());
        }

        for quantity in &mut self.quantities {
            *quantity *= factor;
        }
        self.prune_tolerance();
        Ok(())
    }

    pub fn quantity_at(&self, index: usize) -> Option<f64> {
        self.quantities.get(index).copied()
    }

    pub fn descriptor_at(&self, index: usize) -> Option<FractionDescriptor> {
        Some(FractionDescriptor {
            species_id: *self.species_ids.get(index)?,
            size_bin_id: *self.size_bin_ids.get(index)?,
            liberation_class_id: *self.liberation_class_ids.get(index)?,
            texture_profile_id: *self.texture_profile_ids.get(index)?,
        })
    }

    pub fn to_columns(&self) -> PackedSolidColumns {
        PackedSolidColumns {
            species_ids: self.species_ids.clone(),
            size_bin_ids: self.size_bin_ids.clone(),
            liberation_class_ids: self.liberation_class_ids.clone(),
            texture_profile_ids: self.texture_profile_ids.clone(),
            quantities: self.quantities.clone(),
        }
    }

    fn prune_tolerance(&mut self) {
        if self
            .quantities
            .iter()
            .all(|quantity| *quantity > SOLID_MATERIAL_TOLERANCE)
        {
            return;
        }

        let old = self.to_columns();
        self.clear();
        for index in 0..old.len() {
            let quantity = old.quantities[index];
            if quantity <= SOLID_MATERIAL_TOLERANCE {
                continue;
            }
            let descriptor = FractionDescriptor {
                species_id: old.species_ids[index],
                size_bin_id: old.size_bin_ids[index],
                liberation_class_id: old.liberation_class_ids[index],
                texture_profile_id: old.texture_profile_ids[index],
            };
            // Values were already validated; failure is impossible unless that
            // invariant changes, so keep this internal reconstruction infallible.
            self.push_fraction(descriptor, quantity)
                .expect("validated packed material should remain valid");
        }
    }
}

fn validate_quantity(quantity: f64) -> Result<(), String> {
    if !quantity.is_finite() || quantity < 0.0 {
        return Err("solid material quantity must be finite and non-negative".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ParityFixture {
        fractions: Vec<ParityFraction>,
        expected_canonical_count: usize,
        expected_total: f64,
        scale_factor: f64,
        expected_scaled_total: f64,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ParityFraction {
        species_id: u16,
        size_bin_id: u8,
        liberation_class_id: u8,
        texture_profile_id: u32,
        quantity: f64,
    }

    #[test]
    fn duplicate_descriptors_merge_and_total_deterministically() {
        let descriptor = FractionDescriptor {
            species_id: 3,
            size_bin_id: 4,
            liberation_class_id: 2,
            texture_profile_id: 9,
        };
        let mut state = PackedSolidState::new();
        state.push_fraction(descriptor, 4.0).unwrap();
        state.push_fraction(descriptor, 6.5).unwrap();
        assert_eq!(state.len(), 1);
        assert!((state.total_quantity() - 10.5).abs() < 1e-12);
    }

    #[test]
    fn scale_preserves_descriptors_and_updates_total() {
        let mut state = PackedSolidState::new();
        state
            .push_fraction(
                FractionDescriptor {
                    species_id: 1,
                    size_bin_id: 2,
                    liberation_class_id: 3,
                    texture_profile_id: 0,
                },
                8.0,
            )
            .unwrap();
        let descriptor = state.descriptor_at(0).unwrap();
        state.scale_in_place(0.25).unwrap();
        assert_eq!(state.descriptor_at(0), Some(descriptor));
        assert!((state.total_quantity() - 2.0).abs() < 1e-12);
    }

    #[test]
    fn invalid_quantities_and_factors_are_rejected() {
        let mut state = PackedSolidState::new();
        let descriptor = FractionDescriptor {
            species_id: 1,
            size_bin_id: 1,
            liberation_class_id: 1,
            texture_profile_id: 0,
        };
        assert!(state.push_fraction(descriptor, f64::NAN).is_err());
        assert!(state.push_fraction(descriptor, -1.0).is_err());
        assert!(state.scale_in_place(f64::INFINITY).is_err());
        assert!(state.scale_in_place(-0.5).is_err());
    }

    #[test]
    fn shared_js_rust_parity_fixture_matches_runtime_semantics() {
        let fixture: ParityFixture = serde_json::from_str(include_str!(
            "../../../tests/fixtures/rust_core_parity.json"
        ))
        .unwrap();
        let mut state = PackedSolidState::new();
        for fraction in fixture.fractions {
            state
                .push_fraction(
                    FractionDescriptor {
                        species_id: fraction.species_id,
                        size_bin_id: fraction.size_bin_id,
                        liberation_class_id: fraction.liberation_class_id,
                        texture_profile_id: fraction.texture_profile_id,
                    },
                    fraction.quantity,
                )
                .unwrap();
        }
        assert_eq!(state.len(), fixture.expected_canonical_count);
        assert!((state.total_quantity() - fixture.expected_total).abs() < 1e-12);
        state.scale_in_place(fixture.scale_factor).unwrap();
        assert!((state.total_quantity() - fixture.expected_scaled_total).abs() < 1e-12);
    }
}
