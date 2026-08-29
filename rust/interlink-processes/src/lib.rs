use interlink_core::{PackedHopperState, PackedSolidState, SOLID_MATERIAL_TOLERANCE};

pub const APPARATUS_TRANSFER_TOLERANCE_KG: f64 = 1e-8;

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PackedOperatingState {
    Off,
    Idle,
    Blocked,
    Running,
}

impl PackedOperatingState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::Idle => "idle",
            Self::Blocked => "blocked",
            Self::Running => "running",
        }
    }
}

/// Continuous solid material stream used by the packed execution runtime.
/// Quantities in `solid_state` are kg/s, while specific sensible enthalpy is J/kg.
/// The total rate is cached when the stream is replaced so presentation/runtime
/// queries do not have to rescan every population.
#[derive(Debug, Clone)]
pub struct PackedSolidStream {
    solid_state: PackedSolidState,
    specific_sensible_enthalpy_j_per_kg: f64,
    total_mass_flow_kg_per_second: f64,
}

impl Default for PackedSolidStream {
    fn default() -> Self {
        Self::new()
    }
}

impl PackedSolidStream {
    pub fn new() -> Self {
        Self {
            solid_state: PackedSolidState::new(),
            specific_sensible_enthalpy_j_per_kg: 0.0,
            total_mass_flow_kg_per_second: 0.0,
        }
    }

    pub fn from_state(
        solid_state: PackedSolidState,
        specific_sensible_enthalpy_j_per_kg: f64,
    ) -> Result<Self, String> {
        validate_finite(
            specific_sensible_enthalpy_j_per_kg,
            "stream specific sensible enthalpy",
        )?;
        let total_mass_flow_kg_per_second = solid_state.total_quantity();
        validate_non_negative_finite(total_mass_flow_kg_per_second, "stream total mass flow")?;
        Ok(Self {
            solid_state,
            specific_sensible_enthalpy_j_per_kg,
            total_mass_flow_kg_per_second,
        })
    }

    pub fn clear(&mut self) {
        self.solid_state.clear();
        self.specific_sensible_enthalpy_j_per_kg = 0.0;
        self.total_mass_flow_kg_per_second = 0.0;
    }

    pub fn set_flow(
        &mut self,
        solid_state: &PackedSolidState,
        specific_sensible_enthalpy_j_per_kg: f64,
    ) -> Result<(), String> {
        *self = Self::from_state(solid_state.clone(), specific_sensible_enthalpy_j_per_kg)?;
        Ok(())
    }

    pub fn solid_state(&self) -> &PackedSolidState {
        &self.solid_state
    }

    pub fn specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        self.specific_sensible_enthalpy_j_per_kg
    }

    pub fn total_mass_flow_kg_per_second(&self) -> f64 {
        self.total_mass_flow_kg_per_second
    }
}

#[derive(Debug, Clone, Copy)]
pub struct PackedFeederConfig {
    pub flow_rate_kg_per_second: f64,
    pub throughput_kg_per_second: f64,
    pub enabled: bool,
}

impl PackedFeederConfig {
    pub fn new(
        flow_rate_kg_per_second: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
    ) -> Result<Self, String> {
        validate_non_negative_finite(flow_rate_kg_per_second, "Feeder flow rate")?;
        validate_positive_finite(throughput_kg_per_second, "Feeder throughput")?;
        Ok(Self {
            flow_rate_kg_per_second,
            throughput_kg_per_second,
            enabled,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PackedFeederTickResult {
    pub operating_state: PackedOperatingState,
    pub transferred_mass_kg: f64,
    pub actual_rate_kg_per_second: f64,
}

/// Packed implementation of the current Hopper -> Feeder -> Hopper identity
/// process. This deliberately ports the existing behavior before more complex
/// apparatus kernels so streams, storage, backpressure and operating state have
/// one permanent Rust execution contract.
#[derive(Debug, Clone)]
pub struct PackedFeederRuntime {
    config: PackedFeederConfig,
    input_stream: PackedSolidStream,
    output_stream: PackedSolidStream,
    operating_state: PackedOperatingState,
    last_error: Option<String>,
}

impl PackedFeederRuntime {
    pub fn new(config: PackedFeederConfig) -> Self {
        Self {
            operating_state: if config.enabled {
                PackedOperatingState::Idle
            } else {
                PackedOperatingState::Off
            },
            config,
            input_stream: PackedSolidStream::new(),
            output_stream: PackedSolidStream::new(),
            last_error: None,
        }
    }

    pub fn config(&self) -> PackedFeederConfig {
        self.config
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.config.enabled = enabled;
        if !enabled {
            self.operating_state = PackedOperatingState::Off;
        } else if self.operating_state == PackedOperatingState::Off {
            self.operating_state = PackedOperatingState::Idle;
        }
    }

    pub fn set_flow_rate_kg_per_second(&mut self, value: f64) -> Result<(), String> {
        validate_non_negative_finite(value, "Feeder flow rate")?;
        self.config.flow_rate_kg_per_second = value;
        Ok(())
    }

    pub fn set_throughput_kg_per_second(&mut self, value: f64) -> Result<(), String> {
        validate_positive_finite(value, "Feeder throughput")?;
        self.config.throughput_kg_per_second = value;
        Ok(())
    }

    pub fn input_stream(&self) -> &PackedSolidStream {
        &self.input_stream
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
        operating_state: PackedOperatingState,
        transferred_mass_kg: f64,
        dt: f64,
    ) -> PackedFeederTickResult {
        self.operating_state = operating_state;
        PackedFeederTickResult {
            operating_state,
            transferred_mass_kg,
            actual_rate_kg_per_second: if transferred_mass_kg <= APPARATUS_TRANSFER_TOLERANCE_KG {
                0.0
            } else {
                transferred_mass_kg / dt
            },
        }
    }

    pub fn tick_hopper_to_hopper(
        &mut self,
        source: &mut PackedHopperState,
        target: &mut PackedHopperState,
        dt: f64,
    ) -> Result<PackedFeederTickResult, String> {
        validate_positive_finite(dt, "Feeder simulation dt")?;
        self.input_stream.clear();
        self.output_stream.clear();
        self.last_error = None;

        if !self.config.enabled {
            return Ok(self.finish(PackedOperatingState::Off, 0.0, dt));
        }

        let stored_mass_kg = source.stored_mass_kg();
        if stored_mass_kg <= SOLID_MATERIAL_TOLERANCE {
            return Ok(self.finish(PackedOperatingState::Idle, 0.0, dt));
        }

        if self.config.flow_rate_kg_per_second <= APPARATUS_TRANSFER_TOLERANCE_KG {
            return Ok(self.finish(PackedOperatingState::Idle, 0.0, dt));
        }

        let available_output_capacity_kg = target.free_capacity_kg();
        if available_output_capacity_kg <= APPARATUS_TRANSFER_TOLERANCE_KG {
            self.last_error = Some("Feeder product output is full".to_string());
            return Ok(self.finish(PackedOperatingState::Blocked, 0.0, dt));
        }

        let planned_rate = self
            .config
            .flow_rate_kg_per_second
            .min(self.config.throughput_kg_per_second)
            .min(stored_mass_kg / dt)
            .min(available_output_capacity_kg / dt);

        if planned_rate <= APPARATUS_TRANSFER_TOLERANCE_KG {
            return Ok(self.finish(PackedOperatingState::Idle, 0.0, dt));
        }

        // Stage both inventories so the identity process commits atomically.
        let mut staged_source = source.clone();
        let mut staged_target = target.clone();
        let withdrawal = staged_source.withdraw_rate(planned_rate, dt)?;
        if withdrawal.actual_mass_kg <= APPARATUS_TRANSFER_TOLERANCE_KG {
            return Ok(self.finish(PackedOperatingState::Idle, 0.0, dt));
        }

        let specific_sensible_enthalpy_j_per_kg =
            withdrawal.body.specific_sensible_enthalpy_j_per_kg();
        let actual_flow = withdrawal.body.solid_state().scaled(1.0 / dt)?;
        let accepted = staged_target.receive_flow(
            &actual_flow,
            dt,
            specific_sensible_enthalpy_j_per_kg,
        )?;
        let tolerance = APPARATUS_TRANSFER_TOLERANCE_KG
            * withdrawal.actual_mass_kg.max(1.0);
        if (accepted - withdrawal.actual_mass_kg).abs() > tolerance {
            return Err("Feeder product could not commit its planned output atomically".to_string());
        }

        *source = staged_source;
        *target = staged_target;
        self.input_stream
            .set_flow(&actual_flow, specific_sensible_enthalpy_j_per_kg)?;
        self.output_stream
            .set_flow(&actual_flow, specific_sensible_enthalpy_j_per_kg)?;
        Ok(self.finish(
            PackedOperatingState::Running,
            withdrawal.actual_mass_kg,
            dt,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use interlink_core::{FractionDescriptor, PackedSolidBody};

    fn source_hopper() -> PackedHopperState {
        let mut state = PackedSolidState::new();
        state
            .push_fraction(
                FractionDescriptor {
                    species_id: 1,
                    size_bin_id: 4,
                    liberation_class_id: 2,
                    texture_profile_id: 0,
                },
                60.0,
            )
            .unwrap();
        state
            .push_fraction(
                FractionDescriptor {
                    species_id: 2,
                    size_bin_id: 4,
                    liberation_class_id: 2,
                    texture_profile_id: 0,
                },
                40.0,
            )
            .unwrap();
        PackedHopperState::new(200.0, PackedSolidBody::new(state, 10_000.0).unwrap()).unwrap()
    }

    #[test]
    fn feeder_identity_process_preserves_mass_composition_energy_and_streams() {
        let mut source = source_hopper();
        let mut target = PackedHopperState::empty(100.0).unwrap();
        let config = PackedFeederConfig::new(5.0, 8.0, true).unwrap();
        let mut feeder = PackedFeederRuntime::new(config);

        let result = feeder
            .tick_hopper_to_hopper(&mut source, &mut target, 0.1)
            .unwrap();

        assert_eq!(result.operating_state, PackedOperatingState::Running);
        assert!((result.transferred_mass_kg - 0.5).abs() < 1e-12);
        assert!((source.stored_mass_kg() - 99.5).abs() < 1e-12);
        assert!((target.stored_mass_kg() - 0.5).abs() < 1e-12);
        assert!((source.body().sensible_enthalpy_j() - 9_950.0).abs() < 1e-10);
        assert!((target.body().sensible_enthalpy_j() - 50.0).abs() < 1e-10);
        assert!((feeder.input_stream().total_mass_flow_kg_per_second() - 5.0).abs() < 1e-12);
        assert!((feeder.output_stream().total_mass_flow_kg_per_second() - 5.0).abs() < 1e-12);
        assert!((feeder.output_stream().specific_sensible_enthalpy_j_per_kg() - 100.0).abs() < 1e-12);

        let output = feeder.output_stream().solid_state().to_columns();
        assert_eq!(output.quantities.len(), 2);
        assert!((output.quantities[0] - 3.0).abs() < 1e-12);
        assert!((output.quantities[1] - 2.0).abs() < 1e-12);
    }

    #[test]
    fn feeder_respects_downstream_capacity_and_then_reports_blocked() {
        let mut source = source_hopper();
        let mut target = PackedHopperState::empty(0.2).unwrap();
        let config = PackedFeederConfig::new(5.0, 8.0, true).unwrap();
        let mut feeder = PackedFeederRuntime::new(config);

        let first = feeder
            .tick_hopper_to_hopper(&mut source, &mut target, 0.1)
            .unwrap();
        assert_eq!(first.operating_state, PackedOperatingState::Running);
        assert!((first.transferred_mass_kg - 0.2).abs() < 1e-12);
        assert!((feeder.output_stream().total_mass_flow_kg_per_second() - 2.0).abs() < 1e-12);

        let second = feeder
            .tick_hopper_to_hopper(&mut source, &mut target, 0.1)
            .unwrap();
        assert_eq!(second.operating_state, PackedOperatingState::Blocked);
        assert_eq!(feeder.last_error(), Some("Feeder product output is full"));
        assert_eq!(feeder.output_stream().total_mass_flow_kg_per_second(), 0.0);
    }

    #[test]
    fn disabled_feeder_clears_streams_and_does_not_move_inventory() {
        let mut source = source_hopper();
        let mut target = PackedHopperState::empty(100.0).unwrap();
        let config = PackedFeederConfig::new(5.0, 8.0, true).unwrap();
        let mut feeder = PackedFeederRuntime::new(config);
        feeder
            .tick_hopper_to_hopper(&mut source, &mut target, 0.1)
            .unwrap();
        feeder.set_enabled(false);

        let result = feeder
            .tick_hopper_to_hopper(&mut source, &mut target, 0.1)
            .unwrap();
        assert_eq!(result.operating_state, PackedOperatingState::Off);
        assert_eq!(feeder.input_stream().total_mass_flow_kg_per_second(), 0.0);
        assert_eq!(feeder.output_stream().total_mass_flow_kg_per_second(), 0.0);
        assert!((source.stored_mass_kg() - 99.5).abs() < 1e-12);
        assert!((target.stored_mass_kg() - 0.5).abs() < 1e-12);
    }
}
