use crate::{PackedSolidState, SOLID_MATERIAL_TOLERANCE};

pub const THERMAL_ENERGY_TOLERANCE_J: f64 = 1e-6;

/// Runtime-local thermal properties keyed by packed species ID.
///
/// Canonical species definitions remain the authoring source of truth. The
/// browser runtime compiler loads only the numeric values needed by the packed
/// execution core, so process kernels never depend on string IDs.
#[derive(Debug, Clone, Default)]
pub struct PackedSpeciesThermalTable {
    specific_heat_capacity_j_per_kg_k: Vec<Option<f64>>,
}

impl PackedSpeciesThermalTable {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_specific_heat_capacity_j_per_kg_k(
        &mut self,
        species_id: u16,
        value: f64,
    ) -> Result<(), String> {
        if !value.is_finite() || value <= 0.0 {
            return Err("specific heat capacity must be finite and positive".to_string());
        }
        let index = species_id as usize;
        if self.specific_heat_capacity_j_per_kg_k.len() <= index {
            self.specific_heat_capacity_j_per_kg_k
                .resize(index + 1, None);
        }
        self.specific_heat_capacity_j_per_kg_k[index] = Some(value);
        Ok(())
    }

    pub fn specific_heat_capacity_j_per_kg_k(&self, species_id: u16) -> Result<f64, String> {
        self.specific_heat_capacity_j_per_kg_k
            .get(species_id as usize)
            .and_then(|value| *value)
            .ok_or_else(|| {
                format!(
                    "Thermal property coverage missing for runtime species ID {species_id}"
                )
            })
    }

    pub fn heat_capacity_j_per_k(&self, state: &PackedSolidState) -> Result<f64, String> {
        let mut capacity = 0.0;
        for index in 0..state.len() {
            let quantity = state
                .quantity_at(index)
                .expect("packed material columns share one length");
            if quantity <= SOLID_MATERIAL_TOLERANCE {
                continue;
            }
            let descriptor = state
                .descriptor_at(index)
                .expect("packed material columns share one length");
            capacity += quantity
                * self.specific_heat_capacity_j_per_kg_k(descriptor.species_id)?;
        }
        if !capacity.is_finite() || capacity < 0.0 {
            return Err("packed material heat capacity must be finite and non-negative".to_string());
        }
        Ok(capacity)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::FractionDescriptor;

    #[test]
    fn packed_thermal_table_calculates_mixture_heat_capacity() {
        let mut table = PackedSpeciesThermalTable::new();
        table
            .set_specific_heat_capacity_j_per_kg_k(1, 500.0)
            .unwrap();
        table
            .set_specific_heat_capacity_j_per_kg_k(2, 1000.0)
            .unwrap();

        let mut state = PackedSolidState::new();
        state
            .push_fraction(
                FractionDescriptor {
                    species_id: 1,
                    size_bin_id: 1,
                    liberation_class_id: 1,
                    texture_profile_id: 0,
                },
                2.0,
            )
            .unwrap();
        state
            .push_fraction(
                FractionDescriptor {
                    species_id: 2,
                    size_bin_id: 1,
                    liberation_class_id: 1,
                    texture_profile_id: 0,
                },
                3.0,
            )
            .unwrap();

        assert!((table.heat_capacity_j_per_k(&state).unwrap() - 4000.0).abs() < 1e-12);
    }

    #[test]
    fn packed_thermal_table_rejects_missing_species_coverage() {
        let table = PackedSpeciesThermalTable::new();
        let mut state = PackedSolidState::new();
        state
            .push_fraction(
                FractionDescriptor {
                    species_id: 7,
                    size_bin_id: 1,
                    liberation_class_id: 1,
                    texture_profile_id: 0,
                },
                1.0,
            )
            .unwrap();
        assert!(table.heat_capacity_j_per_k(&state).is_err());
    }
}
