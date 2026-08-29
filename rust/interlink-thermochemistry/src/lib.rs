use std::collections::HashMap;

use interlink_core::{
    FractionDescriptor, PackedSolidBody, PackedSolidState, SOLID_MATERIAL_TOLERANCE,
};
use interlink_thermal::{
    sensible_enthalpy_j_at_temperature, solid_body_temperature_k, PackedGasBody,
    PackedGasState, PackedSpeciesThermalTable, GAS_MATERIAL_TOLERANCE,
    THERMAL_REFERENCE_TEMPERATURE_K,
};

pub const GAS_CONSTANT_J_PER_MOL_K: f64 = 8.314_462_618;
pub const REACTION_SOLVE_ITERATIONS: usize = 32;
pub const REACTION_SOLVE_TOLERANCE_K: f64 = 0.01;
pub const MINIMUM_ABSOLUTE_TEMPERATURE_K: f64 = 1.0;

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

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

/// Numeric execution contract for the current goethite dehydroxylation model.
/// Canonical reaction/species/texture strings are resolved before entering the
/// Rust hot path. The algorithm remains content-driven even though today's game
/// has one thermochemical reaction.
#[derive(Debug, Clone)]
pub struct PackedGoethiteReactionConfig {
    pub source_species_id: u16,
    pub solid_product_species_id: u16,
    pub gas_product_species_id: u16,
    pub source_mass_per_extent_kg: f64,
    pub solid_product_mass_per_extent_kg: f64,
    pub gas_product_mass_per_extent_kg: f64,
    pub reaction_enthalpy_j_per_mol_extent: f64,
    pub activation_energy_j_per_mol: f64,
    pub pre_exponential_factor_per_second: f64,
}

impl PackedGoethiteReactionConfig {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        source_species_id: u16,
        solid_product_species_id: u16,
        gas_product_species_id: u16,
        source_mass_per_extent_kg: f64,
        solid_product_mass_per_extent_kg: f64,
        gas_product_mass_per_extent_kg: f64,
        reaction_enthalpy_j_per_mol_extent: f64,
        activation_energy_j_per_mol: f64,
        pre_exponential_factor_per_second: f64,
    ) -> Result<Self, String> {
        validate_positive_finite(source_mass_per_extent_kg, "reaction source mass per extent")?;
        validate_positive_finite(
            solid_product_mass_per_extent_kg,
            "reaction solid product mass per extent",
        )?;
        validate_positive_finite(
            gas_product_mass_per_extent_kg,
            "reaction gas product mass per extent",
        )?;
        validate_finite(
            reaction_enthalpy_j_per_mol_extent,
            "reaction enthalpy per mol extent",
        )?;
        validate_positive_finite(activation_energy_j_per_mol, "reaction activation energy")?;
        validate_non_negative_finite(
            pre_exponential_factor_per_second,
            "reaction pre-exponential factor",
        )?;
        let products = solid_product_mass_per_extent_kg + gas_product_mass_per_extent_kg;
        let tolerance = 1e-9 * source_mass_per_extent_kg.max(products).max(1.0);
        if (source_mass_per_extent_kg - products).abs() > tolerance {
            return Err("reaction extent masses must conserve total mass".to_string());
        }
        Ok(Self {
            source_species_id,
            solid_product_species_id,
            gas_product_species_id,
            source_mass_per_extent_kg,
            solid_product_mass_per_extent_kg,
            gas_product_mass_per_extent_kg,
            reaction_enthalpy_j_per_mol_extent,
            activation_energy_j_per_mol,
            pre_exponential_factor_per_second,
        })
    }
}

/// Per-runtime metadata needed by the reaction kernel. Size factors already
/// include the canonical particle-size exponent/clamps. Texture mappings point
/// each source geological lineage to the canonical reaction-derived lineage ID.
#[derive(Debug, Clone)]
pub struct PackedGoethiteReactionTables {
    config: PackedGoethiteReactionConfig,
    size_factor_by_bin: HashMap<u8, f64>,
    product_texture_by_source_texture: HashMap<u32, u32>,
}

impl PackedGoethiteReactionTables {
    pub fn new(config: PackedGoethiteReactionConfig) -> Self {
        Self {
            config,
            size_factor_by_bin: HashMap::new(),
            product_texture_by_source_texture: HashMap::new(),
        }
    }

    pub fn config(&self) -> &PackedGoethiteReactionConfig {
        &self.config
    }

    pub fn set_size_factor(&mut self, size_bin_id: u8, factor: f64) -> Result<(), String> {
        validate_positive_finite(factor, "reaction particle-size factor")?;
        self.size_factor_by_bin.insert(size_bin_id, factor);
        Ok(())
    }

    pub fn set_product_texture_mapping(
        &mut self,
        source_texture_profile_id: u32,
        product_texture_profile_id: u32,
    ) -> Result<(), String> {
        if source_texture_profile_id == 0 {
            if product_texture_profile_id != 0 {
                return Err("untextured reaction material must remain untextured".to_string());
            }
            return Ok(());
        }
        if product_texture_profile_id == 0 {
            return Err("textured reaction material requires a derived product texture".to_string());
        }
        self.product_texture_by_source_texture
            .insert(source_texture_profile_id, product_texture_profile_id);
        Ok(())
    }

    pub fn size_factor(&self, size_bin_id: u8) -> Result<f64, String> {
        self.size_factor_by_bin
            .get(&size_bin_id)
            .copied()
            .ok_or_else(|| format!("Missing reaction particle-size factor for runtime bin {size_bin_id}"))
    }

    pub fn product_texture_id(&self, source_texture_profile_id: u32) -> Result<u32, String> {
        if source_texture_profile_id == 0 {
            return Ok(0);
        }
        self.product_texture_by_source_texture
            .get(&source_texture_profile_id)
            .copied()
            .ok_or_else(|| {
                format!(
                    "Missing reaction-derived texture mapping for runtime texture {source_texture_profile_id}"
                )
            })
    }
}

#[derive(Debug, Clone, Copy)]
struct ReactiveFraction {
    descriptor: FractionDescriptor,
    quantity_kg: f64,
    size_factor: f64,
}

#[derive(Debug, Clone)]
struct CompiledReactionModel {
    reactive_fractions: Vec<ReactiveFraction>,
    input_heat_capacity_j_per_k: f64,
    solid_heat_capacity_delta_per_extent_j_per_k: f64,
    gas_heat_capacity_per_extent_j_per_k: f64,
}

#[derive(Debug, Clone, Copy)]
struct ResolvedFractionExtent {
    consumed_kg: f64,
    extent_mol: f64,
    solid_product_kg: f64,
    gas_product_kg: f64,
}

#[derive(Debug, Clone, Copy)]
struct ScalarEvaluation {
    kinetic_temperature_k: f64,
    reaction_extent_mol: f64,
    reaction_energy_demand_j: f64,
    energy_balanced_temperature_k: f64,
    residual_k: f64,
}

#[derive(Debug, Clone, Copy)]
struct SolvedReactionState {
    kinetic_temperature_k: f64,
    reaction_extent_mol: f64,
    reaction_energy_demand_j: f64,
    final_temperature_k: f64,
    solver_evaluation_count: usize,
}

#[derive(Debug, Clone)]
pub struct PackedThermochemicalReactionResult {
    pub solid_product_body: PackedSolidBody,
    pub gas_product_body: PackedGasBody,
    pub reaction_extent_mol: f64,
    pub temperature_k: f64,
    pub reaction_energy_demand_j: f64,
    pub solver_evaluation_count: usize,
}

fn compile_reaction_model(
    feed_body: &PackedSolidBody,
    thermal: &PackedSpeciesThermalTable,
    tables: &PackedGoethiteReactionTables,
) -> Result<CompiledReactionModel, String> {
    let mut reactive_fractions = Vec::new();
    for index in 0..feed_body.solid_state().len() {
        let descriptor = feed_body
            .solid_state()
            .descriptor_at(index)
            .expect("packed solid columns share one length");
        let quantity_kg = feed_body
            .solid_state()
            .quantity_at(index)
            .expect("packed solid columns share one length");
        if descriptor.species_id == tables.config.source_species_id {
            reactive_fractions.push(ReactiveFraction {
                descriptor,
                quantity_kg,
                size_factor: tables.size_factor(descriptor.size_bin_id)?,
            });
        }
    }

    let source_cp = thermal
        .specific_heat_capacity_j_per_kg_k(tables.config.source_species_id)?;
    let solid_product_cp = thermal
        .specific_heat_capacity_j_per_kg_k(tables.config.solid_product_species_id)?;
    let gas_product_cp = thermal
        .specific_heat_capacity_j_per_kg_k(tables.config.gas_product_species_id)?;
    let input_heat_capacity_j_per_k =
        thermal.heat_capacity_j_per_k(feed_body.solid_state())?;
    Ok(CompiledReactionModel {
        reactive_fractions,
        input_heat_capacity_j_per_k,
        solid_heat_capacity_delta_per_extent_j_per_k:
            tables.config.solid_product_mass_per_extent_kg * solid_product_cp
                - tables.config.source_mass_per_extent_kg * source_cp,
        gas_heat_capacity_per_extent_j_per_k:
            tables.config.gas_product_mass_per_extent_kg * gas_product_cp,
    })
}

fn reaction_extent_for_consumed_mass(
    fraction_quantity_kg: f64,
    requested_consumed_kg: f64,
    config: &PackedGoethiteReactionConfig,
) -> Option<ResolvedFractionExtent> {
    let mut consumed_kg = requested_consumed_kg;
    if consumed_kg <= 0.0 {
        return None;
    }
    let remaining_kg = fraction_quantity_kg - consumed_kg;
    if remaining_kg > 0.0 && remaining_kg <= SOLID_MATERIAL_TOLERANCE {
        consumed_kg = fraction_quantity_kg;
    }
    let extent_mol = consumed_kg / config.source_mass_per_extent_kg;
    let solid_product_kg = extent_mol * config.solid_product_mass_per_extent_kg;
    let gas_product_kg = extent_mol * config.gas_product_mass_per_extent_kg;
    if solid_product_kg <= SOLID_MATERIAL_TOLERANCE
        || gas_product_kg <= GAS_MATERIAL_TOLERANCE
    {
        return None;
    }
    Some(ResolvedFractionExtent {
        consumed_kg,
        extent_mol,
        solid_product_kg,
        gas_product_kg,
    })
}

fn evaluate_reaction_extent(
    model: &CompiledReactionModel,
    config: &PackedGoethiteReactionConfig,
    kinetic_temperature_k: f64,
    residence_time_seconds: f64,
) -> f64 {
    if model.reactive_fractions.is_empty() || residence_time_seconds <= 0.0 {
        return 0.0;
    }
    let arrhenius_base_rate_per_second = config.pre_exponential_factor_per_second
        * (-config.activation_energy_j_per_mol
            / (GAS_CONSTANT_J_PER_MOL_K * kinetic_temperature_k))
            .exp();
    let mut reaction_extent_mol = 0.0;
    for entry in &model.reactive_fractions {
        let conversion = clamp(
            1.0 - (-arrhenius_base_rate_per_second
                * entry.size_factor
                * residence_time_seconds)
                .exp(),
            0.0,
            1.0,
        );
        if let Some(resolved) = reaction_extent_for_consumed_mass(
            entry.quantity_kg,
            entry.quantity_kg * conversion,
            config,
        ) {
            reaction_extent_mol += resolved.extent_mol;
        }
    }
    reaction_extent_mol
}

fn scalar_evaluation(
    model: &CompiledReactionModel,
    config: &PackedGoethiteReactionConfig,
    initial_temperature_k: f64,
    initial_sensible_enthalpy_j: f64,
    residence_time_seconds: f64,
    candidate_final_temperature_k: f64,
) -> ScalarEvaluation {
    let kinetic_temperature_k = MINIMUM_ABSOLUTE_TEMPERATURE_K.max(
        (initial_temperature_k + candidate_final_temperature_k) / 2.0,
    );
    let reaction_extent_mol = evaluate_reaction_extent(
        model,
        config,
        kinetic_temperature_k,
        residence_time_seconds,
    );
    let total_heat_capacity_j_per_k = model.input_heat_capacity_j_per_k
        + reaction_extent_mol
            * (model.solid_heat_capacity_delta_per_extent_j_per_k
                + model.gas_heat_capacity_per_extent_j_per_k);
    let reaction_energy_demand_j =
        reaction_extent_mol * config.reaction_enthalpy_j_per_mol_extent;
    let energy_balanced_temperature_k = if total_heat_capacity_j_per_k <= 0.0 {
        THERMAL_REFERENCE_TEMPERATURE_K
    } else {
        THERMAL_REFERENCE_TEMPERATURE_K
            + (initial_sensible_enthalpy_j - reaction_energy_demand_j)
                / total_heat_capacity_j_per_k
    };
    ScalarEvaluation {
        kinetic_temperature_k,
        reaction_extent_mol,
        reaction_energy_demand_j,
        energy_balanced_temperature_k,
        residual_k: candidate_final_temperature_k - energy_balanced_temperature_k,
    }
}

fn solve_reaction_at_final_temperature(
    feed_body: &PackedSolidBody,
    residence_time_seconds: f64,
    thermal: &PackedSpeciesThermalTable,
    tables: &PackedGoethiteReactionTables,
) -> Result<(CompiledReactionModel, SolvedReactionState), String> {
    let initial_temperature_k = solid_body_temperature_k(feed_body, thermal)?;
    let initial_sensible_enthalpy_j = feed_body.sensible_enthalpy_j();
    let model = compile_reaction_model(feed_body, thermal, tables)?;
    let mut solver_evaluation_count = 0usize;
    let mut evaluate = |candidate_final_temperature_k: f64| {
        solver_evaluation_count += 1;
        scalar_evaluation(
            &model,
            &tables.config,
            initial_temperature_k,
            initial_sensible_enthalpy_j,
            residence_time_seconds,
            candidate_final_temperature_k,
        )
    };

    let mut low_k = MINIMUM_ABSOLUTE_TEMPERATURE_K;
    let mut high_k = MINIMUM_ABSOLUTE_TEMPERATURE_K.max(initial_temperature_k);
    let high_evaluation = evaluate(high_k);
    let finish = |evaluation: ScalarEvaluation, count: usize| -> Result<SolvedReactionState, String> {
        let final_temperature_k = evaluation.energy_balanced_temperature_k;
        if !final_temperature_k.is_finite() || final_temperature_k <= 0.0 {
            return Err("Thermochemical reaction solved to an invalid absolute temperature".to_string());
        }
        Ok(SolvedReactionState {
            kinetic_temperature_k: evaluation.kinetic_temperature_k,
            reaction_extent_mol: evaluation.reaction_extent_mol,
            reaction_energy_demand_j: evaluation.reaction_energy_demand_j,
            final_temperature_k,
            solver_evaluation_count: count,
        })
    };

    if high_evaluation.residual_k.abs() <= REACTION_SOLVE_TOLERANCE_K {
        let solved = finish(high_evaluation, solver_evaluation_count)?;
        return Ok((model, solved));
    }
    let low_evaluation = evaluate(low_k);
    if low_evaluation.residual_k > 0.0 {
        return Err("Thermochemical reaction has no positive-temperature energy solution".to_string());
    }

    let mut evaluation = high_evaluation;
    for _ in 0..REACTION_SOLVE_ITERATIONS {
        let midpoint_k = (low_k + high_k) / 2.0;
        evaluation = evaluate(midpoint_k);
        if evaluation.residual_k.abs() <= REACTION_SOLVE_TOLERANCE_K {
            let solved = finish(evaluation, solver_evaluation_count)?;
            return Ok((model, solved));
        }
        if evaluation.residual_k > 0.0 {
            high_k = midpoint_k;
        } else {
            low_k = midpoint_k;
        }
    }
    evaluation = evaluate((low_k + high_k) / 2.0);
    let solved = finish(evaluation, solver_evaluation_count)?;
    Ok((model, solved))
}

fn materialize_reaction_products(
    feed_body: &PackedSolidBody,
    model: &CompiledReactionModel,
    tables: &PackedGoethiteReactionTables,
    kinetic_temperature_k: f64,
    residence_time_seconds: f64,
) -> Result<(PackedSolidBody, PackedGasBody, f64), String> {
    let config = &tables.config;
    let arrhenius_base_rate_per_second = if residence_time_seconds <= 0.0 {
        0.0
    } else {
        config.pre_exponential_factor_per_second
            * (-config.activation_energy_j_per_mol
                / (GAS_CONSTANT_J_PER_MOL_K * kinetic_temperature_k))
                .exp()
    };
    let mut solid_state = PackedSolidState::new();
    let mut total_gas_product_kg = 0.0;
    let mut reaction_extent_mol = 0.0;

    for index in 0..feed_body.solid_state().len() {
        let descriptor = feed_body
            .solid_state()
            .descriptor_at(index)
            .expect("packed solid columns share one length");
        let quantity_kg = feed_body
            .solid_state()
            .quantity_at(index)
            .expect("packed solid columns share one length");
        if descriptor.species_id != config.source_species_id {
            solid_state.push_fraction(descriptor, quantity_kg)?;
            continue;
        }
        let size_factor = tables.size_factor(descriptor.size_bin_id)?;
        let conversion = clamp(
            1.0 - (-arrhenius_base_rate_per_second * size_factor * residence_time_seconds).exp(),
            0.0,
            1.0,
        );
        let Some(resolved) = reaction_extent_for_consumed_mass(
            quantity_kg,
            quantity_kg * conversion,
            config,
        ) else {
            solid_state.push_fraction(descriptor, quantity_kg)?;
            continue;
        };

        let remaining_kg = (quantity_kg - resolved.consumed_kg).max(0.0);
        if remaining_kg > SOLID_MATERIAL_TOLERANCE {
            solid_state.push_fraction(descriptor, remaining_kg)?;
        }
        let product_descriptor = FractionDescriptor {
            species_id: config.solid_product_species_id,
            size_bin_id: descriptor.size_bin_id,
            liberation_class_id: descriptor.liberation_class_id,
            texture_profile_id: tables.product_texture_id(descriptor.texture_profile_id)?,
        };
        solid_state.push_fraction(product_descriptor, resolved.solid_product_kg)?;
        total_gas_product_kg += resolved.gas_product_kg;
        reaction_extent_mol += resolved.extent_mol;
    }

    // Ensure detailed materialization and the scalar model used exactly the same
    // set of reactive populations even when the feed contains no reaction source.
    if model.reactive_fractions.is_empty() {
        debug_assert_eq!(reaction_extent_mol, 0.0);
    }

    let mut gas_state = PackedGasState::new();
    if total_gas_product_kg > GAS_MATERIAL_TOLERANCE {
        gas_state.push_species(config.gas_product_species_id, total_gas_product_kg)?;
    }
    Ok((
        PackedSolidBody::new(solid_state, 0.0)?,
        PackedGasBody::new(gas_state, 0.0)?,
        reaction_extent_mol,
    ))
}

/// Pure bounded thermochemical kernel matching the production
/// `applyGoethiteDehydroxylation` algorithm. Furnace machinery supplies sensible
/// heat and elapsed residence time; this function owns kinetics, stoichiometry,
/// texture lineage, gas generation, and the reaction energy balance.
pub fn apply_goethite_dehydroxylation(
    feed_body: &PackedSolidBody,
    residence_time_seconds: f64,
    thermal: &PackedSpeciesThermalTable,
    tables: &PackedGoethiteReactionTables,
) -> Result<PackedThermochemicalReactionResult, String> {
    validate_non_negative_finite(residence_time_seconds, "Reaction residenceTimeSeconds")?;
    let (model, solved) = solve_reaction_at_final_temperature(
        feed_body,
        residence_time_seconds,
        thermal,
        tables,
    )?;
    let (mut solid_product_body, mut gas_product_body, materialized_extent_mol) =
        materialize_reaction_products(
            feed_body,
            &model,
            tables,
            solved.kinetic_temperature_k,
            residence_time_seconds,
        )?;
    let extent_delta = (materialized_extent_mol - solved.reaction_extent_mol).abs();
    if extent_delta > 1e-10 * solved.reaction_extent_mol.abs().max(1.0) {
        return Err(
            "Thermochemical scalar solve and materialization disagree on reaction extent"
                .to_string(),
        );
    }

    let solid_capacity_j_per_k = model.input_heat_capacity_j_per_k
        + solved.reaction_extent_mol * model.solid_heat_capacity_delta_per_extent_j_per_k;
    let gas_capacity_j_per_k =
        solved.reaction_extent_mol * model.gas_heat_capacity_per_extent_j_per_k;
    solid_product_body.set_sensible_enthalpy_j(sensible_enthalpy_j_at_temperature(
        solved.final_temperature_k,
        solid_capacity_j_per_k,
    )?)?;
    gas_product_body.set_sensible_enthalpy_j(sensible_enthalpy_j_at_temperature(
        solved.final_temperature_k,
        gas_capacity_j_per_k,
    )?)?;

    Ok(PackedThermochemicalReactionResult {
        solid_product_body,
        gas_product_body,
        reaction_extent_mol: solved.reaction_extent_mol,
        temperature_k: solved.final_temperature_k,
        reaction_energy_demand_j: solved.reaction_energy_demand_j,
        solver_evaluation_count: solved.solver_evaluation_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use interlink_thermal::{set_solid_body_temperature_k, PackedSpeciesThermalTable};

    const GOETHITE: u16 = 1;
    const HEMATITE: u16 = 2;
    const WATER: u16 = 3;
    const SIZE_FINE: u8 = 4;
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

    fn tables() -> PackedGoethiteReactionTables {
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
        // Production factor for representative size 0.1875 mm.
        let factor = ((1.0e-4_f64 / 1.875e-4_f64).powf(0.35)).clamp(0.1, 5.0);
        tables.set_size_factor(SIZE_FINE, factor).unwrap();
        tables.set_product_texture_mapping(7, 8).unwrap();
        tables
    }

    fn feed(texture_profile_id: u32) -> PackedSolidBody {
        let mut state = PackedSolidState::new();
        state
            .push_fraction(
                FractionDescriptor {
                    species_id: GOETHITE,
                    size_bin_id: SIZE_FINE,
                    liberation_class_id: LOCKED,
                    texture_profile_id,
                },
                1.0,
            )
            .unwrap();
        let mut body = PackedSolidBody::new(state, 0.0).unwrap();
        set_solid_body_temperature_k(&mut body, &thermal(), 900.0).unwrap();
        body
    }

    #[test]
    fn reaction_conserves_total_mass_and_energy_with_endothermic_demand() {
        let thermal = thermal();
        let input = feed(0);
        let input_mass = input.total_mass_kg();
        let input_energy = input.sensible_enthalpy_j();
        let result = apply_goethite_dehydroxylation(&input, 1.0, &thermal, &tables()).unwrap();
        let output_mass = result.solid_product_body.total_mass_kg()
            + result.gas_product_body.total_mass_kg();
        let output_energy = result.solid_product_body.sensible_enthalpy_j()
            + result.gas_product_body.sensible_enthalpy_j()
            + result.reaction_energy_demand_j;
        assert!((output_mass - input_mass).abs() < 1e-10);
        assert!((output_energy - input_energy).abs() < 1e-6);
        assert!(result.reaction_extent_mol > 0.0);
        assert!(result.temperature_k < 900.0);
        assert!(result.solver_evaluation_count > 0);
    }

    #[test]
    fn reaction_preserves_size_and_liberation_and_uses_derived_texture_mapping() {
        let thermal = thermal();
        let input = feed(7);
        let result = apply_goethite_dehydroxylation(&input, 1.0, &thermal, &tables()).unwrap();
        let columns = result.solid_product_body.solid_state().to_columns();
        let hematite_index = columns
            .species_ids
            .iter()
            .position(|species| *species == HEMATITE)
            .expect("reaction should produce hematite");
        assert_eq!(columns.size_bin_ids[hematite_index], SIZE_FINE);
        assert_eq!(columns.liberation_class_ids[hematite_index], LOCKED);
        assert_eq!(columns.texture_profile_ids[hematite_index], 8);
    }

    #[test]
    fn zero_residence_time_is_an_identity_energy_state() {
        let thermal = thermal();
        let input = feed(0);
        let result = apply_goethite_dehydroxylation(&input, 0.0, &thermal, &tables()).unwrap();
        assert!((result.solid_product_body.total_mass_kg() - 1.0).abs() < 1e-12);
        assert_eq!(result.gas_product_body.total_mass_kg(), 0.0);
        assert_eq!(result.reaction_extent_mol, 0.0);
        assert_eq!(result.reaction_energy_demand_j, 0.0);
        assert!((result.solid_product_body.sensible_enthalpy_j() - input.sensible_enthalpy_j()).abs() < 1e-6);
    }

    #[test]
    fn missing_derived_texture_mapping_is_rejected_before_product_commit() {
        let thermal = thermal();
        let input = feed(99);
        let error = apply_goethite_dehydroxylation(&input, 1.0, &thermal, &tables()).unwrap_err();
        assert!(error.contains("reaction-derived texture mapping"));
    }
}
