use std::collections::HashMap;

use interlink_core::{
    FractionDescriptor, PackedHopperState, PackedSolidBody, PackedSolidState,
    SOLID_MATERIAL_TOLERANCE,
};
use interlink_processes::{
    PackedOperatingState, PackedSolidStream, APPARATUS_TRANSFER_TOLERANCE_KG,
};
use interlink_routing::PackedSpeciesThermalTable;

const PARTITION_CONSERVATION_TOLERANCE: f64 = 1e-9;
const THERMAL_ENERGY_TOLERANCE_J: f64 = 1e-6;
const MAGNETIC_SEPARATOR_BASE_CARRYOVER: f64 = 0.02;

fn validate_finite(value: f64, label: &str) -> Result<(), String> {
    if !value.is_finite() {
        return Err(format!("{label} must be finite"));
    }
    Ok(())
}

fn validate_positive_finite(value: f64, label: &str) -> Result<(), String> {
    validate_finite(value, label)?;
    if value <= 0.0 {
        return Err(format!("{label} must be finite and positive"));
    }
    Ok(())
}

fn validate_unit_interval(value: f64, label: &str) -> Result<(), String> {
    validate_finite(value, label)?;
    if !(0.0..=1.0).contains(&value) {
        return Err(format!("{label} must be within [0, 1]"));
    }
    Ok(())
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PackedSeparationSizeBin {
    pub max_mm: f64,
    pub magnetic_suitability: f64,
}

/// Runtime-local property tables needed by classification/separation kernels.
/// Canonical strings remain outside the execution plane; the hot path sees only
/// compact material IDs and numeric physical/process properties.
#[derive(Debug, Clone, Default)]
pub struct PackedSeparationTables {
    size_bins: HashMap<u8, PackedSeparationSizeBin>,
    liberation_recovery_factors: HashMap<u8, f64>,
    species_magnetic_responses: HashMap<u16, f64>,
}

impl PackedSeparationTables {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_size_bin(
        &mut self,
        runtime_id: u8,
        max_mm: f64,
        magnetic_suitability: f64,
    ) -> Result<(), String> {
        if max_mm.is_nan() || max_mm <= 0.0 {
            return Err("particle-size max must be positive or infinity".to_string());
        }
        validate_unit_interval(magnetic_suitability, "magnetic particle-size suitability")?;
        self.size_bins.insert(
            runtime_id,
            PackedSeparationSizeBin {
                max_mm,
                magnetic_suitability,
            },
        );
        Ok(())
    }

    pub fn add_liberation_class(
        &mut self,
        runtime_id: u8,
        recovery_factor: f64,
    ) -> Result<(), String> {
        validate_unit_interval(recovery_factor, "liberation recovery factor")?;
        self.liberation_recovery_factors
            .insert(runtime_id, recovery_factor);
        Ok(())
    }

    pub fn set_species_magnetic_response(
        &mut self,
        runtime_id: u16,
        normalized_separation_coefficient: f64,
    ) -> Result<(), String> {
        validate_unit_interval(
            normalized_separation_coefficient,
            "normalized magnetic separation coefficient",
        )?;
        self.species_magnetic_responses
            .insert(runtime_id, normalized_separation_coefficient);
        Ok(())
    }

    pub fn size_bin(&self, runtime_id: u8) -> Result<PackedSeparationSizeBin, String> {
        self.size_bins
            .get(&runtime_id)
            .copied()
            .ok_or_else(|| format!("Missing packed particle-size bin {runtime_id}"))
    }

    pub fn liberation_recovery_factor(&self, runtime_id: u8) -> Result<f64, String> {
        self.liberation_recovery_factors
            .get(&runtime_id)
            .copied()
            .ok_or_else(|| format!("Missing packed liberation class {runtime_id}"))
    }

    pub fn species_magnetic_response(&self, runtime_id: u16) -> Result<f64, String> {
        self.species_magnetic_responses
            .get(&runtime_id)
            .copied()
            .ok_or_else(|| {
                format!(
                    "Magnetic Separator does not support runtime species {runtime_id} without magnetic response data"
                )
            })
    }
}

#[derive(Debug, Clone)]
pub struct PackedPartitionResult {
    pub output_a: PackedSolidState,
    pub output_b: PackedSolidState,
}

/// Reusable conservative two-way partition primitive. The callback returns the
/// fraction of one packed population routed to output A; the residual is routed
/// to B without changing species, size, liberation, or texture identity.
pub fn partition_solid_state_by_share<F>(
    feed: &PackedSolidState,
    mut share_to_a: F,
) -> Result<PackedPartitionResult, String>
where
    F: FnMut(FractionDescriptor) -> Result<f64, String>,
{
    let mut output_a = PackedSolidState::new();
    let mut output_b = PackedSolidState::new();

    for index in 0..feed.len() {
        let descriptor = feed
            .descriptor_at(index)
            .expect("packed fraction columns share one length");
        let quantity = feed
            .quantity_at(index)
            .expect("packed fraction columns share one length");
        let share = share_to_a(descriptor)?;
        validate_unit_interval(share, "partition share")?;
        let quantity_a = quantity * share;
        let quantity_b = quantity - quantity_a;
        output_a.push_fraction(descriptor, quantity_a)?;
        output_b.push_fraction(descriptor, quantity_b)?;
    }

    let input_quantity = feed.total_quantity();
    let output_quantity = output_a.total_quantity() + output_b.total_quantity();
    if (input_quantity - output_quantity).abs()
        > PARTITION_CONSERVATION_TOLERANCE * input_quantity.max(1.0)
    {
        return Err("partition violated solid-matter conservation".to_string());
    }

    Ok(PackedPartitionResult { output_a, output_b })
}

/// Exact packed equivalent of the production ideal sharp-cut Screen physics.
pub fn split_screened_solid_state(
    feed: &PackedSolidState,
    aperture_size_mm: f64,
    tables: &PackedSeparationTables,
) -> Result<PackedPartitionResult, String> {
    validate_positive_finite(aperture_size_mm, "Screen apertureSizeMm")?;
    partition_solid_state_by_share(feed, |descriptor| {
        Ok(if tables.size_bin(descriptor.size_bin_id)?.max_mm <= aperture_size_mm {
            1.0
        } else {
            0.0
        })
    })
}

pub fn magnetic_recovery_for_fraction(
    descriptor: FractionDescriptor,
    field_strength: f64,
    tables: &PackedSeparationTables,
) -> Result<f64, String> {
    validate_unit_interval(field_strength, "Magnetic Separator fieldStrength")?;
    let size_suitability = tables.size_bin(descriptor.size_bin_id)?.magnetic_suitability;
    let magnetic_response = tables.species_magnetic_response(descriptor.species_id)?;
    let liberation_recovery =
        tables.liberation_recovery_factor(descriptor.liberation_class_id)?;
    let field_curve = 0.15 + 0.85 * field_strength;
    let magnetic_recovery =
        magnetic_response * liberation_recovery * size_suitability * field_curve;
    let entrainment = MAGNETIC_SEPARATOR_BASE_CARRYOVER
        * size_suitability
        * (0.25 + 0.75 * field_strength);
    Ok(clamp(magnetic_recovery + entrainment, 0.0, 1.0))
}

/// Packed equivalent of the production magnetic-separation physics, including
/// feed-size rejection, liberation-dependent recovery, field response, particle
/// size suitability, and non-magnetic carryover/entrainment.
pub fn split_magnetic_solid_state(
    feed: &PackedSolidState,
    field_strength: f64,
    max_feed_particle_size_mm: f64,
    tables: &PackedSeparationTables,
) -> Result<PackedPartitionResult, String> {
    validate_unit_interval(field_strength, "Magnetic Separator fieldStrength")?;
    validate_positive_finite(
        max_feed_particle_size_mm,
        "Magnetic Separator max feed particle size",
    )?;

    let total = feed.total_quantity();
    let mut oversized = 0.0;
    let mut largest_runtime_bin: Option<(u8, f64)> = None;
    for index in 0..feed.len() {
        let descriptor = feed
            .descriptor_at(index)
            .expect("packed fraction columns share one length");
        let quantity = feed
            .quantity_at(index)
            .expect("packed fraction columns share one length");
        let bin = tables.size_bin(descriptor.size_bin_id)?;
        if bin.max_mm <= max_feed_particle_size_mm {
            continue;
        }
        oversized += quantity;
        match largest_runtime_bin {
            Some((_, current_max)) if current_max >= bin.max_mm => {}
            _ => largest_runtime_bin = Some((descriptor.size_bin_id, bin.max_mm)),
        }
    }
    if oversized > 0.0 {
        let percentage = if total > 0.0 { oversized / total * 100.0 } else { 0.0 };
        let largest_id = largest_runtime_bin.map(|(id, _)| id).unwrap_or(0);
        return Err(format!(
            "Magnetic Separator requires feed particle size <= {max_feed_particle_size_mm} mm; blocked because feed contains {percentage:.1}% oversized material (largest runtime class {largest_id})"
        ));
    }

    partition_solid_state_by_share(feed, |descriptor| {
        magnetic_recovery_for_fraction(descriptor, field_strength, tables)
    })
}

fn capacity_scale_for_output(
    free_capacity_kg: f64,
    state: &PackedSolidState,
    dt: f64,
) -> f64 {
    let required_kg = state.total_quantity() * dt;
    if required_kg <= APPARATUS_TRANSFER_TOLERANCE_KG {
        return 1.0;
    }
    clamp(free_capacity_kg / required_kg, 0.0, 1.0)
}

fn assert_accepted(expected_kg: f64, accepted_kg: f64, context: &str) -> Result<(), String> {
    let tolerance = APPARATUS_TRANSFER_TOLERANCE_KG * expected_kg.max(1.0);
    if (expected_kg - accepted_kg).abs() > tolerance {
        return Err(format!(
            "{context} could not commit its planned output atomically"
        ));
    }
    Ok(())
}

fn output_specific_sensible_enthalpies(
    input_body: &PackedSolidBody,
    output_a: &PackedSolidState,
    output_b: &PackedSolidState,
    thermal: &PackedSpeciesThermalTable,
) -> Result<[f64; 2], String> {
    let input_sensible_enthalpy_j = input_body.sensible_enthalpy_j();
    validate_finite(
        input_sensible_enthalpy_j,
        "partition input sensible enthalpy",
    )?;
    if input_sensible_enthalpy_j.abs() <= THERMAL_ENERGY_TOLERANCE_J {
        return Ok([0.0, 0.0]);
    }

    let input_heat_capacity_j_per_k = thermal.heat_capacity_j_per_k(input_body.solid_state())?;
    if !input_heat_capacity_j_per_k.is_finite() || input_heat_capacity_j_per_k <= 0.0 {
        return Err("partition input heat capacity must be finite and positive".to_string());
    }
    let delta_temperature_k = input_sensible_enthalpy_j / input_heat_capacity_j_per_k;

    let specific_for = |state: &PackedSolidState| -> Result<f64, String> {
        let mass_rate = state.total_quantity();
        if mass_rate <= SOLID_MATERIAL_TOLERANCE {
            return Ok(0.0);
        }
        let capacity_rate = thermal.heat_capacity_j_per_k(state)?;
        let specific = delta_temperature_k * capacity_rate / mass_rate;
        validate_finite(specific, "partition output specific sensible enthalpy")?;
        Ok(specific)
    };

    Ok([specific_for(output_a)?, specific_for(output_b)?])
}

#[derive(Debug, Clone)]
struct PartitionCommit {
    actual_input_flow: PackedSolidState,
    output_a_flow: PackedSolidState,
    output_b_flow: PackedSolidState,
    input_specific_sensible_enthalpy_j_per_kg: f64,
    output_a_specific_sensible_enthalpy_j_per_kg: f64,
    output_b_specific_sensible_enthalpy_j_per_kg: f64,
    transferred_mass_kg: f64,
    output_a_mass_kg: f64,
    output_b_mass_kg: f64,
}

#[derive(Debug, Clone)]
enum PartitionExecution {
    Idle,
    Blocked(String),
    Running(PartitionCommit),
}

/// Shared Hopper -> two-output apparatus transaction. Screen and Magnetic
/// Separator differ only in how they partition a candidate packed flow; storage,
/// capacity scaling, sensible-energy projection, stream publication, and atomic
/// three-inventory commit use one implementation.
fn execute_partition_tick<F>(
    source: &mut PackedHopperState,
    output_a: &mut PackedHopperState,
    output_b: &mut PackedHopperState,
    throughput_kg_per_second: f64,
    dt: f64,
    thermal: &PackedSpeciesThermalTable,
    capacity_block_message: &str,
    partition: F,
) -> Result<PartitionExecution, String>
where
    F: FnOnce(&PackedSolidState) -> Result<PackedPartitionResult, String>,
{
    validate_positive_finite(dt, "partition simulation dt")?;
    validate_positive_finite(throughput_kg_per_second, "partition throughput")?;

    let stored_mass_kg = source.stored_mass_kg();
    if stored_mass_kg <= SOLID_MATERIAL_TOLERANCE {
        return Ok(PartitionExecution::Idle);
    }

    let candidate_rate = throughput_kg_per_second.min(stored_mass_kg / dt);
    let candidate_feed = source
        .body()
        .solid_state()
        .scaled(candidate_rate / stored_mass_kg)?;
    let candidate_partition = match partition(&candidate_feed) {
        Ok(result) => result,
        Err(error) => return Ok(PartitionExecution::Blocked(error)),
    };

    let capacity_scale = capacity_scale_for_output(
        output_a.free_capacity_kg(),
        &candidate_partition.output_a,
        dt,
    )
    .min(capacity_scale_for_output(
        output_b.free_capacity_kg(),
        &candidate_partition.output_b,
        dt,
    ));
    if capacity_scale <= APPARATUS_TRANSFER_TOLERANCE_KG {
        return Ok(PartitionExecution::Blocked(
            capacity_block_message.to_string(),
        ));
    }

    let actual_feed = if capacity_scale < 1.0 {
        candidate_feed.scaled(capacity_scale)?
    } else {
        candidate_feed
    };
    let output_a_flow = if capacity_scale < 1.0 {
        candidate_partition.output_a.scaled(capacity_scale)?
    } else {
        candidate_partition.output_a
    };
    let output_b_flow = if capacity_scale < 1.0 {
        candidate_partition.output_b.scaled(capacity_scale)?
    } else {
        candidate_partition.output_b
    };

    let planned_rate = actual_feed.total_quantity();
    if planned_rate <= APPARATUS_TRANSFER_TOLERANCE_KG {
        return Ok(PartitionExecution::Idle);
    }

    let expected_a_kg = output_a_flow.total_quantity() * dt;
    let expected_b_kg = output_b_flow.total_quantity() * dt;
    let mut staged_source = source.clone();
    let mut staged_a = output_a.clone();
    let mut staged_b = output_b.clone();
    let withdrawal = staged_source.withdraw_rate(planned_rate, dt)?;
    if withdrawal.actual_mass_kg <= APPARATUS_TRANSFER_TOLERANCE_KG {
        return Ok(PartitionExecution::Idle);
    }

    let actual_input_flow = withdrawal.body.solid_state().scaled(1.0 / dt)?;
    let output_specific = output_specific_sensible_enthalpies(
        &withdrawal.body,
        &output_a_flow,
        &output_b_flow,
        thermal,
    )?;
    let accepted_a = staged_a.receive_flow(&output_a_flow, dt, output_specific[0])?;
    let accepted_b = staged_b.receive_flow(&output_b_flow, dt, output_specific[1])?;
    assert_accepted(expected_a_kg, accepted_a, "partition output A")?;
    assert_accepted(expected_b_kg, accepted_b, "partition output B")?;

    *source = staged_source;
    *output_a = staged_a;
    *output_b = staged_b;

    Ok(PartitionExecution::Running(PartitionCommit {
        actual_input_flow,
        output_a_flow,
        output_b_flow,
        input_specific_sensible_enthalpy_j_per_kg: withdrawal
            .body
            .specific_sensible_enthalpy_j_per_kg(),
        output_a_specific_sensible_enthalpy_j_per_kg: output_specific[0],
        output_b_specific_sensible_enthalpy_j_per_kg: output_specific[1],
        transferred_mass_kg: withdrawal.actual_mass_kg,
        output_a_mass_kg: accepted_a,
        output_b_mass_kg: accepted_b,
    }))
}

#[derive(Debug, Clone, Copy)]
pub struct PackedScreenConfig {
    pub aperture_size_mm: f64,
    pub throughput_kg_per_second: f64,
    pub enabled: bool,
}

impl PackedScreenConfig {
    pub fn new(
        aperture_size_mm: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
    ) -> Result<Self, String> {
        validate_positive_finite(aperture_size_mm, "Screen apertureSizeMm")?;
        validate_positive_finite(throughput_kg_per_second, "Screen throughput")?;
        Ok(Self {
            aperture_size_mm,
            throughput_kg_per_second,
            enabled,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PackedScreenTickResult {
    pub operating_state: PackedOperatingState,
    pub transferred_mass_kg: f64,
    pub undersize_mass_kg: f64,
    pub oversize_mass_kg: f64,
}

#[derive(Debug, Clone)]
pub struct PackedScreenRuntime {
    config: PackedScreenConfig,
    input_stream: PackedSolidStream,
    undersize_stream: PackedSolidStream,
    oversize_stream: PackedSolidStream,
    operating_state: PackedOperatingState,
    last_error: Option<String>,
}

impl PackedScreenRuntime {
    pub fn new(config: PackedScreenConfig) -> Self {
        Self {
            operating_state: if config.enabled {
                PackedOperatingState::Idle
            } else {
                PackedOperatingState::Off
            },
            config,
            input_stream: PackedSolidStream::new(),
            undersize_stream: PackedSolidStream::new(),
            oversize_stream: PackedSolidStream::new(),
            last_error: None,
        }
    }

    pub fn config(&self) -> PackedScreenConfig {
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

    pub fn set_aperture_size_mm(&mut self, value: f64) -> Result<(), String> {
        validate_positive_finite(value, "Screen apertureSizeMm")?;
        self.config.aperture_size_mm = value;
        Ok(())
    }

    pub fn set_throughput_kg_per_second(&mut self, value: f64) -> Result<(), String> {
        validate_positive_finite(value, "Screen throughput")?;
        self.config.throughput_kg_per_second = value;
        Ok(())
    }

    pub fn input_stream(&self) -> &PackedSolidStream {
        &self.input_stream
    }

    pub fn undersize_stream(&self) -> &PackedSolidStream {
        &self.undersize_stream
    }

    pub fn oversize_stream(&self) -> &PackedSolidStream {
        &self.oversize_stream
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
        undersize_mass_kg: f64,
        oversize_mass_kg: f64,
    ) -> PackedScreenTickResult {
        self.operating_state = state;
        PackedScreenTickResult {
            operating_state: state,
            transferred_mass_kg,
            undersize_mass_kg,
            oversize_mass_kg,
        }
    }

    pub fn tick_hopper_to_hoppers(
        &mut self,
        source: &mut PackedHopperState,
        undersize: &mut PackedHopperState,
        oversize: &mut PackedHopperState,
        tables: &PackedSeparationTables,
        thermal: &PackedSpeciesThermalTable,
        dt: f64,
    ) -> Result<PackedScreenTickResult, String> {
        validate_positive_finite(dt, "Screen simulation dt")?;
        self.input_stream.clear();
        self.undersize_stream.clear();
        self.oversize_stream.clear();
        self.last_error = None;

        if !self.config.enabled {
            return Ok(self.finish(PackedOperatingState::Off, 0.0, 0.0, 0.0));
        }

        let aperture_size_mm = self.config.aperture_size_mm;
        let execution = execute_partition_tick(
            source,
            undersize,
            oversize,
            self.config.throughput_kg_per_second,
            dt,
            thermal,
            "One or more required Screen outputs are full",
            |state| split_screened_solid_state(state, aperture_size_mm, tables),
        )?;

        match execution {
            PartitionExecution::Idle => {
                Ok(self.finish(PackedOperatingState::Idle, 0.0, 0.0, 0.0))
            }
            PartitionExecution::Blocked(error) => {
                self.last_error = Some(error);
                Ok(self.finish(PackedOperatingState::Blocked, 0.0, 0.0, 0.0))
            }
            PartitionExecution::Running(commit) => {
                self.input_stream.set_flow(
                    &commit.actual_input_flow,
                    commit.input_specific_sensible_enthalpy_j_per_kg,
                )?;
                self.undersize_stream.set_flow(
                    &commit.output_a_flow,
                    commit.output_a_specific_sensible_enthalpy_j_per_kg,
                )?;
                self.oversize_stream.set_flow(
                    &commit.output_b_flow,
                    commit.output_b_specific_sensible_enthalpy_j_per_kg,
                )?;
                Ok(self.finish(
                    PackedOperatingState::Running,
                    commit.transferred_mass_kg,
                    commit.output_a_mass_kg,
                    commit.output_b_mass_kg,
                ))
            }
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct PackedMagneticSeparatorConfig {
    pub field_strength: f64,
    pub max_feed_particle_size_mm: f64,
    pub throughput_kg_per_second: f64,
    pub enabled: bool,
}

impl PackedMagneticSeparatorConfig {
    pub fn new(
        field_strength: f64,
        max_feed_particle_size_mm: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
    ) -> Result<Self, String> {
        validate_unit_interval(field_strength, "Magnetic Separator fieldStrength")?;
        validate_positive_finite(
            max_feed_particle_size_mm,
            "Magnetic Separator max feed particle size",
        )?;
        validate_positive_finite(
            throughput_kg_per_second,
            "Magnetic Separator throughput",
        )?;
        Ok(Self {
            field_strength,
            max_feed_particle_size_mm,
            throughput_kg_per_second,
            enabled,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PackedMagneticSeparatorTickResult {
    pub operating_state: PackedOperatingState,
    pub transferred_mass_kg: f64,
    pub concentrate_mass_kg: f64,
    pub tailings_mass_kg: f64,
}

#[derive(Debug, Clone)]
pub struct PackedMagneticSeparatorRuntime {
    config: PackedMagneticSeparatorConfig,
    input_stream: PackedSolidStream,
    concentrate_stream: PackedSolidStream,
    tailings_stream: PackedSolidStream,
    operating_state: PackedOperatingState,
    last_error: Option<String>,
}

impl PackedMagneticSeparatorRuntime {
    pub fn new(config: PackedMagneticSeparatorConfig) -> Self {
        Self {
            operating_state: if config.enabled {
                PackedOperatingState::Idle
            } else {
                PackedOperatingState::Off
            },
            config,
            input_stream: PackedSolidStream::new(),
            concentrate_stream: PackedSolidStream::new(),
            tailings_stream: PackedSolidStream::new(),
            last_error: None,
        }
    }

    pub fn config(&self) -> PackedMagneticSeparatorConfig {
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

    pub fn set_field_strength(&mut self, value: f64) -> Result<(), String> {
        validate_unit_interval(value, "Magnetic Separator fieldStrength")?;
        self.config.field_strength = value;
        Ok(())
    }

    pub fn set_max_feed_particle_size_mm(&mut self, value: f64) -> Result<(), String> {
        validate_positive_finite(value, "Magnetic Separator max feed particle size")?;
        self.config.max_feed_particle_size_mm = value;
        Ok(())
    }

    pub fn set_throughput_kg_per_second(&mut self, value: f64) -> Result<(), String> {
        validate_positive_finite(value, "Magnetic Separator throughput")?;
        self.config.throughput_kg_per_second = value;
        Ok(())
    }

    pub fn input_stream(&self) -> &PackedSolidStream {
        &self.input_stream
    }

    pub fn concentrate_stream(&self) -> &PackedSolidStream {
        &self.concentrate_stream
    }

    pub fn tailings_stream(&self) -> &PackedSolidStream {
        &self.tailings_stream
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
        concentrate_mass_kg: f64,
        tailings_mass_kg: f64,
    ) -> PackedMagneticSeparatorTickResult {
        self.operating_state = state;
        PackedMagneticSeparatorTickResult {
            operating_state: state,
            transferred_mass_kg,
            concentrate_mass_kg,
            tailings_mass_kg,
        }
    }

    pub fn tick_hopper_to_hoppers(
        &mut self,
        source: &mut PackedHopperState,
        concentrate: &mut PackedHopperState,
        tailings: &mut PackedHopperState,
        tables: &PackedSeparationTables,
        thermal: &PackedSpeciesThermalTable,
        dt: f64,
    ) -> Result<PackedMagneticSeparatorTickResult, String> {
        validate_positive_finite(dt, "Magnetic Separator simulation dt")?;
        self.input_stream.clear();
        self.concentrate_stream.clear();
        self.tailings_stream.clear();
        self.last_error = None;

        if !self.config.enabled {
            return Ok(self.finish(PackedOperatingState::Off, 0.0, 0.0, 0.0));
        }

        let field_strength = self.config.field_strength;
        let max_feed_particle_size_mm = self.config.max_feed_particle_size_mm;
        let execution = execute_partition_tick(
            source,
            concentrate,
            tailings,
            self.config.throughput_kg_per_second,
            dt,
            thermal,
            "One or more output hoppers are full",
            |state| {
                split_magnetic_solid_state(
                    state,
                    field_strength,
                    max_feed_particle_size_mm,
                    tables,
                )
            },
        )?;

        match execution {
            PartitionExecution::Idle => {
                Ok(self.finish(PackedOperatingState::Idle, 0.0, 0.0, 0.0))
            }
            PartitionExecution::Blocked(error) => {
                self.last_error = Some(error);
                Ok(self.finish(PackedOperatingState::Blocked, 0.0, 0.0, 0.0))
            }
            PartitionExecution::Running(commit) => {
                self.input_stream.set_flow(
                    &commit.actual_input_flow,
                    commit.input_specific_sensible_enthalpy_j_per_kg,
                )?;
                self.concentrate_stream.set_flow(
                    &commit.output_a_flow,
                    commit.output_a_specific_sensible_enthalpy_j_per_kg,
                )?;
                self.tailings_stream.set_flow(
                    &commit.output_b_flow,
                    commit.output_b_specific_sensible_enthalpy_j_per_kg,
                )?;
                Ok(self.finish(
                    PackedOperatingState::Running,
                    commit.transferred_mass_kg,
                    commit.output_a_mass_kg,
                    commit.output_b_mass_kg,
                ))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const QUARTZ: u16 = 1;
    const MAGNETITE: u16 = 2;
    const HEMATITE: u16 = 3;
    const SIZE_5_15: u8 = 10;
    const SIZE_15_25: u8 = 11;
    const SIZE_25_60: u8 = 12;
    const SIZE_60_120: u8 = 13;
    const SIZE_FINE_CANONICAL: u8 = 14;
    const SIZE_FINE_LEGACY: u8 = 15;
    const LOCKED: u8 = 20;
    const PARTIAL: u8 = 21;
    const MOSTLY: u8 = 22;
    const LIBERATED: u8 = 23;

    fn tables() -> PackedSeparationTables {
        let mut tables = PackedSeparationTables::new();
        tables.add_size_bin(SIZE_5_15, 15.0, 0.90).unwrap();
        tables.add_size_bin(SIZE_15_25, 25.0, 1.00).unwrap();
        tables.add_size_bin(SIZE_25_60, 60.0, 0.0).unwrap();
        tables.add_size_bin(SIZE_60_120, 120.0, 0.0).unwrap();
        tables
            .add_size_bin(SIZE_FINE_CANONICAL, 0.032, 0.0)
            .unwrap();
        tables
            .add_size_bin(SIZE_FINE_LEGACY, 0.032, 0.05)
            .unwrap();
        tables.add_liberation_class(LOCKED, 0.25).unwrap();
        tables.add_liberation_class(PARTIAL, 0.55).unwrap();
        tables.add_liberation_class(MOSTLY, 0.80).unwrap();
        tables.add_liberation_class(LIBERATED, 1.00).unwrap();
        tables.set_species_magnetic_response(QUARTZ, 0.0).unwrap();
        tables
            .set_species_magnetic_response(MAGNETITE, 1.0)
            .unwrap();
        tables
            .set_species_magnetic_response(HEMATITE, 0.55)
            .unwrap();
        tables
    }

    fn thermal() -> PackedSpeciesThermalTable {
        let mut table = PackedSpeciesThermalTable::new();
        table
            .set_specific_heat_capacity_j_per_kg_k(QUARTZ, 740.0)
            .unwrap();
        table
            .set_specific_heat_capacity_j_per_kg_k(MAGNETITE, 670.0)
            .unwrap();
        table
            .set_specific_heat_capacity_j_per_kg_k(HEMATITE, 650.0)
            .unwrap();
        table
    }

    fn fraction(species_id: u16, size_bin_id: u8, liberation_class_id: u8) -> FractionDescriptor {
        FractionDescriptor {
            species_id,
            size_bin_id,
            liberation_class_id,
            texture_profile_id: 0,
        }
    }

    #[test]
    fn screen_is_an_exact_sharp_partition() {
        let tables = tables();
        let mut feed = PackedSolidState::new();
        feed.push_fraction(fraction(QUARTZ, SIZE_5_15, LOCKED), 30.0)
            .unwrap();
        feed.push_fraction(fraction(HEMATITE, SIZE_15_25, PARTIAL), 20.0)
            .unwrap();
        feed.push_fraction(fraction(MAGNETITE, SIZE_25_60, MOSTLY), 40.0)
            .unwrap();
        feed.push_fraction(fraction(QUARTZ, SIZE_60_120, LIBERATED), 10.0)
            .unwrap();

        let result = split_screened_solid_state(&feed, 25.0, &tables).unwrap();
        assert!((result.output_a.total_quantity() - 50.0).abs() < 1e-12);
        assert!((result.output_b.total_quantity() - 50.0).abs() < 1e-12);
        assert_eq!(result.output_a.len(), 2);
        assert_eq!(result.output_b.len(), 2);
        assert_eq!(feed.len(), 4);
    }

    #[test]
    fn magnetic_recovery_matches_production_curve() {
        let tables = tables();
        let magnetite = magnetic_recovery_for_fraction(
            fraction(MAGNETITE, SIZE_15_25, LIBERATED),
            0.5,
            &tables,
        )
        .unwrap();
        let quartz = magnetic_recovery_for_fraction(
            fraction(QUARTZ, SIZE_15_25, LIBERATED),
            0.5,
            &tables,
        )
        .unwrap();
        assert!((magnetite - 0.5875).abs() < 1e-12);
        assert!((quartz - 0.0125).abs() < 1e-12);
    }

    #[test]
    fn canonical_ultrafine_and_legacy_ultrafine_keep_current_distinction() {
        let tables = tables();
        let canonical = magnetic_recovery_for_fraction(
            fraction(MAGNETITE, SIZE_FINE_CANONICAL, LIBERATED),
            1.0,
            &tables,
        )
        .unwrap();
        let legacy = magnetic_recovery_for_fraction(
            fraction(MAGNETITE, SIZE_FINE_LEGACY, LIBERATED),
            1.0,
            &tables,
        )
        .unwrap();
        assert_eq!(canonical, 0.0);
        assert!((legacy - 0.051).abs() < 1e-12);
    }

    #[test]
    fn magnetic_separator_rejects_oversized_feed() {
        let tables = tables();
        let mut feed = PackedSolidState::new();
        feed.push_fraction(fraction(MAGNETITE, SIZE_25_60, LIBERATED), 10.0)
            .unwrap();
        let error = split_magnetic_solid_state(&feed, 0.5, 25.0, &tables).unwrap_err();
        assert!(error.contains("requires feed particle size <= 25"));
    }

    #[test]
    fn screen_runtime_applies_required_output_backpressure_atomically() {
        let tables = tables();
        let thermal = thermal();
        let mut source = PackedHopperState::empty(100.0).unwrap();
        source
            .body_mut()
            .solid_state_mut()
            .push_fraction(fraction(QUARTZ, SIZE_5_15, LOCKED), 10.0)
            .unwrap();
        source
            .body_mut()
            .solid_state_mut()
            .push_fraction(fraction(MAGNETITE, SIZE_25_60, LIBERATED), 10.0)
            .unwrap();
        let mut undersize = PackedHopperState::empty(1.0).unwrap();
        undersize
            .body_mut()
            .solid_state_mut()
            .push_fraction(fraction(QUARTZ, SIZE_5_15, LOCKED), 1.0)
            .unwrap();
        let mut oversize = PackedHopperState::empty(100.0).unwrap();
        let mut screen = PackedScreenRuntime::new(
            PackedScreenConfig::new(25.0, 20.0, true).unwrap(),
        );

        let result = screen
            .tick_hopper_to_hoppers(
                &mut source,
                &mut undersize,
                &mut oversize,
                &tables,
                &thermal,
                1.0,
            )
            .unwrap();
        assert_eq!(result.operating_state, PackedOperatingState::Blocked);
        assert!((source.stored_mass_kg() - 20.0).abs() < 1e-12);
        assert!((undersize.stored_mass_kg() - 1.0).abs() < 1e-12);
        assert_eq!(oversize.stored_mass_kg(), 0.0);
    }

    #[test]
    fn magnetic_runtime_conserves_mass_and_sensible_energy() {
        let tables = tables();
        let thermal = thermal();
        let mut source = PackedHopperState::empty(100.0).unwrap();
        source
            .body_mut()
            .solid_state_mut()
            .push_fraction(fraction(MAGNETITE, SIZE_15_25, LIBERATED), 10.0)
            .unwrap();
        source
            .body_mut()
            .solid_state_mut()
            .push_fraction(fraction(QUARTZ, SIZE_15_25, LIBERATED), 10.0)
            .unwrap();
        source.body_mut().set_sensible_enthalpy_j(14_100.0).unwrap();
        let mut concentrate = PackedHopperState::empty(100.0).unwrap();
        let mut tailings = PackedHopperState::empty(100.0).unwrap();
        let mut separator = PackedMagneticSeparatorRuntime::new(
            PackedMagneticSeparatorConfig::new(0.5, 25.0, 20.0, true).unwrap(),
        );

        let result = separator
            .tick_hopper_to_hoppers(
                &mut source,
                &mut concentrate,
                &mut tailings,
                &tables,
                &thermal,
                1.0,
            )
            .unwrap();
        assert_eq!(result.operating_state, PackedOperatingState::Running);
        assert!((result.transferred_mass_kg - 20.0).abs() < 1e-12);
        assert!((concentrate.stored_mass_kg() - 6.0).abs() < 1e-12);
        assert!((tailings.stored_mass_kg() - 14.0).abs() < 1e-12);
        assert_eq!(source.stored_mass_kg(), 0.0);
        let final_energy = concentrate.body().sensible_enthalpy_j()
            + tailings.body().sensible_enthalpy_j();
        assert!((final_energy - 14_100.0).abs() < 1e-9);
        assert!((separator.concentrate_stream().total_mass_flow_kg_per_second() - 6.0).abs() < 1e-12);
        assert!((separator.tailings_stream().total_mass_flow_kg_per_second() - 14.0).abs() < 1e-12);
    }
}
