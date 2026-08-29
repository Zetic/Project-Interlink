use interlink_core::{
    PackedHopperState, PackedSolidBody, PackedSolidState, SOLID_MATERIAL_TOLERANCE,
};

use super::{
    validate_finite, validate_positive_finite, APPARATUS_TRANSFER_TOLERANCE_KG,
    PackedOperatingState, PackedSolidStream,
};

const THERMAL_ENERGY_TOLERANCE_J: f64 = 1e-6;

/// Runtime-local constant-Cp lookup keyed by packed species ID.
/// Canonical species definitions remain authoritative; the browser compiler
/// loads their numeric Cp values into this table after assigning runtime IDs.
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
            self.specific_heat_capacity_j_per_kg_k.resize(index + 1, None);
        }
        self.specific_heat_capacity_j_per_kg_k[index] = Some(value);
        Ok(())
    }

    pub fn specific_heat_capacity_j_per_kg_k(&self, species_id: u16) -> Result<f64, String> {
        self.specific_heat_capacity_j_per_kg_k
            .get(species_id as usize)
            .and_then(|value| *value)
            .ok_or_else(|| {
                format!("Thermal property coverage missing for runtime species ID {species_id}")
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

fn output_specific_sensible_enthalpies(
    input_bodies: &[&PackedSolidBody],
    output_states: &[&PackedSolidState],
    thermal: &PackedSpeciesThermalTable,
) -> Result<Vec<f64>, String> {
    let total_input_sensible_enthalpy_j: f64 = input_bodies
        .iter()
        .map(|body| body.sensible_enthalpy_j())
        .sum();
    validate_finite(total_input_sensible_enthalpy_j, "total input sensible enthalpy")?;
    if total_input_sensible_enthalpy_j.abs() <= THERMAL_ENERGY_TOLERANCE_J {
        return Ok(vec![0.0; output_states.len()]);
    }

    let mut total_input_heat_capacity_j_per_k = 0.0;
    for body in input_bodies {
        total_input_heat_capacity_j_per_k += thermal.heat_capacity_j_per_k(body.solid_state())?;
    }
    if !total_input_heat_capacity_j_per_k.is_finite() || total_input_heat_capacity_j_per_k <= 0.0 {
        return Err("input thermal heat capacity must be finite and positive".to_string());
    }

    // Equivalent to the current JS constant-Cp reference-temperature model:
    // deltaT = sensible enthalpy / heat capacity. The reference temperature
    // cancels when deriving output specific sensible enthalpy.
    let delta_temperature_k =
        total_input_sensible_enthalpy_j / total_input_heat_capacity_j_per_k;

    output_states
        .iter()
        .map(|state| {
            let mass_rate = state.total_quantity();
            if mass_rate <= SOLID_MATERIAL_TOLERANCE {
                return Ok(0.0);
            }
            let output_heat_capacity_per_second = thermal.heat_capacity_j_per_k(state)?;
            let specific = delta_temperature_k * output_heat_capacity_per_second / mass_rate;
            validate_finite(specific, "output specific sensible enthalpy")?;
            Ok(specific)
        })
        .collect()
}

fn assert_accepted(expected: f64, accepted: f64, context: &str) -> Result<(), String> {
    let tolerance = APPARATUS_TRANSFER_TOLERANCE_KG * expected.max(1.0);
    if (expected - accepted).abs() > tolerance {
        return Err(format!("{context} could not commit its planned output atomically"));
    }
    Ok(())
}

#[derive(Debug, Clone, Copy)]
pub struct PackedSplitterConfig {
    pub split_fraction_to_a: f64,
    pub throughput_kg_per_second: f64,
    pub enabled: bool,
}

impl PackedSplitterConfig {
    pub fn new(
        split_fraction_to_a: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
    ) -> Result<Self, String> {
        if !split_fraction_to_a.is_finite() || !(0.0..=1.0).contains(&split_fraction_to_a) {
            return Err("Splitter split fraction must be finite and within [0, 1]".to_string());
        }
        validate_positive_finite(throughput_kg_per_second, "Splitter throughput")?;
        Ok(Self {
            split_fraction_to_a,
            throughput_kg_per_second,
            enabled,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PackedSplitterTickResult {
    pub operating_state: PackedOperatingState,
    pub transferred_mass_kg: f64,
    pub output_a_mass_kg: f64,
    pub output_b_mass_kg: f64,
}

#[derive(Debug, Clone)]
pub struct PackedSplitterRuntime {
    config: PackedSplitterConfig,
    input_stream: PackedSolidStream,
    output_a_stream: PackedSolidStream,
    output_b_stream: PackedSolidStream,
    operating_state: PackedOperatingState,
    last_error: Option<String>,
}

impl PackedSplitterRuntime {
    pub fn new(config: PackedSplitterConfig) -> Self {
        Self {
            operating_state: if config.enabled {
                PackedOperatingState::Idle
            } else {
                PackedOperatingState::Off
            },
            config,
            input_stream: PackedSolidStream::new(),
            output_a_stream: PackedSolidStream::new(),
            output_b_stream: PackedSolidStream::new(),
            last_error: None,
        }
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.config.enabled = enabled;
        if !enabled {
            self.operating_state = PackedOperatingState::Off;
        } else if self.operating_state == PackedOperatingState::Off {
            self.operating_state = PackedOperatingState::Idle;
        }
    }

    pub fn input_stream(&self) -> &PackedSolidStream {
        &self.input_stream
    }

    pub fn output_a_stream(&self) -> &PackedSolidStream {
        &self.output_a_stream
    }

    pub fn output_b_stream(&self) -> &PackedSolidStream {
        &self.output_b_stream
    }

    pub fn operating_state(&self) -> PackedOperatingState {
        self.operating_state
    }

    pub fn last_error(&self) -> Option<&str> {
        self.last_error.as_deref()
    }

    fn finish(
        &mut self,
        state: PackedOperatingState,
        transferred_mass_kg: f64,
        output_a_mass_kg: f64,
        output_b_mass_kg: f64,
    ) -> PackedSplitterTickResult {
        self.operating_state = state;
        PackedSplitterTickResult {
            operating_state: state,
            transferred_mass_kg,
            output_a_mass_kg,
            output_b_mass_kg,
        }
    }

    pub fn tick_hopper_to_hoppers(
        &mut self,
        source: &mut PackedHopperState,
        output_a: &mut PackedHopperState,
        output_b: &mut PackedHopperState,
        thermal: &PackedSpeciesThermalTable,
        dt: f64,
    ) -> Result<PackedSplitterTickResult, String> {
        validate_positive_finite(dt, "Splitter simulation dt")?;
        self.input_stream.clear();
        self.output_a_stream.clear();
        self.output_b_stream.clear();
        self.last_error = None;

        if !self.config.enabled {
            return Ok(self.finish(PackedOperatingState::Off, 0.0, 0.0, 0.0));
        }

        let stored_mass_kg = source.stored_mass_kg();
        if stored_mass_kg <= SOLID_MATERIAL_TOLERANCE {
            return Ok(self.finish(PackedOperatingState::Idle, 0.0, 0.0, 0.0));
        }

        let candidate_rate = self
            .config
            .throughput_kg_per_second
            .min(stored_mass_kg / dt);
        let requested_a_kg = candidate_rate * self.config.split_fraction_to_a * dt;
        let requested_b_kg = candidate_rate * (1.0 - self.config.split_fraction_to_a) * dt;
        let scale_a = if requested_a_kg <= APPARATUS_TRANSFER_TOLERANCE_KG {
            1.0
        } else {
            output_a.free_capacity_kg() / requested_a_kg
        };
        let scale_b = if requested_b_kg <= APPARATUS_TRANSFER_TOLERANCE_KG {
            1.0
        } else {
            output_b.free_capacity_kg() / requested_b_kg
        };
        let capacity_scale = 1.0_f64.min(scale_a).min(scale_b).max(0.0);
        if capacity_scale <= APPARATUS_TRANSFER_TOLERANCE_KG {
            self.last_error = Some("One or more required Splitter outputs are full".to_string());
            return Ok(self.finish(PackedOperatingState::Blocked, 0.0, 0.0, 0.0));
        }

        let planned_rate = candidate_rate * capacity_scale;
        let mut staged_source = source.clone();
        let mut staged_a = output_a.clone();
        let mut staged_b = output_b.clone();
        let withdrawal = staged_source.withdraw_rate(planned_rate, dt)?;
        if withdrawal.actual_mass_kg <= APPARATUS_TRANSFER_TOLERANCE_KG {
            return Ok(self.finish(PackedOperatingState::Idle, 0.0, 0.0, 0.0));
        }

        let actual_feed = withdrawal.body.solid_state().scaled(1.0 / dt)?;
        let output_a_flow = actual_feed.scaled(self.config.split_fraction_to_a)?;
        let output_b_flow = actual_feed.scaled(1.0 - self.config.split_fraction_to_a)?;
        let output_specific = output_specific_sensible_enthalpies(
            &[&withdrawal.body],
            &[&output_a_flow, &output_b_flow],
            thermal,
        )?;

        let expected_a_kg = output_a_flow.total_quantity() * dt;
        let expected_b_kg = output_b_flow.total_quantity() * dt;
        let accepted_a = staged_a.receive_flow(&output_a_flow, dt, output_specific[0])?;
        assert_accepted(expected_a_kg, accepted_a, "Splitter output A")?;
        let accepted_b = staged_b.receive_flow(&output_b_flow, dt, output_specific[1])?;
        assert_accepted(expected_b_kg, accepted_b, "Splitter output B")?;

        *source = staged_source;
        *output_a = staged_a;
        *output_b = staged_b;
        self.input_stream.set_flow(
            &actual_feed,
            withdrawal.body.specific_sensible_enthalpy_j_per_kg(),
        )?;
        self.output_a_stream
            .set_flow(&output_a_flow, output_specific[0])?;
        self.output_b_stream
            .set_flow(&output_b_flow, output_specific[1])?;
        Ok(self.finish(
            PackedOperatingState::Running,
            withdrawal.actual_mass_kg,
            accepted_a,
            accepted_b,
        ))
    }
}

#[derive(Debug, Clone, Copy)]
pub struct PackedMergerConfig {
    pub throughput_kg_per_second: f64,
    pub enabled: bool,
}

impl PackedMergerConfig {
    pub fn new(throughput_kg_per_second: f64, enabled: bool) -> Result<Self, String> {
        validate_positive_finite(throughput_kg_per_second, "Material Merger throughput")?;
        Ok(Self {
            throughput_kg_per_second,
            enabled,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PackedMergerTickResult {
    pub operating_state: PackedOperatingState,
    pub input_a_mass_kg: f64,
    pub input_b_mass_kg: f64,
    pub output_mass_kg: f64,
}

#[derive(Debug, Clone)]
pub struct PackedMergerRuntime {
    config: PackedMergerConfig,
    input_a_stream: PackedSolidStream,
    input_b_stream: PackedSolidStream,
    output_stream: PackedSolidStream,
    operating_state: PackedOperatingState,
    last_error: Option<String>,
}

impl PackedMergerRuntime {
    pub fn new(config: PackedMergerConfig) -> Self {
        Self {
            operating_state: if config.enabled {
                PackedOperatingState::Idle
            } else {
                PackedOperatingState::Off
            },
            config,
            input_a_stream: PackedSolidStream::new(),
            input_b_stream: PackedSolidStream::new(),
            output_stream: PackedSolidStream::new(),
            last_error: None,
        }
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.config.enabled = enabled;
        if !enabled {
            self.operating_state = PackedOperatingState::Off;
        } else if self.operating_state == PackedOperatingState::Off {
            self.operating_state = PackedOperatingState::Idle;
        }
    }

    pub fn input_a_stream(&self) -> &PackedSolidStream {
        &self.input_a_stream
    }

    pub fn input_b_stream(&self) -> &PackedSolidStream {
        &self.input_b_stream
    }

    pub fn output_stream(&self) -> &PackedSolidStream {
        &self.output_stream
    }

    pub fn operating_state(&self) -> PackedOperatingState {
        self.operating_state
    }

    pub fn last_error(&self) -> Option<&str> {
        self.last_error.as_deref()
    }

    fn finish(
        &mut self,
        state: PackedOperatingState,
        input_a_mass_kg: f64,
        input_b_mass_kg: f64,
        output_mass_kg: f64,
    ) -> PackedMergerTickResult {
        self.operating_state = state;
        PackedMergerTickResult {
            operating_state: state,
            input_a_mass_kg,
            input_b_mass_kg,
            output_mass_kg,
        }
    }

    pub fn tick_hoppers_to_hopper(
        &mut self,
        input_a: &mut PackedHopperState,
        input_b: &mut PackedHopperState,
        output: &mut PackedHopperState,
        thermal: &PackedSpeciesThermalTable,
        dt: f64,
    ) -> Result<PackedMergerTickResult, String> {
        validate_positive_finite(dt, "Material Merger simulation dt")?;
        self.input_a_stream.clear();
        self.input_b_stream.clear();
        self.output_stream.clear();
        self.last_error = None;

        if !self.config.enabled {
            return Ok(self.finish(PackedOperatingState::Off, 0.0, 0.0, 0.0));
        }

        let stored_a = input_a.stored_mass_kg();
        let stored_b = input_b.stored_mass_kg();
        let total_stored = stored_a + stored_b;
        if total_stored <= SOLID_MATERIAL_TOLERANCE {
            return Ok(self.finish(PackedOperatingState::Idle, 0.0, 0.0, 0.0));
        }

        let candidate_total_rate = self
            .config
            .throughput_kg_per_second
            .min(total_stored / dt);
        let candidate_rate_a = candidate_total_rate * (stored_a / total_stored);
        let candidate_rate_b = candidate_total_rate * (stored_b / total_stored);
        let requested_output_kg = candidate_total_rate * dt;
        let capacity_scale = if requested_output_kg <= APPARATUS_TRANSFER_TOLERANCE_KG {
            1.0
        } else {
            (output.free_capacity_kg() / requested_output_kg)
                .min(1.0)
                .max(0.0)
        };
        if capacity_scale <= APPARATUS_TRANSFER_TOLERANCE_KG {
            self.last_error = Some("Material Merger product output is full".to_string());
            return Ok(self.finish(PackedOperatingState::Blocked, 0.0, 0.0, 0.0));
        }

        let planned_rate_a = candidate_rate_a * capacity_scale;
        let planned_rate_b = candidate_rate_b * capacity_scale;
        let mut staged_a = input_a.clone();
        let mut staged_b = input_b.clone();
        let mut staged_output = output.clone();
        let withdrawal_a = staged_a.withdraw_rate(planned_rate_a, dt)?;
        let withdrawal_b = staged_b.withdraw_rate(planned_rate_b, dt)?;
        let total_withdrawn = withdrawal_a.actual_mass_kg + withdrawal_b.actual_mass_kg;
        if total_withdrawn <= APPARATUS_TRANSFER_TOLERANCE_KG {
            return Ok(self.finish(PackedOperatingState::Idle, 0.0, 0.0, 0.0));
        }

        let actual_a = withdrawal_a.body.solid_state().scaled(1.0 / dt)?;
        let actual_b = withdrawal_b.body.solid_state().scaled(1.0 / dt)?;
        let mut product = actual_a.clone();
        product.add_scaled_from(&actual_b, 1.0)?;
        let product_specific = output_specific_sensible_enthalpies(
            &[&withdrawal_a.body, &withdrawal_b.body],
            &[&product],
            thermal,
        )?[0];
        let expected_output_kg = product.total_quantity() * dt;
        let accepted_output = staged_output.receive_flow(&product, dt, product_specific)?;
        assert_accepted(expected_output_kg, accepted_output, "Material Merger product")?;

        *input_a = staged_a;
        *input_b = staged_b;
        *output = staged_output;
        self.input_a_stream.set_flow(
            &actual_a,
            withdrawal_a.body.specific_sensible_enthalpy_j_per_kg(),
        )?;
        self.input_b_stream.set_flow(
            &actual_b,
            withdrawal_b.body.specific_sensible_enthalpy_j_per_kg(),
        )?;
        self.output_stream.set_flow(&product, product_specific)?;
        Ok(self.finish(
            PackedOperatingState::Running,
            withdrawal_a.actual_mass_kg,
            withdrawal_b.actual_mass_kg,
            accepted_output,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use interlink_core::{FractionDescriptor, PackedSolidBody};

    fn hopper_with(
        species_id: u16,
        mass_kg: f64,
        sensible_enthalpy_j: f64,
        capacity_kg: f64,
    ) -> PackedHopperState {
        let mut state = PackedSolidState::new();
        state
            .push_fraction(
                FractionDescriptor {
                    species_id,
                    size_bin_id: 1,
                    liberation_class_id: 1,
                    texture_profile_id: 0,
                },
                mass_kg,
            )
            .unwrap();
        PackedHopperState::new(
            capacity_kg,
            PackedSolidBody::new(state, sensible_enthalpy_j).unwrap(),
        )
        .unwrap()
    }

    fn thermal_table() -> PackedSpeciesThermalTable {
        let mut table = PackedSpeciesThermalTable::new();
        table
            .set_specific_heat_capacity_j_per_kg_k(1, 500.0)
            .unwrap();
        table
            .set_specific_heat_capacity_j_per_kg_k(2, 1000.0)
            .unwrap();
        table
    }

    #[test]
    fn splitter_routes_mass_energy_and_streams_conservatively() {
        let mut source = hopper_with(1, 100.0, 10_000.0, 200.0);
        let mut output_a = PackedHopperState::empty(100.0).unwrap();
        let mut output_b = PackedHopperState::empty(100.0).unwrap();
        let config = PackedSplitterConfig::new(0.25, 8.0, true).unwrap();
        let mut splitter = PackedSplitterRuntime::new(config);
        let result = splitter
            .tick_hopper_to_hoppers(
                &mut source,
                &mut output_a,
                &mut output_b,
                &thermal_table(),
                0.1,
            )
            .unwrap();

        assert_eq!(result.operating_state, PackedOperatingState::Running);
        assert!((result.transferred_mass_kg - 0.8).abs() < 1e-12);
        assert!((result.output_a_mass_kg - 0.2).abs() < 1e-12);
        assert!((result.output_b_mass_kg - 0.6).abs() < 1e-12);
        assert!((source.stored_mass_kg() - 99.2).abs() < 1e-12);
        assert!((output_a.stored_mass_kg() - 0.2).abs() < 1e-12);
        assert!((output_b.stored_mass_kg() - 0.6).abs() < 1e-12);
        assert!((output_a.body().sensible_enthalpy_j() - 20.0).abs() < 1e-9);
        assert!((output_b.body().sensible_enthalpy_j() - 60.0).abs() < 1e-9);
        assert!((splitter.input_stream().total_mass_flow_kg_per_second() - 8.0).abs() < 1e-12);
        assert!((splitter.output_a_stream().total_mass_flow_kg_per_second() - 2.0).abs() < 1e-12);
        assert!((splitter.output_b_stream().total_mass_flow_kg_per_second() - 6.0).abs() < 1e-12);
    }

    #[test]
    fn splitter_throttles_all_outputs_by_the_tightest_capacity() {
        let mut source = hopper_with(1, 100.0, 0.0, 200.0);
        let mut output_a = PackedHopperState::empty(0.1).unwrap();
        let mut output_b = PackedHopperState::empty(100.0).unwrap();
        let mut splitter = PackedSplitterRuntime::new(
            PackedSplitterConfig::new(0.5, 10.0, true).unwrap(),
        );
        let result = splitter
            .tick_hopper_to_hoppers(
                &mut source,
                &mut output_a,
                &mut output_b,
                &thermal_table(),
                0.1,
            )
            .unwrap();
        assert!((result.transferred_mass_kg - 0.2).abs() < 1e-12);
        assert!((output_a.stored_mass_kg() - 0.1).abs() < 1e-12);
        assert!((output_b.stored_mass_kg() - 0.1).abs() < 1e-12);
    }

    #[test]
    fn merger_mixes_different_species_and_thermal_states_at_equilibrium() {
        let mut input_a = hopper_with(1, 10.0, 5_000.0, 20.0);
        let mut input_b = hopper_with(2, 10.0, 20_000.0, 20.0);
        let mut output = PackedHopperState::empty(20.0).unwrap();
        let mut merger = PackedMergerRuntime::new(
            PackedMergerConfig::new(10.0, true).unwrap(),
        );
        let before_energy = input_a.body().sensible_enthalpy_j()
            + input_b.body().sensible_enthalpy_j();
        let result = merger
            .tick_hoppers_to_hopper(
                &mut input_a,
                &mut input_b,
                &mut output,
                &thermal_table(),
                0.1,
            )
            .unwrap();

        assert_eq!(result.operating_state, PackedOperatingState::Running);
        assert!((result.input_a_mass_kg - 0.5).abs() < 1e-12);
        assert!((result.input_b_mass_kg - 0.5).abs() < 1e-12);
        assert!((result.output_mass_kg - 1.0).abs() < 1e-12);
        let after_energy = input_a.body().sensible_enthalpy_j()
            + input_b.body().sensible_enthalpy_j()
            + output.body().sensible_enthalpy_j();
        assert!((before_energy - after_energy).abs() < 1e-9);
        assert!((merger.output_stream().total_mass_flow_kg_per_second() - 10.0).abs() < 1e-12);
        let columns = merger.output_stream().solid_state().to_columns();
        assert_eq!(columns.quantities.len(), 2);
        assert!((columns.quantities[0] - 5.0).abs() < 1e-12);
        assert!((columns.quantities[1] - 5.0).abs() < 1e-12);
    }
}
