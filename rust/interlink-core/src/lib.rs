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
        validate_non_negative_finite(quantity, "solid material quantity")?;
        if quantity <= SOLID_MATERIAL_TOLERANCE {
            return Ok(());
        }

        if let Some(index) = self.index_by_descriptor.get(&descriptor).copied() {
            let merged = self.quantities[index] + quantity;
            validate_non_negative_finite(merged, "merged solid material quantity")?;
            self.quantities[index] = merged;
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
        validate_non_negative_finite(factor, "solid material scale factor")?;
        if factor <= SOLID_MATERIAL_TOLERANCE {
            self.clear();
            return Ok(());
        }

        for quantity in &self.quantities {
            validate_non_negative_finite(*quantity * factor, "scaled solid material quantity")?;
        }
        for quantity in &mut self.quantities {
            *quantity *= factor;
        }
        self.prune_tolerance();
        Ok(())
    }

    pub fn scaled(&self, factor: f64) -> Result<Self, String> {
        let mut result = self.clone();
        result.scale_in_place(factor)?;
        Ok(result)
    }

    pub fn add_scaled_from(&mut self, source: &Self, factor: f64) -> Result<(), String> {
        validate_non_negative_finite(factor, "solid material add factor")?;
        if factor <= SOLID_MATERIAL_TOLERANCE {
            return Ok(());
        }
        for index in 0..source.len() {
            self.push_fraction(
                source
                    .descriptor_at(index)
                    .expect("packed descriptor columns share one length"),
                source.quantities[index] * factor,
            )?;
        }
        Ok(())
    }

    /// Return a well-mixed proportional share without mutating this state.
    pub fn proportional_share(&self, requested_quantity: f64) -> Result<Self, String> {
        validate_non_negative_finite(requested_quantity, "requested solid quantity")?;
        let total = self.total_quantity();
        if total <= SOLID_MATERIAL_TOLERANCE || requested_quantity <= SOLID_MATERIAL_TOLERANCE {
            return Ok(Self::new());
        }
        self.scaled((requested_quantity / total).min(1.0))
    }

    /// Remove a well-mixed proportional quantity and return the withdrawn state.
    pub fn withdraw_quantity(&mut self, requested_quantity: f64) -> Result<Self, String> {
        validate_non_negative_finite(requested_quantity, "requested solid quantity")?;
        let total = self.total_quantity();
        if total <= SOLID_MATERIAL_TOLERANCE || requested_quantity <= SOLID_MATERIAL_TOLERANCE {
            return Ok(Self::new());
        }
        let actual = requested_quantity.min(total);
        let fraction = actual / total;
        let withdrawn = self.scaled(fraction)?;
        if actual >= total - SOLID_MATERIAL_TOLERANCE {
            self.clear();
        } else {
            self.scale_in_place(1.0 - fraction)?;
        }
        Ok(withdrawn)
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
            self.push_fraction(descriptor, quantity)
                .expect("validated packed material should remain valid");
        }
    }
}

/// Packed solid inventory plus the body's authoritative sensible-enthalpy ledger.
/// Temperature remains derived by the higher-level thermal model.
#[derive(Debug, Clone)]
pub struct PackedSolidBody {
    solid_state: PackedSolidState,
    sensible_enthalpy_j: f64,
}

impl PackedSolidBody {
    pub fn new(solid_state: PackedSolidState, sensible_enthalpy_j: f64) -> Result<Self, String> {
        validate_finite(sensible_enthalpy_j, "sensible enthalpy")?;
        Ok(Self {
            solid_state,
            sensible_enthalpy_j,
        })
    }

    pub fn empty() -> Self {
        Self {
            solid_state: PackedSolidState::new(),
            sensible_enthalpy_j: 0.0,
        }
    }

    pub fn solid_state(&self) -> &PackedSolidState {
        &self.solid_state
    }

    pub fn solid_state_mut(&mut self) -> &mut PackedSolidState {
        &mut self.solid_state
    }

    pub fn sensible_enthalpy_j(&self) -> f64 {
        self.sensible_enthalpy_j
    }

    pub fn set_sensible_enthalpy_j(&mut self, value: f64) -> Result<(), String> {
        validate_finite(value, "sensible enthalpy")?;
        self.sensible_enthalpy_j = value;
        Ok(())
    }

    pub fn total_mass_kg(&self) -> f64 {
        self.solid_state.total_quantity()
    }

    pub fn specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        let mass = self.total_mass_kg();
        if mass <= SOLID_MATERIAL_TOLERANCE {
            0.0
        } else {
            self.sensible_enthalpy_j / mass
        }
    }
}

#[derive(Debug, Clone)]
pub struct PackedWithdrawal {
    pub body: PackedSolidBody,
    pub actual_mass_kg: f64,
}

/// Finite-capacity packed solid storage. This is the Rust execution analogue of
/// the current Hopper inventory semantics, not player-facing serialized state.
#[derive(Debug, Clone)]
pub struct PackedHopperState {
    capacity_kg: f64,
    body: PackedSolidBody,
}

impl PackedHopperState {
    pub fn new(capacity_kg: f64, body: PackedSolidBody) -> Result<Self, String> {
        validate_positive_finite(capacity_kg, "hopper capacity")?;
        let stored = body.total_mass_kg();
        if stored > capacity_kg + SOLID_MATERIAL_TOLERANCE {
            return Err(format!(
                "hopper initial contents ({stored} kg) exceed capacity ({capacity_kg} kg)"
            ));
        }
        Ok(Self { capacity_kg, body })
    }

    pub fn empty(capacity_kg: f64) -> Result<Self, String> {
        Self::new(capacity_kg, PackedSolidBody::empty())
    }

    pub fn capacity_kg(&self) -> f64 {
        self.capacity_kg
    }

    pub fn body(&self) -> &PackedSolidBody {
        &self.body
    }

    pub fn body_mut(&mut self) -> &mut PackedSolidBody {
        &mut self.body
    }

    pub fn stored_mass_kg(&self) -> f64 {
        self.body.total_mass_kg()
    }

    pub fn free_capacity_kg(&self) -> f64 {
        (self.capacity_kg - self.stored_mass_kg()).max(0.0)
    }

    /// Atomically receive a finite already-materialized body.
    pub fn receive_body(&mut self, incoming: &PackedSolidBody) -> Result<f64, String> {
        let incoming_mass = incoming.total_mass_kg();
        if incoming_mass <= SOLID_MATERIAL_TOLERANCE {
            return Ok(0.0);
        }
        if incoming_mass > self.free_capacity_kg() + SOLID_MATERIAL_TOLERANCE {
            return Err("hopper could not accept the requested material body atomically".to_string());
        }

        let mut staged = self.clone();
        staged
            .body
            .solid_state
            .add_scaled_from(incoming.solid_state(), 1.0)?;
        let next_enthalpy = staged.body.sensible_enthalpy_j + incoming.sensible_enthalpy_j();
        validate_finite(next_enthalpy, "hopper sensible enthalpy")?;
        staged.body.sensible_enthalpy_j = next_enthalpy;
        *self = staged;
        Ok(incoming_mass)
    }

    /// Receive continuous packed solid flow (quantities are kg/s), clipping only
    /// at finite storage capacity while preserving composition and specific energy.
    pub fn receive_flow(
        &mut self,
        flow: &PackedSolidState,
        dt: f64,
        specific_sensible_enthalpy_j_per_kg: f64,
    ) -> Result<f64, String> {
        validate_positive_finite(dt, "hopper receive dt")?;
        validate_finite(
            specific_sensible_enthalpy_j_per_kg,
            "flow specific sensible enthalpy",
        )?;
        let free = self.free_capacity_kg();
        if free <= SOLID_MATERIAL_TOLERANCE {
            return Ok(0.0);
        }
        let total_rate = flow.total_quantity();
        let requested = total_rate * dt;
        validate_non_negative_finite(requested, "requested inflow mass")?;
        if requested <= SOLID_MATERIAL_TOLERANCE || total_rate <= SOLID_MATERIAL_TOLERANCE {
            return Ok(0.0);
        }
        let accepted = requested.min(free);
        let seconds_of_flow = accepted / total_rate;

        let mut staged = self.clone();
        staged.body.solid_state.add_scaled_from(flow, seconds_of_flow)?;
        let energy = accepted * specific_sensible_enthalpy_j_per_kg;
        validate_finite(energy, "accepted sensible enthalpy")?;
        let next_enthalpy = staged.body.sensible_enthalpy_j + energy;
        validate_finite(next_enthalpy, "hopper sensible enthalpy")?;
        staged.body.sensible_enthalpy_j = next_enthalpy;
        *self = staged;
        Ok(accepted)
    }

    /// Withdraw a well-mixed body at a requested total mass rate.
    pub fn withdraw_rate(&mut self, requested_rate_kg_per_second: f64, dt: f64) -> Result<PackedWithdrawal, String> {
        validate_non_negative_finite(requested_rate_kg_per_second, "hopper withdrawal rate")?;
        validate_positive_finite(dt, "hopper withdrawal dt")?;
        let stored_before = self.stored_mass_kg();
        if stored_before <= SOLID_MATERIAL_TOLERANCE || requested_rate_kg_per_second <= SOLID_MATERIAL_TOLERANCE {
            return Ok(PackedWithdrawal {
                body: PackedSolidBody::empty(),
                actual_mass_kg: 0.0,
            });
        }

        let requested = requested_rate_kg_per_second * dt;
        validate_non_negative_finite(requested, "requested withdrawal mass")?;
        let mut staged = self.clone();
        let withdrawn_state = staged.body.solid_state.withdraw_quantity(requested)?;
        let actual = withdrawn_state.total_quantity();
        let energy_fraction = if stored_before <= SOLID_MATERIAL_TOLERANCE {
            0.0
        } else {
            actual / stored_before
        };
        let withdrawn_enthalpy = staged.body.sensible_enthalpy_j * energy_fraction;
        validate_finite(withdrawn_enthalpy, "withdrawn sensible enthalpy")?;
        staged.body.sensible_enthalpy_j -= withdrawn_enthalpy;
        if staged.body.sensible_enthalpy_j.abs() <= SOLID_MATERIAL_TOLERANCE {
            staged.body.sensible_enthalpy_j = 0.0;
        }
        *self = staged;
        Ok(PackedWithdrawal {
            body: PackedSolidBody::new(withdrawn_state, withdrawn_enthalpy)?,
            actual_mass_kg: actual,
        })
    }
}

/// Conservative packed storage-to-storage transfer. The source withdrawal and
/// destination receipt commit together or neither state changes.
pub fn transfer_between_hoppers(
    source: &mut PackedHopperState,
    target: &mut PackedHopperState,
    max_rate_kg_per_second: f64,
    dt: f64,
) -> Result<f64, String> {
    validate_non_negative_finite(max_rate_kg_per_second, "transfer rate")?;
    validate_positive_finite(dt, "transfer dt")?;
    let transferable = (max_rate_kg_per_second * dt)
        .min(source.stored_mass_kg())
        .min(target.free_capacity_kg());
    validate_non_negative_finite(transferable, "transferable mass")?;
    if transferable <= SOLID_MATERIAL_TOLERANCE {
        return Ok(0.0);
    }

    let mut staged_source = source.clone();
    let mut staged_target = target.clone();
    let withdrawal = staged_source.withdraw_rate(transferable / dt, dt)?;
    let accepted = staged_target.receive_body(&withdrawal.body)?;
    if (accepted - withdrawal.actual_mass_kg).abs()
        > SOLID_MATERIAL_TOLERANCE * accepted.max(withdrawal.actual_mass_kg).max(1.0)
    {
        return Err("packed storage transfer failed conservation check".to_string());
    }

    *source = staged_source;
    *target = staged_target;
    Ok(accepted)
}

fn validate_finite(value: f64, label: &str) -> Result<(), String> {
    if !value.is_finite() {
        return Err(format!("{label} must be finite"));
    }
    Ok(())
}

fn validate_non_negative_finite(value: f64, label: &str) -> Result<(), String> {
    validate_finite(value, label)?;
    if value < 0.0 {
        return Err(format!("{label} must be non-negative"));
    }
    Ok(())
}

fn validate_positive_finite(value: f64, label: &str) -> Result<(), String> {
    validate_finite(value, label)?;
    if value <= 0.0 {
        return Err(format!("{label} must be positive"));
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

    fn state(fractions: &[(FractionDescriptor, f64)]) -> PackedSolidState {
        let mut state = PackedSolidState::new();
        for (descriptor, quantity) in fractions {
            state.push_fraction(*descriptor, *quantity).unwrap();
        }
        state
    }

    fn descriptor(species_id: u16) -> FractionDescriptor {
        FractionDescriptor {
            species_id,
            size_bin_id: 2,
            liberation_class_id: 1,
            texture_profile_id: 0,
        }
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
    fn proportional_withdrawal_conserves_packed_populations() {
        let mut material = state(&[(descriptor(1), 30.0), (descriptor(2), 20.0)]);
        let withdrawn = material.withdraw_quantity(20.0).unwrap();
        assert!((withdrawn.total_quantity() - 20.0).abs() < 1e-12);
        assert!((material.total_quantity() - 30.0).abs() < 1e-12);
        let withdrawn_columns = withdrawn.to_columns();
        assert!((withdrawn_columns.quantities[0] - 12.0).abs() < 1e-12);
        assert!((withdrawn_columns.quantities[1] - 8.0).abs() < 1e-12);
    }

    #[test]
    fn hopper_receive_flow_clips_capacity_and_preserves_specific_energy() {
        let initial = PackedSolidBody::new(state(&[(descriptor(1), 20.0)]), 2_000.0).unwrap();
        let mut hopper = PackedHopperState::new(25.0, initial).unwrap();
        let flow = state(&[(descriptor(1), 4.0), (descriptor(2), 6.0)]);
        let accepted = hopper.receive_flow(&flow, 1.0, 300.0).unwrap();
        assert!((accepted - 5.0).abs() < 1e-12);
        assert!((hopper.stored_mass_kg() - 25.0).abs() < 1e-12);
        assert!((hopper.body().sensible_enthalpy_j() - 3_500.0).abs() < 1e-12);
    }

    #[test]
    fn storage_transfer_and_withdrawal_conserve_mass_and_enthalpy() {
        let source_body = PackedSolidBody::new(
            state(&[(descriptor(1), 30.0), (descriptor(2), 20.0)]),
            5_000.0,
        )
        .unwrap();
        let target_body = PackedSolidBody::new(state(&[(descriptor(1), 5.0)]), 1_000.0).unwrap();
        let mut source = PackedHopperState::new(100.0, source_body).unwrap();
        let mut target = PackedHopperState::new(40.0, target_body).unwrap();

        let mass_before = source.stored_mass_kg() + target.stored_mass_kg();
        let energy_before = source.body().sensible_enthalpy_j() + target.body().sensible_enthalpy_j();
        let transferred = transfer_between_hoppers(&mut source, &mut target, 20.0, 1.0).unwrap();
        assert!((transferred - 20.0).abs() < 1e-12);
        assert!((source.stored_mass_kg() - 30.0).abs() < 1e-12);
        assert!((target.stored_mass_kg() - 25.0).abs() < 1e-12);
        assert!((source.body().sensible_enthalpy_j() - 3_000.0).abs() < 1e-12);
        assert!((target.body().sensible_enthalpy_j() - 3_000.0).abs() < 1e-12);
        assert!((source.stored_mass_kg() + target.stored_mass_kg() - mass_before).abs() < 1e-12);
        assert!((source.body().sensible_enthalpy_j() + target.body().sensible_enthalpy_j() - energy_before).abs() < 1e-12);

        let withdrawal = target.withdraw_rate(10.0, 0.5).unwrap();
        assert!((withdrawal.actual_mass_kg - 5.0).abs() < 1e-12);
        assert!((withdrawal.body.sensible_enthalpy_j() - 600.0).abs() < 1e-12);
        assert!((target.stored_mass_kg() - 20.0).abs() < 1e-12);
        assert!((target.body().sensible_enthalpy_j() - 2_400.0).abs() < 1e-12);
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
        assert!(PackedHopperState::empty(0.0).is_err());
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
