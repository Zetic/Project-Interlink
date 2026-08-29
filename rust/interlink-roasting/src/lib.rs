use interlink_core::{PackedHopperState, PackedSolidBody, PackedSolidState, SOLID_MATERIAL_TOLERANCE};
use interlink_processes::{PackedOperatingState, PackedSolidStream, APPARATUS_TRANSFER_TOLERANCE_KG};
use interlink_thermal::{
    ambient_heat_transfer_energy_j, bounded_cooling_energy_j, gas_body_temperature_k,
    sensible_enthalpy_j_at_temperature, solid_body_temperature_k, solid_heat_capacity_j_per_k,
    temperature_k_from_sensible_enthalpy, PackedGasBody, PackedGasStream,
    PackedSpeciesThermalTable, GAS_MATERIAL_TOLERANCE, THERMAL_REFERENCE_TEMPERATURE_K,
};
use interlink_thermochemistry::{
    apply_goethite_dehydroxylation, PackedGoethiteReactionTables,
};

pub const DEFAULT_ROASTING_FURNACE_ZONE_COUNT: usize = 4;
const TRANSFER_TOLERANCE_KG: f64 = 1e-9;
const ENERGY_BALANCE_TOLERANCE_J: f64 = 1e-4;

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

fn add_solid_body(target: &mut PackedSolidBody, source: &PackedSolidBody) -> Result<(), String> {
    target
        .solid_state_mut()
        .add_scaled_from(source.solid_state(), 1.0)?;
    target.set_sensible_enthalpy_j(
        target.sensible_enthalpy_j() + source.sensible_enthalpy_j(),
    )
}

fn withdraw_solid_body(
    body: &mut PackedSolidBody,
    requested_mass_kg: f64,
) -> Result<PackedSolidBody, String> {
    validate_finite(requested_mass_kg, "requested furnace solid withdrawal")?;
    if requested_mass_kg < 0.0 {
        return Err("requested furnace solid withdrawal must be non-negative".to_string());
    }
    let stored_mass_kg = body.total_mass_kg();
    if stored_mass_kg <= TRANSFER_TOLERANCE_KG || requested_mass_kg <= TRANSFER_TOLERANCE_KG {
        return Ok(PackedSolidBody::empty());
    }
    let withdrawn_state = body.solid_state_mut().withdraw_quantity(requested_mass_kg)?;
    let mass_kg = withdrawn_state.total_quantity();
    let sensible_enthalpy_j = body.sensible_enthalpy_j() * (mass_kg / stored_mass_kg);
    body.set_sensible_enthalpy_j(body.sensible_enthalpy_j() - sensible_enthalpy_j)?;
    PackedSolidBody::new(withdrawn_state, sensible_enthalpy_j)
}

fn solid_species_mass_kg(body: &PackedSolidBody, species_id: u16) -> f64 {
    let mut total = 0.0;
    for index in 0..body.solid_state().len() {
        let descriptor = body
            .solid_state()
            .descriptor_at(index)
            .expect("packed solid columns share one length");
        if descriptor.species_id != species_id {
            continue;
        }
        total += body
            .solid_state()
            .quantity_at(index)
            .expect("packed solid columns share one length");
    }
    total
}

#[derive(Debug, Clone, Copy)]
pub struct PackedRoastingFurnaceConfig {
    pub temperature_setpoint_k: f64,
    pub rated_heater_power_kw: f64,
    pub maximum_operating_temperature_k: f64,
    pub maximum_solid_throughput_kg_per_second: f64,
    pub effective_chamber_hold_up_kg: f64,
    pub heat_loss_coefficient_w_per_k: f64,
    pub internal_zone_count: usize,
    pub enabled: bool,
}

impl PackedRoastingFurnaceConfig {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        temperature_setpoint_k: f64,
        rated_heater_power_kw: f64,
        maximum_operating_temperature_k: f64,
        maximum_solid_throughput_kg_per_second: f64,
        effective_chamber_hold_up_kg: f64,
        heat_loss_coefficient_w_per_k: f64,
        internal_zone_count: usize,
        enabled: bool,
    ) -> Result<Self, String> {
        validate_positive_finite(temperature_setpoint_k, "Furnace temperatureSetpointK")?;
        validate_positive_finite(rated_heater_power_kw, "Furnace ratedHeaterPowerKw")?;
        validate_positive_finite(
            maximum_operating_temperature_k,
            "Furnace maximumOperatingTemperatureK",
        )?;
        validate_positive_finite(
            maximum_solid_throughput_kg_per_second,
            "Furnace maximumSolidThroughputKgPerSecond",
        )?;
        validate_positive_finite(
            effective_chamber_hold_up_kg,
            "Furnace effectiveChamberHoldUpKg",
        )?;
        validate_positive_finite(
            heat_loss_coefficient_w_per_k,
            "Furnace heatLossCoefficientWPerK",
        )?;
        if internal_zone_count == 0 {
            return Err("Furnace internalZoneCount must be a positive integer".to_string());
        }
        Ok(Self {
            temperature_setpoint_k,
            rated_heater_power_kw,
            maximum_operating_temperature_k,
            maximum_solid_throughput_kg_per_second,
            effective_chamber_hold_up_kg,
            heat_loss_coefficient_w_per_k,
            internal_zone_count,
            enabled,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PackedRoastingFurnaceDiagnostics {
    pub actual_charge_temperature_k: f64,
    pub last_heater_energy_j: f64,
    pub last_heat_loss_energy_j: f64,
    pub last_reaction_energy_demand_j: f64,
    pub last_heater_power_kw: f64,
    pub last_heat_loss_power_kw: f64,
    pub last_reaction_power_kw: f64,
    pub last_feed_rate_kg_per_second: f64,
    pub last_product_rate_kg_per_second: f64,
    pub last_goethite_conversion_fraction: f64,
    pub last_solver_evaluation_count: usize,
}

impl Default for PackedRoastingFurnaceDiagnostics {
    fn default() -> Self {
        Self {
            actual_charge_temperature_k: THERMAL_REFERENCE_TEMPERATURE_K,
            last_heater_energy_j: 0.0,
            last_heat_loss_energy_j: 0.0,
            last_reaction_energy_demand_j: 0.0,
            last_heater_power_kw: 0.0,
            last_heat_loss_power_kw: 0.0,
            last_reaction_power_kw: 0.0,
            last_feed_rate_kg_per_second: 0.0,
            last_product_rate_kg_per_second: 0.0,
            last_goethite_conversion_fraction: 0.0,
            last_solver_evaluation_count: 0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct PackedRoastingFurnaceTickResult {
    pub operating_state: PackedOperatingState,
    pub introduced_mass_kg: f64,
    pub discharged_mass_kg: f64,
    pub vented_gas_mass_kg: f64,
}

/// Small sink abstraction so the later Rust graph scheduler can route furnace
/// product either into a Hopper or directly into another furnace without changing
/// the furnace physics implementation.
pub trait PackedSolidProductSink {
    fn free_capacity_kg_for_dt(&self, dt: f64) -> Result<f64, String>;
    fn receive_product_body(&mut self, body: &PackedSolidBody, dt: f64) -> Result<f64, String>;
}

impl PackedSolidProductSink for PackedHopperState {
    fn free_capacity_kg_for_dt(&self, _dt: f64) -> Result<f64, String> {
        Ok(self.free_capacity_kg())
    }

    fn receive_product_body(&mut self, body: &PackedSolidBody, _dt: f64) -> Result<f64, String> {
        self.receive_body(body)
    }
}

#[derive(Debug, Clone)]
pub struct PackedRoastingFurnaceRuntime {
    config: PackedRoastingFurnaceConfig,
    zones: Vec<PackedSolidBody>,
    pending_feed: PackedSolidBody,
    gas_inventory: PackedGasBody,
    solid_product_stream: PackedSolidStream,
    gas_exhaust_stream: PackedGasStream,
    zone_temperatures_k: Vec<f64>,
    diagnostics: PackedRoastingFurnaceDiagnostics,
    operating_state: PackedOperatingState,
    last_error: Option<String>,
    incoming_mass_since_last_simulation_kg: f64,
}

impl PackedRoastingFurnaceRuntime {
    pub fn new(config: PackedRoastingFurnaceConfig) -> Self {
        Self {
            zones: (0..config.internal_zone_count)
                .map(|_| PackedSolidBody::empty())
                .collect(),
            pending_feed: PackedSolidBody::empty(),
            gas_inventory: PackedGasBody::empty(),
            solid_product_stream: PackedSolidStream::new(),
            gas_exhaust_stream: PackedGasStream::new(),
            zone_temperatures_k: vec![THERMAL_REFERENCE_TEMPERATURE_K; config.internal_zone_count],
            diagnostics: PackedRoastingFurnaceDiagnostics::default(),
            operating_state: if config.enabled {
                PackedOperatingState::Idle
            } else {
                PackedOperatingState::Off
            },
            last_error: None,
            incoming_mass_since_last_simulation_kg: 0.0,
            config,
        }
    }

    /// Restore retained physical inventory when transferring an already-running
    /// canonical world into the Rust runtime. Transient streams and diagnostics
    /// restart cleanly; material and sensible energy are preserved.
    pub fn import_retained_state(
        &mut self,
        zones: Vec<PackedSolidBody>,
        pending_feed: PackedSolidBody,
        gas_inventory: PackedGasBody,
    ) -> Result<(), String> {
        if zones.len() != self.config.internal_zone_count {
            return Err(format!(
                "Furnace retained state has {} zones; expected {}",
                zones.len(),
                self.config.internal_zone_count,
            ));
        }
        self.zones = zones;
        self.pending_feed = pending_feed;
        self.gas_inventory = gas_inventory;
        self.solid_product_stream = PackedSolidStream::new();
        self.gas_exhaust_stream = PackedGasStream::new();
        self.zone_temperatures_k = vec![
            THERMAL_REFERENCE_TEMPERATURE_K;
            self.config.internal_zone_count
        ];
        self.diagnostics = PackedRoastingFurnaceDiagnostics::default();
        self.operating_state = if self.config.enabled {
            PackedOperatingState::Idle
        } else {
            PackedOperatingState::Off
        };
        self.last_error = None;
        self.incoming_mass_since_last_simulation_kg = 0.0;
        Ok(())
    }

    pub fn config(&self) -> PackedRoastingFurnaceConfig {
        self.config
    }

    pub fn zones(&self) -> &[PackedSolidBody] {
        &self.zones
    }

    pub fn pending_feed(&self) -> &PackedSolidBody {
        &self.pending_feed
    }

    pub fn gas_inventory(&self) -> &PackedGasBody {
        &self.gas_inventory
    }

    pub fn solid_product_stream(&self) -> &PackedSolidStream {
        &self.solid_product_stream
    }

    pub fn gas_exhaust_stream(&self) -> &PackedGasStream {
        &self.gas_exhaust_stream
    }

    pub fn zone_temperatures_k(&self) -> &[f64] {
        &self.zone_temperatures_k
    }

    pub fn diagnostics(&self) -> PackedRoastingFurnaceDiagnostics {
        self.diagnostics
    }

    pub fn operating_state(&self) -> PackedOperatingState {
        self.operating_state
    }

    pub fn last_error(&self) -> Option<&str> {
        self.last_error.as_deref()
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.config.enabled = enabled;
        if !enabled {
            self.operating_state = PackedOperatingState::Off;
        } else if self.operating_state == PackedOperatingState::Off {
            self.operating_state = PackedOperatingState::Idle;
        }
    }

    pub fn set_temperature_setpoint_k(&mut self, value: f64) -> Result<(), String> {
        validate_positive_finite(value, "Furnace temperatureSetpointK")?;
        self.config.temperature_setpoint_k = value;
        Ok(())
    }

    pub fn zone_capacity_kg(&self) -> f64 {
        self.config.effective_chamber_hold_up_kg / self.config.internal_zone_count as f64
    }

    pub fn charge_mass_kg(&self) -> f64 {
        self.zones.iter().map(PackedSolidBody::total_mass_kg).sum()
    }

    pub fn pending_feed_mass_kg(&self) -> f64 {
        self.pending_feed.total_mass_kg()
    }

    pub fn input_capacity_kg(&self, dt: f64) -> Result<f64, String> {
        validate_positive_finite(dt, "Furnace input-capacity dt")?;
        if !self.config.enabled {
            return Ok(0.0);
        }
        Ok((self.config.maximum_solid_throughput_kg_per_second * dt
            - self.pending_feed_mass_kg())
            .max(0.0))
    }

    /// Receive an already metered solid body into the one-step inlet staging
    /// buffer. The operation is atomic and preserves its sensible enthalpy.
    pub fn receive_feed(&mut self, incoming: &PackedSolidBody, dt: f64) -> Result<f64, String> {
        let incoming_mass_kg = incoming.total_mass_kg();
        if incoming_mass_kg <= TRANSFER_TOLERANCE_KG {
            return Ok(0.0);
        }
        let capacity_kg = self.input_capacity_kg(dt)?;
        if incoming_mass_kg > capacity_kg + TRANSFER_TOLERANCE_KG {
            return Err("Furnace inlet could not accept the requested metered feed atomically".to_string());
        }
        let mut staged = self.pending_feed.clone();
        add_solid_body(&mut staged, incoming)?;
        self.pending_feed = staged;
        self.incoming_mass_since_last_simulation_kg += incoming_mass_kg;
        Ok(incoming_mass_kg)
    }

    /// Coarse convenience for the migration/WASM boundary. The future scheduler
    /// can instead route an upstream packed stream/body directly into receive_feed.
    pub fn receive_from_hopper(
        &mut self,
        source: &mut PackedHopperState,
        requested_rate_kg_per_second: f64,
        dt: f64,
    ) -> Result<f64, String> {
        validate_finite(requested_rate_kg_per_second, "Furnace feed rate")?;
        if requested_rate_kg_per_second < 0.0 {
            return Err("Furnace feed rate must be non-negative".to_string());
        }
        let capacity_kg = self.input_capacity_kg(dt)?;
        let transferable_kg = (requested_rate_kg_per_second * dt)
            .min(source.stored_mass_kg())
            .min(capacity_kg);
        if transferable_kg <= TRANSFER_TOLERANCE_KG {
            return Ok(0.0);
        }
        let mut staged_source = source.clone();
        let mut staged_furnace = self.clone();
        let withdrawal = staged_source.withdraw_rate(transferable_kg / dt, dt)?;
        staged_furnace.receive_feed(&withdrawal.body, dt)?;
        *source = staged_source;
        *self = staged_furnace;
        Ok(withdrawal.actual_mass_kg)
    }

    fn heat_zones(
        &mut self,
        thermal: &PackedSpeciesThermalTable,
        dt: f64,
    ) -> Result<(f64, f64), String> {
        let zone_heat_loss_coefficient_w_per_k =
            self.config.heat_loss_coefficient_w_per_k / self.config.internal_zone_count as f64;
        let setpoint_k = self
            .config
            .temperature_setpoint_k
            .min(self.config.maximum_operating_temperature_k);
        let mut requested_heater_energy = Vec::with_capacity(self.zones.len());
        let mut total_heat_loss_energy_j = 0.0;
        let mut total_requested_heater_energy_j = 0.0;

        for zone in &mut self.zones {
            if zone.total_mass_kg() <= TRANSFER_TOLERANCE_KG {
                requested_heater_energy.push(0.0);
                continue;
            }
            let heat_capacity_j_per_k =
                solid_heat_capacity_j_per_k(zone.solid_state(), thermal)?;
            let temperature_before_k = temperature_k_from_sensible_enthalpy(
                zone.sensible_enthalpy_j(),
                heat_capacity_j_per_k,
            )?;
            let requested_heat_loss_energy_j = ambient_heat_transfer_energy_j(
                temperature_before_k,
                zone_heat_loss_coefficient_w_per_k,
                dt,
                THERMAL_REFERENCE_TEMPERATURE_K,
            )?;
            let heat_loss_energy_j = bounded_cooling_energy_j(
                zone.sensible_enthalpy_j(),
                heat_capacity_j_per_k,
                requested_heat_loss_energy_j,
                1.0,
            )?;
            zone.set_sensible_enthalpy_j(zone.sensible_enthalpy_j() - heat_loss_energy_j)?;
            total_heat_loss_energy_j += heat_loss_energy_j;

            let temperature_after_loss_k = temperature_k_from_sensible_enthalpy(
                zone.sensible_enthalpy_j(),
                heat_capacity_j_per_k,
            )?;
            let requested = ((setpoint_k - temperature_after_loss_k) * heat_capacity_j_per_k)
                .max(0.0);
            total_requested_heater_energy_j += requested;
            requested_heater_energy.push(requested);
        }

        let available_heater_energy_j = self.config.rated_heater_power_kw * 1000.0 * dt;
        let heater_scale = if total_requested_heater_energy_j <= 0.0 {
            0.0
        } else {
            (available_heater_energy_j / total_requested_heater_energy_j).min(1.0)
        };
        let mut total_heater_energy_j = 0.0;
        for (zone, requested) in self.zones.iter_mut().zip(requested_heater_energy) {
            let heater_energy_j = requested * heater_scale;
            zone.set_sensible_enthalpy_j(zone.sensible_enthalpy_j() + heater_energy_j)?;
            total_heater_energy_j += heater_energy_j;
        }
        Ok((total_heater_energy_j, total_heat_loss_energy_j))
    }

    fn react_zones(
        &mut self,
        thermal: &PackedSpeciesThermalTable,
        reaction: &PackedGoethiteReactionTables,
        dt: f64,
    ) -> Result<(f64, f64, usize), String> {
        let source_species_id = reaction.config().source_species_id;
        let mut total_reaction_energy_demand_j = 0.0;
        let mut total_goethite_before_kg = 0.0;
        let mut total_goethite_consumed_kg = 0.0;
        let mut total_solver_evaluations = 0usize;

        for index in 0..self.zones.len() {
            if self.zones[index].total_mass_kg() <= TRANSFER_TOLERANCE_KG {
                continue;
            }
            let input = self.zones[index].clone();
            let source_before_kg = solid_species_mass_kg(&input, source_species_id);
            let result = apply_goethite_dehydroxylation(&input, dt, thermal, reaction)?;
            let input_energy_j = input.sensible_enthalpy_j();
            let output_energy_j = result.solid_product_body.sensible_enthalpy_j()
                + result.gas_product_body.sensible_enthalpy_j()
                + result.reaction_energy_demand_j;
            if (input_energy_j - output_energy_j).abs()
                > ENERGY_BALANCE_TOLERANCE_J * input_energy_j.abs().max(1.0)
            {
                return Err("Thermochemical reaction violates the furnace energy balance".to_string());
            }
            let source_after_kg =
                solid_species_mass_kg(&result.solid_product_body, source_species_id);
            self.zones[index] = result.solid_product_body;
            self.gas_inventory.add_body(&result.gas_product_body)?;
            total_reaction_energy_demand_j += result.reaction_energy_demand_j;
            total_solver_evaluations += result.solver_evaluation_count;
            total_goethite_before_kg += source_before_kg;
            total_goethite_consumed_kg += (source_before_kg - source_after_kg).max(0.0);
        }
        let conversion_fraction = if total_goethite_before_kg <= TRANSFER_TOLERANCE_KG {
            0.0
        } else {
            total_goethite_consumed_kg / total_goethite_before_kg
        };
        Ok((
            total_reaction_energy_demand_j,
            conversion_fraction,
            total_solver_evaluations,
        ))
    }

    fn advance_pending_feed(
        &mut self,
        output_capacity_kg: f64,
        dt: f64,
    ) -> Result<(f64, PackedSolidBody), String> {
        let pending_mass_kg = self.pending_feed_mass_kg();
        if pending_mass_kg <= TRANSFER_TOLERANCE_KG {
            return Ok((0.0, PackedSolidBody::empty()));
        }
        let zone_capacity_kg = self.zone_capacity_kg();
        let total_zone_free_capacity_kg: f64 = self
            .zones
            .iter()
            .map(|zone| (zone_capacity_kg - zone.total_mass_kg()).max(0.0))
            .sum();
        let admissible_mass_kg = pending_mass_kg
            .min(self.config.maximum_solid_throughput_kg_per_second * dt)
            .min(total_zone_free_capacity_kg + output_capacity_kg);
        if admissible_mass_kg <= TRANSFER_TOLERANCE_KG {
            return Ok((0.0, PackedSolidBody::empty()));
        }

        let incoming = withdraw_solid_body(&mut self.pending_feed, admissible_mass_kg)?;
        add_solid_body(&mut self.zones[0], &incoming)?;
        let mut discharged_body = PackedSolidBody::empty();
        for index in 0..self.zones.len() {
            let overflow_kg = (self.zones[index].total_mass_kg() - zone_capacity_kg).max(0.0);
            if overflow_kg <= TRANSFER_TOLERANCE_KG {
                continue;
            }
            let overflow = withdraw_solid_body(&mut self.zones[index], overflow_kg)?;
            if index + 1 < self.zones.len() {
                add_solid_body(&mut self.zones[index + 1], &overflow)?;
            } else {
                discharged_body = overflow;
            }
        }
        Ok((admissible_mass_kg, discharged_body))
    }

    fn update_thermal_diagnostics(
        &mut self,
        thermal: &PackedSpeciesThermalTable,
    ) -> Result<(), String> {
        let mut total_capacity_j_per_k = 0.0;
        let mut total_sensible_enthalpy_j = 0.0;
        self.zone_temperatures_k.clear();
        for zone in &self.zones {
            if zone.total_mass_kg() <= TRANSFER_TOLERANCE_KG {
                self.zone_temperatures_k
                    .push(THERMAL_REFERENCE_TEMPERATURE_K);
                continue;
            }
            let capacity = solid_heat_capacity_j_per_k(zone.solid_state(), thermal)?;
            total_capacity_j_per_k += capacity;
            total_sensible_enthalpy_j += zone.sensible_enthalpy_j();
            self.zone_temperatures_k
                .push(solid_body_temperature_k(zone, thermal)?);
        }
        self.diagnostics.actual_charge_temperature_k = if total_capacity_j_per_k <= 0.0 {
            THERMAL_REFERENCE_TEMPERATURE_K
        } else {
            THERMAL_REFERENCE_TEMPERATURE_K
                + total_sensible_enthalpy_j / total_capacity_j_per_k
        };
        Ok(())
    }

    fn tick_internal<S: PackedSolidProductSink + Clone>(
        &mut self,
        product_sink: Option<&mut S>,
        gas_vent: Option<&mut PackedGasBody>,
        thermal: &PackedSpeciesThermalTable,
        reaction: &PackedGoethiteReactionTables,
        dt: f64,
    ) -> Result<PackedRoastingFurnaceTickResult, String> {
        validate_positive_finite(dt, "Furnace simulation dt")?;
        self.solid_product_stream.clear();
        self.gas_exhaust_stream.clear();
        self.last_error = None;

        if !self.config.enabled {
            self.operating_state = PackedOperatingState::Off;
            self.diagnostics.last_feed_rate_kg_per_second = 0.0;
            self.diagnostics.last_product_rate_kg_per_second = 0.0;
            self.diagnostics.last_solver_evaluation_count = 0;
            self.incoming_mass_since_last_simulation_kg = 0.0;
            return Ok(PackedRoastingFurnaceTickResult {
                operating_state: PackedOperatingState::Off,
                introduced_mass_kg: 0.0,
                discharged_mass_kg: 0.0,
                vented_gas_mass_kg: 0.0,
            });
        }

        let outputs_ready = product_sink.is_some() && gas_vent.is_some();
        let output_capacity_kg = match product_sink.as_ref() {
            Some(sink) => sink.free_capacity_kg_for_dt(dt)?,
            None => 0.0,
        };
        let mut staged = self.clone();
        let mut staged_sink = product_sink.as_ref().map(|sink| (**sink).clone());
        let mut staged_vent = gas_vent.as_ref().map(|vent| (**vent).clone());

        let (heater_energy_j, heat_loss_energy_j) = staged.heat_zones(thermal, dt)?;
        staged.diagnostics.last_heater_energy_j = heater_energy_j;
        staged.diagnostics.last_heat_loss_energy_j = heat_loss_energy_j;

        if outputs_ready && staged.charge_mass_kg() > TRANSFER_TOLERANCE_KG {
            let (reaction_energy_j, conversion, solver_evaluations) =
                staged.react_zones(thermal, reaction, dt)?;
            staged.diagnostics.last_reaction_energy_demand_j = reaction_energy_j;
            staged.diagnostics.last_goethite_conversion_fraction = conversion;
            staged.diagnostics.last_solver_evaluation_count = solver_evaluations;
        } else {
            staged.diagnostics.last_reaction_energy_demand_j = 0.0;
            staged.diagnostics.last_goethite_conversion_fraction = 0.0;
            staged.diagnostics.last_solver_evaluation_count = 0;
        }

        let (introduced_mass_kg, discharged_body) =
            staged.advance_pending_feed(output_capacity_kg, dt)?;
        let discharged_mass_kg = discharged_body.total_mass_kg();
        if discharged_mass_kg > TRANSFER_TOLERANCE_KG {
            let product_flow = discharged_body.solid_state().scaled(1.0 / dt)?;
            staged.solid_product_stream.set_flow(
                &product_flow,
                discharged_body.specific_sensible_enthalpy_j_per_kg(),
            )?;
            let sink = staged_sink
                .as_mut()
                .ok_or_else(|| "Furnace solid product has no destination".to_string())?;
            let accepted = sink.receive_product_body(&discharged_body, dt)?;
            if (accepted - discharged_mass_kg).abs()
                > APPARATUS_TRANSFER_TOLERANCE_KG * discharged_mass_kg.max(1.0)
            {
                return Err("Furnace solid product could not commit atomically".to_string());
            }
        }

        let mut vented_gas_mass_kg = 0.0;
        if staged_vent.is_some() && staged.gas_inventory.total_mass_kg() > GAS_MATERIAL_TOLERANCE {
            let gas_output = staged.gas_inventory.clone();
            vented_gas_mass_kg = gas_output.total_mass_kg();
            let gas_flow = gas_output.gas_state().scaled(1.0 / dt)?;
            staged.gas_exhaust_stream.set_flow(
                &gas_flow,
                gas_output.specific_sensible_enthalpy_j_per_kg(),
            )?;
            staged_vent.as_mut().unwrap().add_body(&gas_output)?;
            staged.gas_inventory = PackedGasBody::empty();
        }

        staged.diagnostics.last_feed_rate_kg_per_second = introduced_mass_kg / dt;
        staged.diagnostics.last_product_rate_kg_per_second = discharged_mass_kg / dt;
        staged.diagnostics.last_heater_power_kw = heater_energy_j / dt / 1000.0;
        staged.diagnostics.last_heat_loss_power_kw = heat_loss_energy_j / dt / 1000.0;
        staged.diagnostics.last_reaction_power_kw =
            staged.diagnostics.last_reaction_energy_demand_j / dt / 1000.0;
        staged.update_thermal_diagnostics(thermal)?;

        let has_matter = staged.charge_mass_kg() + staged.pending_feed_mass_kg()
            > TRANSFER_TOLERANCE_KG;
        if has_matter && !outputs_ready {
            staged.last_error = Some(
                "Furnace requires connected solid-product and gas-exhaust destinations before reactions can proceed"
                    .to_string(),
            );
            staged.operating_state = PackedOperatingState::Blocked;
        } else if staged.pending_feed_mass_kg() > TRANSFER_TOLERANCE_KG
            && introduced_mass_kg <= TRANSFER_TOLERANCE_KG
        {
            staged.last_error = Some("Furnace solid product is backpressured".to_string());
            staged.operating_state = PackedOperatingState::Blocked;
        } else {
            staged.last_error = None;
            staged.operating_state = if has_matter {
                PackedOperatingState::Running
            } else {
                PackedOperatingState::Idle
            };
        }
        staged.incoming_mass_since_last_simulation_kg = 0.0;

        if let (Some(target), Some(staged_target)) = (product_sink, staged_sink) {
            *target = staged_target;
        }
        if let (Some(target), Some(staged_target)) = (gas_vent, staged_vent) {
            *target = staged_target;
        }
        let result = PackedRoastingFurnaceTickResult {
            operating_state: staged.operating_state,
            introduced_mass_kg,
            discharged_mass_kg,
            vented_gas_mass_kg,
        };
        *self = staged;
        Ok(result)
    }

    pub fn tick_to_hopper_and_vent(
        &mut self,
        product_hopper: Option<&mut PackedHopperState>,
        gas_vent: Option<&mut PackedGasBody>,
        thermal: &PackedSpeciesThermalTable,
        reaction: &PackedGoethiteReactionTables,
        dt: f64,
    ) -> Result<PackedRoastingFurnaceTickResult, String> {
        self.tick_internal(product_hopper, gas_vent, thermal, reaction, dt)
    }
}

impl PackedSolidProductSink for PackedRoastingFurnaceRuntime {
    fn free_capacity_kg_for_dt(&self, dt: f64) -> Result<f64, String> {
        self.input_capacity_kg(dt)
    }

    fn receive_product_body(&mut self, body: &PackedSolidBody, dt: f64) -> Result<f64, String> {
        self.receive_feed(body, dt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use interlink_core::FractionDescriptor;
    use interlink_thermal::{set_solid_body_temperature_k, PackedSpeciesThermalTable};
    use interlink_thermochemistry::{
        PackedGoethiteReactionConfig, PackedGoethiteReactionTables,
    };

    const GOETHITE: u16 = 1;
    const HEMATITE: u16 = 2;
    const WATER: u16 = 3;
    const SIZE: u8 = 4;
    const LOCKED: u8 = 1;

    fn thermal() -> PackedSpeciesThermalTable {
        let mut table = PackedSpeciesThermalTable::new();
        table
            .set_specific_heat_capacity_j_per_kg_k(GOETHITE, 650.0)
            .unwrap();
        table
            .set_specific_heat_capacity_j_per_kg_k(HEMATITE, 650.0)
            .unwrap();
        table
            .set_specific_heat_capacity_j_per_kg_k(WATER, 1900.0)
            .unwrap();
        table
    }

    fn reaction() -> PackedGoethiteReactionTables {
        let config = PackedGoethiteReactionConfig::new(
            GOETHITE,
            HEMATITE,
            WATER,
            0.177702,
            0.159687,
            0.018015,
            90_000.0,
            90_000.0,
            60_000.0,
        )
        .unwrap();
        let mut tables = PackedGoethiteReactionTables::new(config);
        tables.set_size_factor(SIZE, 1.0).unwrap();
        tables
    }

    fn furnace(enabled: bool) -> PackedRoastingFurnaceRuntime {
        PackedRoastingFurnaceRuntime::new(
            PackedRoastingFurnaceConfig::new(
                900.0, 100.0, 1_200.0, 5.0, 4.0, 20.0, 4, enabled,
            )
            .unwrap(),
        )
    }

    fn feed_body(mass_kg: f64) -> PackedSolidBody {
        let mut state = PackedSolidState::new();
        state
            .push_fraction(
                FractionDescriptor {
                    species_id: GOETHITE,
                    size_bin_id: SIZE,
                    liberation_class_id: LOCKED,
                    texture_profile_id: 0,
                },
                mass_kg,
            )
            .unwrap();
        PackedSolidBody::new(state, 0.0).unwrap()
    }

    #[test]
    fn inlet_capacity_matches_one_step_transport_buffer() {
        let mut furnace = furnace(true);
        assert!((furnace.input_capacity_kg(0.1).unwrap() - 0.5).abs() < 1e-12);
        furnace.receive_feed(&feed_body(0.2), 0.1).unwrap();
        assert!((furnace.input_capacity_kg(0.1).unwrap() - 0.3).abs() < 1e-12);
    }

    #[test]
    fn furnace_heats_retained_charge_and_requires_both_outputs_for_reaction() {
        let thermal = thermal();
        let reaction = reaction();
        let mut furnace = furnace(true);
        furnace.receive_feed(&feed_body(0.5), 0.1).unwrap();
        let first = furnace
            .tick_to_hopper_and_vent(None, None, &thermal, &reaction, 0.1)
            .unwrap();
        assert_eq!(first.operating_state, PackedOperatingState::Blocked);
        assert!(furnace.charge_mass_kg() > 0.0);
        assert_eq!(furnace.diagnostics().last_reaction_energy_demand_j, 0.0);
        // Charge entered at reference temperature and begins heating on the next tick,
        // matching production's heat -> react -> move ordering.
        let before = furnace.diagnostics().actual_charge_temperature_k;
        furnace
            .tick_to_hopper_and_vent(None, None, &thermal, &reaction, 0.1)
            .unwrap();
        assert!(furnace.diagnostics().actual_charge_temperature_k > before);
    }

    #[test]
    fn furnace_generates_water_gas_and_conserves_material_through_output_path() {
        let thermal = thermal();
        let reaction = reaction();
        let mut furnace = furnace(true);
        let mut product = PackedHopperState::empty(100.0).unwrap();
        let mut vent = PackedGasBody::empty();
        furnace.receive_feed(&feed_body(0.5), 0.1).unwrap();
        // Fill the first zone, then heat/react while continuing to advance material.
        for _ in 0..80 {
            let _ = furnace
                .tick_to_hopper_and_vent(
                    Some(&mut product),
                    Some(&mut vent),
                    &thermal,
                    &reaction,
                    0.1,
                )
                .unwrap();
        }
        assert!(vent.total_mass_kg() > 0.0);
        assert!(furnace.diagnostics().last_solver_evaluation_count > 0);
        let total_mass = furnace.charge_mass_kg()
            + furnace.pending_feed_mass_kg()
            + product.stored_mass_kg()
            + vent.total_mass_kg();
        assert!((total_mass - 0.5).abs() < 1e-8);
    }

    #[test]
    fn full_product_hopper_backpressures_pending_feed_atomically() {
        let thermal = thermal();
        let reaction = reaction();
        let mut furnace = furnace(true);
        let mut product = PackedHopperState::empty(0.1).unwrap();
        product
            .receive_body(&feed_body(0.1))
            .expect("fill product hopper");
        let mut vent = PackedGasBody::empty();
        // Load all four zones to their one-kilogram capacity plus pending feed.
        for zone in &mut furnace.zones {
            *zone = feed_body(1.0);
        }
        furnace.pending_feed = feed_body(0.2);
        let result = furnace
            .tick_to_hopper_and_vent(
                Some(&mut product),
                Some(&mut vent),
                &thermal,
                &reaction,
                0.1,
            )
            .unwrap();
        assert_eq!(result.operating_state, PackedOperatingState::Blocked);
        assert!((furnace.pending_feed_mass_kg() - 0.2).abs() < 1e-12);
        assert_eq!(result.introduced_mass_kg, 0.0);
    }

    #[test]
    fn furnace_can_be_a_product_sink_for_future_rust_graph_chaining() {
        let mut target = furnace(true);
        let accepted = PackedSolidProductSink::receive_product_body(
            &mut target,
            &feed_body(0.25),
            0.1,
        )
        .unwrap();
        assert!((accepted - 0.25).abs() < 1e-12);
        assert!((target.pending_feed_mass_kg() - 0.25).abs() < 1e-12);
    }

    #[test]
    fn disabled_furnace_does_not_advance_state() {
        let thermal = thermal();
        let reaction = reaction();
        let mut furnace = furnace(false);
        let mut product = PackedHopperState::empty(100.0).unwrap();
        let mut vent = PackedGasBody::empty();
        let result = furnace
            .tick_to_hopper_and_vent(
                Some(&mut product),
                Some(&mut vent),
                &thermal,
                &reaction,
                0.1,
            )
            .unwrap();
        assert_eq!(result.operating_state, PackedOperatingState::Off);
        assert_eq!(product.stored_mass_kg(), 0.0);
        assert_eq!(vent.total_mass_kg(), 0.0);
    }

    #[test]
    fn hot_feed_temperature_is_preserved_on_receive() {
        let thermal = thermal();
        let mut body = feed_body(0.2);
        set_solid_body_temperature_k(&mut body, &thermal, 700.0).unwrap();
        let mut furnace = furnace(true);
        furnace.receive_feed(&body, 0.1).unwrap();
        assert!((furnace.pending_feed.sensible_enthalpy_j() - body.sensible_enthalpy_j()).abs() < 1e-12);
    }
}
