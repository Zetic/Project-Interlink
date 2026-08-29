use std::collections::HashMap;

use interlink_core::{PackedSolidBody, PackedSolidState, SOLID_MATERIAL_TOLERANCE};
pub use interlink_routing::PackedSpeciesThermalTable;

pub const THERMAL_REFERENCE_TEMPERATURE_K: f64 = 298.15;
pub const THERMAL_ENERGY_TOLERANCE_J: f64 = 1e-6;
pub const GAS_MATERIAL_TOLERANCE: f64 = 1e-9;

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

#[derive(Debug, Clone, PartialEq)]
pub struct PackedGasColumns {
    pub species_ids: Vec<u16>,
    pub quantities: Vec<f64>,
}

impl PackedGasColumns {
    pub fn len(&self) -> usize {
        self.quantities.len()
    }

    pub fn is_empty(&self) -> bool {
        self.quantities.is_empty()
    }

    fn validate_lengths(&self) -> Result<(), String> {
        if self.species_ids.len() != self.quantities.len() {
            return Err("packed gas columns must have identical lengths".to_string());
        }
        Ok(())
    }
}

/// Compact gas composition used by the execution runtime. Values are generic
/// quantities: gas bodies interpret them as kg while gas streams interpret them
/// as kg/s. Canonical string species IDs are compiled to runtime-local u16 IDs.
#[derive(Debug, Clone)]
pub struct PackedGasState {
    species_ids: Vec<u16>,
    quantities: Vec<f64>,
    index_by_species: HashMap<u16, usize>,
}

impl Default for PackedGasState {
    fn default() -> Self {
        Self::new()
    }
}

impl PackedGasState {
    pub fn new() -> Self {
        Self {
            species_ids: Vec::new(),
            quantities: Vec::new(),
            index_by_species: HashMap::new(),
        }
    }

    pub fn from_columns(columns: PackedGasColumns) -> Result<Self, String> {
        columns.validate_lengths()?;
        let mut result = Self::new();
        for index in 0..columns.len() {
            result.push_species(columns.species_ids[index], columns.quantities[index])?;
        }
        Ok(result)
    }

    pub fn len(&self) -> usize {
        self.quantities.len()
    }

    pub fn is_empty(&self) -> bool {
        self.quantities.is_empty()
    }

    pub fn clear(&mut self) {
        self.species_ids.clear();
        self.quantities.clear();
        self.index_by_species.clear();
    }

    pub fn push_species(&mut self, species_id: u16, quantity: f64) -> Result<(), String> {
        validate_non_negative_finite(quantity, "gas material quantity")?;
        if quantity <= GAS_MATERIAL_TOLERANCE {
            return Ok(());
        }
        if let Some(index) = self.index_by_species.get(&species_id).copied() {
            let merged = self.quantities[index] + quantity;
            validate_non_negative_finite(merged, "merged gas material quantity")?;
            self.quantities[index] = merged;
            return Ok(());
        }
        let index = self.quantities.len();
        self.species_ids.push(species_id);
        self.quantities.push(quantity);
        self.index_by_species.insert(species_id, index);
        Ok(())
    }

    pub fn total_quantity(&self) -> f64 {
        self.quantities
            .iter()
            .copied()
            .filter(|quantity| *quantity > GAS_MATERIAL_TOLERANCE)
            .sum()
    }

    pub fn scale_in_place(&mut self, factor: f64) -> Result<(), String> {
        validate_non_negative_finite(factor, "gas material scale factor")?;
        if factor <= GAS_MATERIAL_TOLERANCE {
            self.clear();
            return Ok(());
        }
        for quantity in &self.quantities {
            validate_non_negative_finite(*quantity * factor, "scaled gas material quantity")?;
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
        validate_non_negative_finite(factor, "gas material add factor")?;
        if factor <= GAS_MATERIAL_TOLERANCE {
            return Ok(());
        }
        for index in 0..source.len() {
            self.push_species(
                source.species_ids[index],
                source.quantities[index] * factor,
            )?;
        }
        Ok(())
    }

    pub fn proportional_share(&self, requested_quantity: f64) -> Result<Self, String> {
        validate_non_negative_finite(requested_quantity, "requested gas quantity")?;
        let total = self.total_quantity();
        if total <= GAS_MATERIAL_TOLERANCE || requested_quantity <= GAS_MATERIAL_TOLERANCE {
            return Ok(Self::new());
        }
        self.scaled((requested_quantity / total).min(1.0))
    }

    pub fn withdraw_quantity(&mut self, requested_quantity: f64) -> Result<Self, String> {
        validate_non_negative_finite(requested_quantity, "requested gas quantity")?;
        let total = self.total_quantity();
        if total <= GAS_MATERIAL_TOLERANCE || requested_quantity <= GAS_MATERIAL_TOLERANCE {
            return Ok(Self::new());
        }
        let actual = requested_quantity.min(total);
        let fraction = actual / total;
        let withdrawn = self.scaled(fraction)?;
        if actual >= total - GAS_MATERIAL_TOLERANCE {
            self.clear();
        } else {
            self.scale_in_place(1.0 - fraction)?;
        }
        Ok(withdrawn)
    }

    pub fn species_id_at(&self, index: usize) -> Option<u16> {
        self.species_ids.get(index).copied()
    }

    pub fn quantity_at(&self, index: usize) -> Option<f64> {
        self.quantities.get(index).copied()
    }

    pub fn to_columns(&self) -> PackedGasColumns {
        PackedGasColumns {
            species_ids: self.species_ids.clone(),
            quantities: self.quantities.clone(),
        }
    }

    fn prune_tolerance(&mut self) {
        if self
            .quantities
            .iter()
            .all(|quantity| *quantity > GAS_MATERIAL_TOLERANCE)
        {
            return;
        }
        let old = self.to_columns();
        self.clear();
        for index in 0..old.len() {
            let quantity = old.quantities[index];
            if quantity <= GAS_MATERIAL_TOLERANCE {
                continue;
            }
            self.push_species(old.species_ids[index], quantity)
                .expect("validated packed gas should remain valid");
        }
    }
}

/// Gas composition plus the same authoritative sensible-enthalpy ledger used by
/// canonical JavaScript MaterialBody objects. Temperature is always derived.
#[derive(Debug, Clone)]
pub struct PackedGasBody {
    gas_state: PackedGasState,
    sensible_enthalpy_j: f64,
}

impl PackedGasBody {
    pub fn new(gas_state: PackedGasState, sensible_enthalpy_j: f64) -> Result<Self, String> {
        validate_finite(sensible_enthalpy_j, "gas sensible enthalpy")?;
        Ok(Self {
            gas_state,
            sensible_enthalpy_j,
        })
    }

    pub fn empty() -> Self {
        Self {
            gas_state: PackedGasState::new(),
            sensible_enthalpy_j: 0.0,
        }
    }

    pub fn gas_state(&self) -> &PackedGasState {
        &self.gas_state
    }

    pub fn gas_state_mut(&mut self) -> &mut PackedGasState {
        &mut self.gas_state
    }

    pub fn sensible_enthalpy_j(&self) -> f64 {
        self.sensible_enthalpy_j
    }

    pub fn set_sensible_enthalpy_j(&mut self, value: f64) -> Result<(), String> {
        validate_finite(value, "gas sensible enthalpy")?;
        self.sensible_enthalpy_j = value;
        Ok(())
    }

    pub fn total_mass_kg(&self) -> f64 {
        self.gas_state.total_quantity()
    }

    pub fn specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        let mass = self.total_mass_kg();
        if mass <= GAS_MATERIAL_TOLERANCE {
            0.0
        } else {
            self.sensible_enthalpy_j / mass
        }
    }

    /// Conservatively mix another gas body into this one. Adding species masses
    /// and sensible enthalpy is sufficient because equilibrium temperature is a
    /// derived property of the resulting mixed body.
    pub fn add_body(&mut self, incoming: &PackedGasBody) -> Result<f64, String> {
        let incoming_mass = incoming.total_mass_kg();
        if incoming_mass <= GAS_MATERIAL_TOLERANCE {
            return Ok(0.0);
        }
        let mut staged = self.clone();
        staged.gas_state.add_scaled_from(incoming.gas_state(), 1.0)?;
        let next_enthalpy = staged.sensible_enthalpy_j + incoming.sensible_enthalpy_j();
        validate_finite(next_enthalpy, "mixed gas sensible enthalpy")?;
        staged.sensible_enthalpy_j = next_enthalpy;
        *self = staged;
        Ok(incoming_mass)
    }

    /// Receive a continuous gas stream. Stream state quantities are kg/s.
    pub fn receive_flow(
        &mut self,
        flow: &PackedGasState,
        dt: f64,
        specific_sensible_enthalpy_j_per_kg: f64,
    ) -> Result<f64, String> {
        validate_positive_finite(dt, "gas receive dt")?;
        validate_finite(
            specific_sensible_enthalpy_j_per_kg,
            "gas flow specific sensible enthalpy",
        )?;
        let total_rate = flow.total_quantity();
        let accepted_mass = total_rate * dt;
        validate_non_negative_finite(accepted_mass, "received gas mass")?;
        if accepted_mass <= GAS_MATERIAL_TOLERANCE {
            return Ok(0.0);
        }
        let mut staged = self.clone();
        staged.gas_state.add_scaled_from(flow, dt)?;
        let energy = accepted_mass * specific_sensible_enthalpy_j_per_kg;
        validate_finite(energy, "received gas sensible enthalpy")?;
        let next_enthalpy = staged.sensible_enthalpy_j + energy;
        validate_finite(next_enthalpy, "gas sensible enthalpy")?;
        staged.sensible_enthalpy_j = next_enthalpy;
        *self = staged;
        Ok(accepted_mass)
    }

    /// Withdraw a well-mixed proportional gas body while preserving specific
    /// sensible enthalpy.
    pub fn withdraw_mass(&mut self, requested_mass_kg: f64) -> Result<PackedGasWithdrawal, String> {
        validate_non_negative_finite(requested_mass_kg, "requested gas withdrawal mass")?;
        let stored_before = self.total_mass_kg();
        if stored_before <= GAS_MATERIAL_TOLERANCE || requested_mass_kg <= GAS_MATERIAL_TOLERANCE {
            return Ok(PackedGasWithdrawal {
                body: PackedGasBody::empty(),
                actual_mass_kg: 0.0,
            });
        }
        let mut staged = self.clone();
        let withdrawn_state = staged.gas_state.withdraw_quantity(requested_mass_kg)?;
        let actual_mass_kg = withdrawn_state.total_quantity();
        let fraction = actual_mass_kg / stored_before;
        let withdrawn_enthalpy_j = staged.sensible_enthalpy_j * fraction;
        validate_finite(withdrawn_enthalpy_j, "withdrawn gas sensible enthalpy")?;
        staged.sensible_enthalpy_j -= withdrawn_enthalpy_j;
        if staged.sensible_enthalpy_j.abs() <= THERMAL_ENERGY_TOLERANCE_J {
            staged.sensible_enthalpy_j = 0.0;
        }
        *self = staged;
        Ok(PackedGasWithdrawal {
            body: PackedGasBody::new(withdrawn_state, withdrawn_enthalpy_j)?,
            actual_mass_kg,
        })
    }
}

impl Default for PackedGasBody {
    fn default() -> Self {
        Self::empty()
    }
}

#[derive(Debug, Clone)]
pub struct PackedGasWithdrawal {
    pub body: PackedGasBody,
    pub actual_mass_kg: f64,
}

/// Continuous packed gas stream. Gas-state quantities are kg/s and specific
/// sensible enthalpy is J/kg.
#[derive(Debug, Clone)]
pub struct PackedGasStream {
    gas_state: PackedGasState,
    specific_sensible_enthalpy_j_per_kg: f64,
    total_mass_flow_kg_per_second: f64,
}

impl Default for PackedGasStream {
    fn default() -> Self {
        Self::new()
    }
}

impl PackedGasStream {
    pub fn new() -> Self {
        Self {
            gas_state: PackedGasState::new(),
            specific_sensible_enthalpy_j_per_kg: 0.0,
            total_mass_flow_kg_per_second: 0.0,
        }
    }

    pub fn from_state(
        gas_state: PackedGasState,
        specific_sensible_enthalpy_j_per_kg: f64,
    ) -> Result<Self, String> {
        validate_finite(
            specific_sensible_enthalpy_j_per_kg,
            "gas stream specific sensible enthalpy",
        )?;
        let total_mass_flow_kg_per_second = gas_state.total_quantity();
        validate_non_negative_finite(total_mass_flow_kg_per_second, "gas stream total mass flow")?;
        Ok(Self {
            gas_state,
            specific_sensible_enthalpy_j_per_kg,
            total_mass_flow_kg_per_second,
        })
    }

    pub fn clear(&mut self) {
        self.gas_state.clear();
        self.specific_sensible_enthalpy_j_per_kg = 0.0;
        self.total_mass_flow_kg_per_second = 0.0;
    }

    pub fn set_flow(
        &mut self,
        gas_state: &PackedGasState,
        specific_sensible_enthalpy_j_per_kg: f64,
    ) -> Result<(), String> {
        *self = Self::from_state(gas_state.clone(), specific_sensible_enthalpy_j_per_kg)?;
        Ok(())
    }

    pub fn gas_state(&self) -> &PackedGasState {
        &self.gas_state
    }

    pub fn specific_sensible_enthalpy_j_per_kg(&self) -> f64 {
        self.specific_sensible_enthalpy_j_per_kg
    }

    pub fn total_mass_flow_kg_per_second(&self) -> f64 {
        self.total_mass_flow_kg_per_second
    }
}

pub fn gas_heat_capacity_j_per_k(
    state: &PackedGasState,
    thermal: &PackedSpeciesThermalTable,
) -> Result<f64, String> {
    let mut total = 0.0;
    for index in 0..state.len() {
        let quantity = state
            .quantity_at(index)
            .expect("packed gas columns share one length");
        if quantity <= GAS_MATERIAL_TOLERANCE {
            continue;
        }
        let species_id = state
            .species_id_at(index)
            .expect("packed gas columns share one length");
        total += quantity * thermal.specific_heat_capacity_j_per_kg_k(species_id)?;
    }
    if !total.is_finite() || total < 0.0 {
        return Err("packed gas heat capacity must be finite and non-negative".to_string());
    }
    Ok(total)
}

pub fn solid_heat_capacity_j_per_k(
    state: &PackedSolidState,
    thermal: &PackedSpeciesThermalTable,
) -> Result<f64, String> {
    thermal.heat_capacity_j_per_k(state)
}

pub fn temperature_k_from_sensible_enthalpy(
    sensible_enthalpy_j: f64,
    heat_capacity_j_per_k: f64,
) -> Result<f64, String> {
    validate_finite(sensible_enthalpy_j, "sensibleEnthalpyJ")?;
    validate_finite(heat_capacity_j_per_k, "heatCapacityJPerK")?;
    if heat_capacity_j_per_k < 0.0 {
        return Err("heatCapacityJPerK must be non-negative".to_string());
    }
    if heat_capacity_j_per_k == 0.0 {
        return Ok(THERMAL_REFERENCE_TEMPERATURE_K);
    }
    let temperature_k =
        THERMAL_REFERENCE_TEMPERATURE_K + sensible_enthalpy_j / heat_capacity_j_per_k;
    if temperature_k <= 0.0 {
        return Err("Thermal state implies a non-positive absolute temperature".to_string());
    }
    Ok(temperature_k)
}

pub fn sensible_enthalpy_j_at_temperature(
    temperature_k: f64,
    heat_capacity_j_per_k: f64,
) -> Result<f64, String> {
    validate_finite(temperature_k, "temperatureK")?;
    validate_finite(heat_capacity_j_per_k, "heatCapacityJPerK")?;
    if temperature_k <= 0.0 {
        return Err("temperatureK must be positive".to_string());
    }
    if heat_capacity_j_per_k < 0.0 {
        return Err("heatCapacityJPerK must be non-negative".to_string());
    }
    Ok(heat_capacity_j_per_k * (temperature_k - THERMAL_REFERENCE_TEMPERATURE_K))
}

pub fn gas_body_temperature_k(
    body: &PackedGasBody,
    thermal: &PackedSpeciesThermalTable,
) -> Result<f64, String> {
    if body.sensible_enthalpy_j().abs() <= THERMAL_ENERGY_TOLERANCE_J {
        return Ok(THERMAL_REFERENCE_TEMPERATURE_K);
    }
    temperature_k_from_sensible_enthalpy(
        body.sensible_enthalpy_j(),
        gas_heat_capacity_j_per_k(body.gas_state(), thermal)?,
    )
}

pub fn solid_body_temperature_k(
    body: &PackedSolidBody,
    thermal: &PackedSpeciesThermalTable,
) -> Result<f64, String> {
    if body.sensible_enthalpy_j().abs() <= THERMAL_ENERGY_TOLERANCE_J {
        return Ok(THERMAL_REFERENCE_TEMPERATURE_K);
    }
    temperature_k_from_sensible_enthalpy(
        body.sensible_enthalpy_j(),
        solid_heat_capacity_j_per_k(body.solid_state(), thermal)?,
    )
}

pub fn set_gas_body_temperature_k(
    body: &mut PackedGasBody,
    thermal: &PackedSpeciesThermalTable,
    temperature_k: f64,
) -> Result<(), String> {
    let capacity = gas_heat_capacity_j_per_k(body.gas_state(), thermal)?;
    body.set_sensible_enthalpy_j(sensible_enthalpy_j_at_temperature(
        temperature_k,
        capacity,
    )?)
}

pub fn set_solid_body_temperature_k(
    body: &mut PackedSolidBody,
    thermal: &PackedSpeciesThermalTable,
    temperature_k: f64,
) -> Result<(), String> {
    let capacity = solid_heat_capacity_j_per_k(body.solid_state(), thermal)?;
    body.set_sensible_enthalpy_j(sensible_enthalpy_j_at_temperature(
        temperature_k,
        capacity,
    )?)
}

pub fn mix_gas_bodies(bodies: &[&PackedGasBody]) -> Result<PackedGasBody, String> {
    let mut result = PackedGasBody::empty();
    for body in bodies {
        result.add_body(body)?;
    }
    Ok(result)
}

/// Same signed ambient-transfer equation used by the production furnace. A
/// positive result means the material is hotter than ambient and loses energy;
/// a negative result means ambient supplies energy to the material.
pub fn ambient_heat_transfer_energy_j(
    temperature_k: f64,
    heat_transfer_coefficient_w_per_k: f64,
    dt: f64,
    ambient_temperature_k: f64,
) -> Result<f64, String> {
    validate_finite(temperature_k, "temperatureK")?;
    validate_finite(
        heat_transfer_coefficient_w_per_k,
        "heatTransferCoefficientWPerK",
    )?;
    validate_finite(dt, "dt")?;
    validate_finite(ambient_temperature_k, "ambientTemperatureK")?;
    if heat_transfer_coefficient_w_per_k < 0.0 {
        return Err("heatTransferCoefficientWPerK must be non-negative".to_string());
    }
    if dt < 0.0 {
        return Err("dt must be non-negative".to_string());
    }
    Ok(heat_transfer_coefficient_w_per_k
        * (temperature_k - ambient_temperature_k)
        * dt)
}

/// Clamp requested positive cooling so the body cannot be driven below a chosen
/// minimum absolute temperature. Negative requests (ambient heating) pass through.
pub fn bounded_cooling_energy_j(
    sensible_enthalpy_j: f64,
    heat_capacity_j_per_k: f64,
    requested_heat_loss_energy_j: f64,
    minimum_temperature_k: f64,
) -> Result<f64, String> {
    validate_finite(sensible_enthalpy_j, "sensibleEnthalpyJ")?;
    validate_finite(heat_capacity_j_per_k, "heatCapacityJPerK")?;
    validate_finite(requested_heat_loss_energy_j, "requestedHeatLossEnergyJ")?;
    validate_positive_finite(minimum_temperature_k, "minimumTemperatureK")?;
    if heat_capacity_j_per_k < 0.0 {
        return Err("heatCapacityJPerK must be non-negative".to_string());
    }
    if requested_heat_loss_energy_j <= 0.0 {
        return Ok(requested_heat_loss_energy_j);
    }
    let minimum_sensible_enthalpy_j =
        sensible_enthalpy_j_at_temperature(minimum_temperature_k, heat_capacity_j_per_k)?;
    Ok(requested_heat_loss_energy_j.min(
        (sensible_enthalpy_j - minimum_sensible_enthalpy_j).max(0.0),
    ))
}

/// Conductive exchange between two finite heat capacities. The unconstrained
/// Fourier-style transfer G*(Ta-Tb)*dt is clipped at the exact equilibrium
/// energy so a single large fixed step cannot numerically overshoot and invert
/// the temperature ordering. Positive energy flows from A to B.
pub fn bounded_conductive_heat_transfer_energy_j(
    temperature_a_k: f64,
    heat_capacity_a_j_per_k: f64,
    temperature_b_k: f64,
    heat_capacity_b_j_per_k: f64,
    conductance_w_per_k: f64,
    dt: f64,
) -> Result<f64, String> {
    for (value, label) in [
        (temperature_a_k, "temperatureAK"),
        (heat_capacity_a_j_per_k, "heatCapacityAJPerK"),
        (temperature_b_k, "temperatureBK"),
        (heat_capacity_b_j_per_k, "heatCapacityBJPerK"),
        (conductance_w_per_k, "conductanceWPerK"),
        (dt, "dt"),
    ] {
        validate_finite(value, label)?;
    }
    if temperature_a_k <= 0.0 || temperature_b_k <= 0.0 {
        return Err("heat-transfer temperatures must be positive".to_string());
    }
    if heat_capacity_a_j_per_k < 0.0 || heat_capacity_b_j_per_k < 0.0 {
        return Err("heat-transfer capacities must be non-negative".to_string());
    }
    if conductance_w_per_k < 0.0 || dt < 0.0 {
        return Err("heat-transfer conductance and dt must be non-negative".to_string());
    }
    if heat_capacity_a_j_per_k == 0.0
        || heat_capacity_b_j_per_k == 0.0
        || conductance_w_per_k == 0.0
        || dt == 0.0
    {
        return Ok(0.0);
    }
    let delta_temperature_k = temperature_a_k - temperature_b_k;
    if delta_temperature_k == 0.0 {
        return Ok(0.0);
    }
    let requested = conductance_w_per_k * delta_temperature_k * dt;
    let equilibrium = delta_temperature_k
        / (1.0 / heat_capacity_a_j_per_k + 1.0 / heat_capacity_b_j_per_k);
    let transfer = if requested.is_sign_positive() {
        requested.min(equilibrium.max(0.0))
    } else {
        requested.max(equilibrium.min(0.0))
    };
    validate_finite(transfer, "bounded heat-transfer energy")?;
    Ok(transfer)
}

/// Atomic sensible-heat exchange between one packed solid body and one packed
/// gas body. Positive returned energy moved from the solid into the gas.
pub fn exchange_heat_between_solid_and_gas(
    solid: &mut PackedSolidBody,
    gas: &mut PackedGasBody,
    thermal: &PackedSpeciesThermalTable,
    conductance_w_per_k: f64,
    dt: f64,
) -> Result<f64, String> {
    validate_non_negative_finite(conductance_w_per_k, "conductanceWPerK")?;
    validate_non_negative_finite(dt, "dt")?;
    if solid.total_mass_kg() <= SOLID_MATERIAL_TOLERANCE
        || gas.total_mass_kg() <= GAS_MATERIAL_TOLERANCE
        || conductance_w_per_k == 0.0
        || dt == 0.0
    {
        return Ok(0.0);
    }
    let solid_capacity = solid_heat_capacity_j_per_k(solid.solid_state(), thermal)?;
    let gas_capacity = gas_heat_capacity_j_per_k(gas.gas_state(), thermal)?;
    let solid_temperature = solid_body_temperature_k(solid, thermal)?;
    let gas_temperature = gas_body_temperature_k(gas, thermal)?;
    let transfer = bounded_conductive_heat_transfer_energy_j(
        solid_temperature,
        solid_capacity,
        gas_temperature,
        gas_capacity,
        conductance_w_per_k,
        dt,
    )?;
    if transfer.abs() <= THERMAL_ENERGY_TOLERANCE_J {
        return Ok(0.0);
    }

    let mut staged_solid = solid.clone();
    let mut staged_gas = gas.clone();
    staged_solid.set_sensible_enthalpy_j(staged_solid.sensible_enthalpy_j() - transfer)?;
    staged_gas.set_sensible_enthalpy_j(staged_gas.sensible_enthalpy_j() + transfer)?;
    // Validate both resulting absolute temperatures before committing.
    solid_body_temperature_k(&staged_solid, thermal)?;
    gas_body_temperature_k(&staged_gas, thermal)?;
    *solid = staged_solid;
    *gas = staged_gas;
    Ok(transfer)
}

#[cfg(test)]
mod tests {
    use super::*;
    use interlink_core::{FractionDescriptor, PackedSolidState};

    fn thermal() -> PackedSpeciesThermalTable {
        let mut table = PackedSpeciesThermalTable::new();
        table
            .set_specific_heat_capacity_j_per_kg_k(1, 1900.0)
            .unwrap();
        table
            .set_specific_heat_capacity_j_per_kg_k(2, 650.0)
            .unwrap();
        table
    }

    fn gas(species_id: u16, mass_kg: f64, temperature_k: f64) -> PackedGasBody {
        let mut state = PackedGasState::new();
        state.push_species(species_id, mass_kg).unwrap();
        let mut body = PackedGasBody::new(state, 0.0).unwrap();
        set_gas_body_temperature_k(&mut body, &thermal(), temperature_k).unwrap();
        body
    }

    fn solid(mass_kg: f64, temperature_k: f64) -> PackedSolidBody {
        let mut state = PackedSolidState::new();
        state
            .push_fraction(
                FractionDescriptor {
                    species_id: 2,
                    size_bin_id: 1,
                    liberation_class_id: 1,
                    texture_profile_id: 0,
                },
                mass_kg,
            )
            .unwrap();
        let mut body = PackedSolidBody::new(state, 0.0).unwrap();
        set_solid_body_temperature_k(&mut body, &thermal(), temperature_k).unwrap();
        body
    }

    #[test]
    fn gas_state_merges_scales_and_withdraws_conservatively() {
        let mut state = PackedGasState::new();
        state.push_species(1, 2.0).unwrap();
        state.push_species(1, 3.0).unwrap();
        state.push_species(2, 5.0).unwrap();
        assert_eq!(state.len(), 2);
        assert!((state.total_quantity() - 10.0).abs() < 1e-12);
        let withdrawn = state.withdraw_quantity(4.0).unwrap();
        assert!((withdrawn.total_quantity() - 4.0).abs() < 1e-12);
        assert!((state.total_quantity() - 6.0).abs() < 1e-12);
        assert!((withdrawn.to_columns().quantities[0] - 2.0).abs() < 1e-12);
        assert!((withdrawn.to_columns().quantities[1] - 2.0).abs() < 1e-12);
    }

    #[test]
    fn gas_temperature_matches_constant_cp_reference_contract() {
        let table = thermal();
        let body = gas(1, 2.0, 500.0);
        assert!((gas_heat_capacity_j_per_k(body.gas_state(), &table).unwrap() - 3800.0).abs() < 1e-12);
        assert!((gas_body_temperature_k(&body, &table).unwrap() - 500.0).abs() < 1e-10);
        assert!((body.sensible_enthalpy_j() - 3800.0 * (500.0 - 298.15)).abs() < 1e-8);
    }

    #[test]
    fn zero_sensible_energy_needs_no_property_coverage() {
        let mut state = PackedGasState::new();
        state.push_species(99, 1.0).unwrap();
        let body = PackedGasBody::new(state, 0.0).unwrap();
        assert_eq!(
            gas_body_temperature_k(&body, &PackedSpeciesThermalTable::new()).unwrap(),
            THERMAL_REFERENCE_TEMPERATURE_K
        );
    }

    #[test]
    fn gas_mixing_conserves_mass_and_energy_and_derives_equilibrium_temperature() {
        let table = thermal();
        let a = gas(1, 1.0, 400.0);
        let b = gas(1, 3.0, 600.0);
        let energy_before = a.sensible_enthalpy_j() + b.sensible_enthalpy_j();
        let mixed = mix_gas_bodies(&[&a, &b]).unwrap();
        assert!((mixed.total_mass_kg() - 4.0).abs() < 1e-12);
        assert!((mixed.sensible_enthalpy_j() - energy_before).abs() < 1e-8);
        assert!((gas_body_temperature_k(&mixed, &table).unwrap() - 550.0).abs() < 1e-10);
    }

    #[test]
    fn gas_stream_receive_preserves_specific_sensible_enthalpy() {
        let mut flow = PackedGasState::new();
        flow.push_species(1, 2.0).unwrap();
        let stream = PackedGasStream::from_state(flow, 1000.0).unwrap();
        let mut inventory = PackedGasBody::empty();
        let accepted = inventory
            .receive_flow(
                stream.gas_state(),
                0.25,
                stream.specific_sensible_enthalpy_j_per_kg(),
            )
            .unwrap();
        assert!((accepted - 0.5).abs() < 1e-12);
        assert!((inventory.total_mass_kg() - 0.5).abs() < 1e-12);
        assert!((inventory.sensible_enthalpy_j() - 500.0).abs() < 1e-12);
    }

    #[test]
    fn ambient_transfer_matches_existing_furnace_equation() {
        let loss = ambient_heat_transfer_energy_j(500.0, 10.0, 0.1, 298.15).unwrap();
        assert!((loss - 201.85).abs() < 1e-10);
    }

    #[test]
    fn conductive_exchange_is_bounded_at_equilibrium_and_conserves_energy() {
        let table = thermal();
        let mut solid = solid(1.0, 900.0);
        let mut gas = gas(1, 1.0, 300.0);
        let energy_before = solid.sensible_enthalpy_j() + gas.sensible_enthalpy_j();
        let transfer = exchange_heat_between_solid_and_gas(
            &mut solid,
            &mut gas,
            &table,
            1.0e9,
            0.1,
        )
        .unwrap();
        assert!(transfer > 0.0);
        let solid_temperature = solid_body_temperature_k(&solid, &table).unwrap();
        let gas_temperature = gas_body_temperature_k(&gas, &table).unwrap();
        assert!((solid_temperature - gas_temperature).abs() < 1e-9);
        assert!((solid.sensible_enthalpy_j() + gas.sensible_enthalpy_j() - energy_before).abs() < 1e-8);
    }

    #[test]
    fn bounded_cooling_cannot_cross_absolute_minimum() {
        let capacity = 100.0;
        let enthalpy = sensible_enthalpy_j_at_temperature(10.0, capacity).unwrap();
        let bounded = bounded_cooling_energy_j(enthalpy, capacity, 1.0e9, 1.0).unwrap();
        let final_enthalpy = enthalpy - bounded;
        assert!((temperature_k_from_sensible_enthalpy(final_enthalpy, capacity).unwrap() - 1.0).abs() < 1e-10);
    }
}
