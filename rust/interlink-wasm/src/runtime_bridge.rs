use interlink_comminution::{
    PackedComminutionConfig, PackedComminutionEquipment, PackedComminutionProperties,
    PackedComminutionRuntime, PackedSpeciesTexture,
};
use interlink_core::{PackedHopperState, PackedSolidBody, PackedSolidColumns, PackedSolidState};
use interlink_extraction::{
    PackedExtractorConfig, PackedExtractorRuntime, PackedResourceOccurrence,
};
use interlink_processes::{PackedFeederConfig, PackedFeederRuntime};
use interlink_roasting::{PackedRoastingFurnaceConfig, PackedRoastingFurnaceRuntime};
use interlink_routing::{
    PackedMergerConfig, PackedMergerRuntime, PackedSplitterConfig, PackedSplitterRuntime,
};
use interlink_runtime::{
    PackedSolidTarget, PackedWorldRuntime, PHASE_BALL_MILL, PHASE_CONE_CRUSHER, PHASE_JAW_CRUSHER,
    PHASE_LEGACY_CRUSHER,
};
use interlink_separation::{
    PackedMagneticSeparatorConfig, PackedMagneticSeparatorRuntime, PackedScreenConfig,
    PackedScreenRuntime,
};
use interlink_thermal::{PackedGasBody, PackedGasColumns, PackedGasState};
use interlink_thermochemistry::{PackedGoethiteReactionConfig, PackedGoethiteReactionTables};
use wasm_bindgen::prelude::*;

use super::js_error;

pub const NO_RUNTIME_ID: u32 = u32::MAX;

fn optional_id(value: u32) -> Option<u32> {
    (value != NO_RUNTIME_ID).then_some(value)
}

fn solid_target(kind: u8, id: u32) -> Result<Option<PackedSolidTarget>, String> {
    match kind {
        0 => Ok(None),
        1 => optional_id(id)
            .map(PackedSolidTarget::Hopper)
            .ok_or_else(|| "Hopper target kind requires a runtime node ID".to_string())
            .map(Some),
        2 => optional_id(id)
            .map(PackedSolidTarget::Furnace)
            .ok_or_else(|| "Furnace target kind requires a runtime node ID".to_string())
            .map(Some),
        _ => Err(format!("unknown packed solid target kind {kind}")),
    }
}

fn solid_state_from_columns(
    species_ids: Vec<u16>,
    size_bin_ids: Vec<u8>,
    liberation_class_ids: Vec<u8>,
    texture_profile_ids: Vec<u32>,
    quantities: Vec<f64>,
) -> Result<PackedSolidState, String> {
    PackedSolidState::from_columns(PackedSolidColumns {
        species_ids,
        size_bin_ids,
        liberation_class_ids,
        texture_profile_ids,
        quantities,
    })
}

fn solid_body_from_columns(
    species_ids: Vec<u16>,
    size_bin_ids: Vec<u8>,
    liberation_class_ids: Vec<u8>,
    texture_profile_ids: Vec<u32>,
    quantities: Vec<f64>,
    sensible_enthalpy_j: f64,
) -> Result<PackedSolidBody, String> {
    PackedSolidBody::new(
        solid_state_from_columns(
            species_ids,
            size_bin_ids,
            liberation_class_ids,
            texture_profile_ids,
            quantities,
        )?,
        sensible_enthalpy_j,
    )
}

fn gas_body_from_columns(
    species_ids: Vec<u16>,
    quantities: Vec<f64>,
    sensible_enthalpy_j: f64,
) -> Result<PackedGasBody, String> {
    PackedGasBody::new(
        PackedGasState::from_columns(PackedGasColumns {
            species_ids,
            quantities,
        })?,
        sensible_enthalpy_j,
    )
}

fn comminution_equipment(kind: u8) -> Result<(PackedComminutionEquipment, i32), String> {
    match kind {
        0 => Ok((
            PackedComminutionEquipment::LegacyCrusher,
            PHASE_LEGACY_CRUSHER,
        )),
        1 => Ok((PackedComminutionEquipment::JawCrusher, PHASE_JAW_CRUSHER)),
        2 => Ok((PackedComminutionEquipment::ConeCrusher, PHASE_CONE_CRUSHER)),
        3 => Ok((PackedComminutionEquipment::BallMill, PHASE_BALL_MILL)),
        _ => Err(format!("unknown packed comminution equipment kind {kind}")),
    }
}

/// Browser adapter for the complete packed graph/world runtime. Setup calls are
/// intentionally bulk-oriented and happen when compiling/importing a world. Once
/// sealed, normal simulation advances through one `tick_fixed()` call; no
/// per-apparatus or per-fraction JavaScript loop is required.
#[wasm_bindgen]
pub struct WasmPackedWorldRuntime {
    inner: PackedWorldRuntime,
    reaction_builder: Option<PackedGoethiteReactionTables>,
}

#[wasm_bindgen]
impl WasmPackedWorldRuntime {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: PackedWorldRuntime::new(),
            reaction_builder: None,
        }
    }

    pub fn no_runtime_id(&self) -> u32 {
        NO_RUNTIME_ID
    }

    pub fn add_site(&mut self, site_id: u32) -> Result<(), JsValue> {
        self.inner.add_site(site_id).map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_hopper_state(
        &mut self,
        node_id: u32,
        capacity_kg: f64,
        species_ids: Vec<u16>,
        size_bin_ids: Vec<u8>,
        liberation_class_ids: Vec<u8>,
        texture_profile_ids: Vec<u32>,
        quantities: Vec<f64>,
        sensible_enthalpy_j: f64,
    ) -> Result<(), JsValue> {
        let body = solid_body_from_columns(
            species_ids,
            size_bin_ids,
            liberation_class_ids,
            texture_profile_ids,
            quantities,
            sensible_enthalpy_j,
        )
        .map_err(js_error)?;
        let hopper = PackedHopperState::new(capacity_kg, body).map_err(js_error)?;
        self.inner.add_hopper(node_id, hopper).map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_occurrence_state(
        &mut self,
        occurrence_id: u32,
        species_ids: Vec<u16>,
        size_bin_ids: Vec<u8>,
        liberation_class_ids: Vec<u8>,
        texture_profile_ids: Vec<u32>,
        quantities_per_kg: Vec<f64>,
        finite_reserve: bool,
        reserve_mass_kg: f64,
    ) -> Result<(), JsValue> {
        let material = solid_state_from_columns(
            species_ids,
            size_bin_ids,
            liberation_class_ids,
            texture_profile_ids,
            quantities_per_kg,
        )
        .map_err(js_error)?;
        let occurrence = if finite_reserve {
            PackedResourceOccurrence::new_finite(material, reserve_mass_kg).map_err(js_error)?
        } else {
            PackedResourceOccurrence::new_unbounded(material)
        };
        self.inner
            .add_occurrence(occurrence_id, occurrence)
            .map_err(js_error)
    }

    pub fn add_exhaust_vent_state(
        &mut self,
        node_id: u32,
        species_ids: Vec<u16>,
        quantities: Vec<f64>,
        sensible_enthalpy_j: f64,
    ) -> Result<(), JsValue> {
        let body = gas_body_from_columns(species_ids, quantities, sensible_enthalpy_j)
            .map_err(js_error)?;
        self.inner.add_exhaust_vent(node_id, body).map_err(js_error)
    }

    pub fn set_specific_heat_capacity_j_per_kg_k(
        &mut self,
        species_id: u16,
        value: f64,
    ) -> Result<(), JsValue> {
        self.inner
            .thermal_table_mut()
            .set_specific_heat_capacity_j_per_kg_k(species_id, value)
            .map_err(js_error)
    }

    pub fn add_comminution_size_bin(
        &mut self,
        runtime_id: u8,
        order_index: u32,
        max_mm: f64,
        representative_mm: f64,
        canonical: bool,
    ) -> Result<(), JsValue> {
        self.inner
            .comminution_tables_mut()
            .add_size_bin(
                runtime_id,
                order_index as usize,
                max_mm,
                representative_mm,
                canonical,
            )
            .map_err(js_error)
    }

    pub fn set_comminution_legacy_lt_one_mm_id(&mut self, runtime_id: u8) {
        self.inner
            .comminution_tables_mut()
            .set_legacy_lt_one_mm_id(runtime_id);
    }

    pub fn add_comminution_liberation_class(&mut self, runtime_id: u8, order_index: u32) {
        self.inner
            .comminution_tables_mut()
            .add_liberation_class(runtime_id, order_index as usize);
    }

    #[allow(clippy::too_many_arguments)]
    pub fn set_comminution_species_texture(
        &mut self,
        texture_profile_id: u32,
        species_id: u16,
        d10_um: f64,
        d50_um: f64,
        d90_um: f64,
        free: f64,
        boundary: f64,
        intergrown: f64,
        included: f64,
    ) -> Result<(), JsValue> {
        let texture = PackedSpeciesTexture::new(
            d10_um,
            d50_um,
            d90_um,
            [free, boundary, intergrown, included],
        )
        .map_err(js_error)?;
        self.inner.comminution_tables_mut().set_species_texture(
            texture_profile_id,
            species_id,
            texture,
        );
        Ok(())
    }

    pub fn set_comminution_texture_properties(
        &mut self,
        texture_profile_id: u32,
        cwi_kwh_per_t: f64,
        bwi_kwh_per_t: f64,
        abrasion_index: f64,
    ) -> Result<(), JsValue> {
        let properties =
            PackedComminutionProperties::new(cwi_kwh_per_t, bwi_kwh_per_t, abrasion_index)
                .map_err(js_error)?;
        self.inner
            .comminution_tables_mut()
            .set_texture_properties(texture_profile_id, properties);
        Ok(())
    }

    pub fn add_separation_size_bin(
        &mut self,
        runtime_id: u8,
        max_mm: f64,
        magnetic_suitability: f64,
    ) -> Result<(), JsValue> {
        self.inner
            .separation_tables_mut()
            .add_size_bin(runtime_id, max_mm, magnetic_suitability)
            .map_err(js_error)
    }

    pub fn add_separation_liberation_class(
        &mut self,
        runtime_id: u8,
        recovery_factor: f64,
    ) -> Result<(), JsValue> {
        self.inner
            .separation_tables_mut()
            .add_liberation_class(runtime_id, recovery_factor)
            .map_err(js_error)
    }

    pub fn set_species_magnetic_response(
        &mut self,
        runtime_id: u16,
        coefficient: f64,
    ) -> Result<(), JsValue> {
        self.inner
            .separation_tables_mut()
            .set_species_magnetic_response(runtime_id, coefficient)
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn begin_goethite_reaction(
        &mut self,
        source_species_id: u16,
        solid_product_species_id: u16,
        gas_product_species_id: u16,
        source_mass_per_extent_kg: f64,
        solid_product_mass_per_extent_kg: f64,
        gas_product_mass_per_extent_kg: f64,
        reaction_enthalpy_j_per_mol_extent: f64,
        activation_energy_j_per_mol: f64,
        pre_exponential_factor_per_second: f64,
    ) -> Result<(), JsValue> {
        let config = PackedGoethiteReactionConfig::new(
            source_species_id,
            solid_product_species_id,
            gas_product_species_id,
            source_mass_per_extent_kg,
            solid_product_mass_per_extent_kg,
            gas_product_mass_per_extent_kg,
            reaction_enthalpy_j_per_mol_extent,
            activation_energy_j_per_mol,
            pre_exponential_factor_per_second,
        )
        .map_err(js_error)?;
        self.reaction_builder = Some(PackedGoethiteReactionTables::new(config));
        Ok(())
    }

    pub fn set_reaction_size_factor(
        &mut self,
        size_bin_id: u8,
        factor: f64,
    ) -> Result<(), JsValue> {
        self.reaction_builder
            .as_mut()
            .ok_or_else(|| JsValue::from_str("begin_goethite_reaction must be called first"))?
            .set_size_factor(size_bin_id, factor)
            .map_err(js_error)
    }

    pub fn set_reaction_product_texture_mapping(
        &mut self,
        source_texture_profile_id: u32,
        product_texture_profile_id: u32,
    ) -> Result<(), JsValue> {
        self.reaction_builder
            .as_mut()
            .ok_or_else(|| JsValue::from_str("begin_goethite_reaction must be called first"))?
            .set_product_texture_mapping(source_texture_profile_id, product_texture_profile_id)
            .map_err(js_error)
    }

    pub fn commit_goethite_reaction(&mut self) -> Result<(), JsValue> {
        let reaction = self
            .reaction_builder
            .take()
            .ok_or_else(|| JsValue::from_str("no pending goethite reaction"))?;
        self.inner.set_reaction_tables(reaction);
        Ok(())
    }

    pub fn add_extractor(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        rate_kg_per_second: f64,
        enabled: bool,
        occurrence_id: u32,
        output_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedExtractorRuntime::new(
            PackedExtractorConfig::new(rate_kg_per_second, enabled).map_err(js_error)?,
        );
        self.inner
            .add_extractor(
                site_id,
                node_id,
                ordinal,
                runtime,
                optional_id(occurrence_id),
                optional_id(output_hopper_id),
            )
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_merger(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        throughput_kg_per_second: f64,
        enabled: bool,
        input_a_hopper_id: u32,
        input_b_hopper_id: u32,
        output_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedMergerRuntime::new(
            PackedMergerConfig::new(throughput_kg_per_second, enabled).map_err(js_error)?,
        );
        self.inner
            .add_merger(
                site_id,
                node_id,
                ordinal,
                runtime,
                optional_id(input_a_hopper_id),
                optional_id(input_b_hopper_id),
                optional_id(output_hopper_id),
            )
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_feeder(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        flow_rate_kg_per_second: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
        input_hopper_id: u32,
        output_target_kind: u8,
        output_target_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedFeederRuntime::new(
            PackedFeederConfig::new(flow_rate_kg_per_second, throughput_kg_per_second, enabled)
                .map_err(js_error)?,
        );
        self.inner
            .add_feeder(
                site_id,
                node_id,
                ordinal,
                runtime,
                optional_id(input_hopper_id),
                solid_target(output_target_kind, output_target_id).map_err(js_error)?,
            )
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_comminution(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        equipment_kind: u8,
        target_size_id: u8,
        target_particle_size_mm: f64,
        throughput_kg_per_second: f64,
        rated_power_kw: f64,
        enabled: bool,
        input_hopper_id: u32,
        output_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let (equipment, phase) = comminution_equipment(equipment_kind).map_err(js_error)?;
        let rated_power =
            (equipment != PackedComminutionEquipment::LegacyCrusher).then_some(rated_power_kw);
        let runtime = PackedComminutionRuntime::new(
            PackedComminutionConfig::new(
                equipment,
                target_size_id,
                target_particle_size_mm,
                throughput_kg_per_second,
                rated_power,
                enabled,
            )
            .map_err(js_error)?,
        );
        self.inner
            .add_comminution(
                site_id,
                node_id,
                phase,
                ordinal,
                runtime,
                optional_id(input_hopper_id),
                optional_id(output_hopper_id),
            )
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_screen(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        aperture_size_mm: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
        input_hopper_id: u32,
        undersize_hopper_id: u32,
        oversize_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedScreenRuntime::new(
            PackedScreenConfig::new(aperture_size_mm, throughput_kg_per_second, enabled)
                .map_err(js_error)?,
        );
        self.inner
            .add_screen(
                site_id,
                node_id,
                ordinal,
                runtime,
                optional_id(input_hopper_id),
                optional_id(undersize_hopper_id),
                optional_id(oversize_hopper_id),
            )
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_splitter(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        split_fraction_to_a: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
        input_hopper_id: u32,
        output_a_hopper_id: u32,
        output_b_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedSplitterRuntime::new(
            PackedSplitterConfig::new(split_fraction_to_a, throughput_kg_per_second, enabled)
                .map_err(js_error)?,
        );
        self.inner
            .add_splitter(
                site_id,
                node_id,
                ordinal,
                runtime,
                optional_id(input_hopper_id),
                optional_id(output_a_hopper_id),
                optional_id(output_b_hopper_id),
            )
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_magnetic_separator(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        field_strength: f64,
        max_feed_particle_size_mm: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
        input_hopper_id: u32,
        concentrate_hopper_id: u32,
        tailings_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedMagneticSeparatorRuntime::new(
            PackedMagneticSeparatorConfig::new(
                field_strength,
                max_feed_particle_size_mm,
                throughput_kg_per_second,
                enabled,
            )
            .map_err(js_error)?,
        );
        self.inner
            .add_magnetic_separator(
                site_id,
                node_id,
                ordinal,
                runtime,
                optional_id(input_hopper_id),
                optional_id(concentrate_hopper_id),
                optional_id(tailings_hopper_id),
            )
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_roasting_furnace(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        temperature_setpoint_k: f64,
        rated_heater_power_kw: f64,
        maximum_operating_temperature_k: f64,
        maximum_solid_throughput_kg_per_second: f64,
        effective_chamber_hold_up_kg: f64,
        heat_loss_coefficient_w_per_k: f64,
        internal_zone_count: u32,
        enabled: bool,
        product_target_kind: u8,
        product_target_id: u32,
        gas_vent_id: u32,
    ) -> Result<(), JsValue> {
        let config = PackedRoastingFurnaceConfig::new(
            temperature_setpoint_k,
            rated_heater_power_kw,
            maximum_operating_temperature_k,
            maximum_solid_throughput_kg_per_second,
            effective_chamber_hold_up_kg,
            heat_loss_coefficient_w_per_k,
            internal_zone_count as usize,
            enabled,
        )
        .map_err(js_error)?;
        self.inner
            .add_roasting_furnace(
                site_id,
                node_id,
                ordinal,
                PackedRoastingFurnaceRuntime::new(config),
                solid_target(product_target_kind, product_target_id).map_err(js_error)?,
                optional_id(gas_vent_id),
            )
            .map_err(js_error)
    }

    pub fn add_site_passive_storage_link(
        &mut self,
        site_id: u32,
        source_hopper_id: u32,
        target_hopper_id: u32,
        rate_kg_per_second: f64,
    ) -> Result<(), JsValue> {
        self.inner
            .add_site_passive_storage_link(
                site_id,
                source_hopper_id,
                target_hopper_id,
                rate_kg_per_second,
            )
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_boundary_transfer(
        &mut self,
        transfer_id: u32,
        source_hopper_id: u32,
        target_hopper_id: u32,
        capacity_kg_per_second: f64,
        priority: i32,
        ordinal: u32,
    ) -> Result<(), JsValue> {
        self.inner
            .add_boundary_transfer(
                transfer_id,
                source_hopper_id,
                target_hopper_id,
                capacity_kg_per_second,
                priority,
                ordinal,
            )
            .map_err(js_error)
    }

    pub fn import_world_elapsed_seconds(&mut self, value: f64) -> Result<(), JsValue> {
        self.inner.import_elapsed_seconds(value).map_err(js_error)
    }

    pub fn import_site_stats(
        &mut self,
        site_id: u32,
        elapsed_seconds: f64,
        extracted_kg: f64,
    ) -> Result<(), JsValue> {
        self.inner
            .import_site_stats(site_id, elapsed_seconds, extracted_kg)
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn import_roasting_furnace_state(
        &mut self,
        node_id: u32,
        zone_lengths: Vec<u32>,
        zone_species_ids: Vec<u16>,
        zone_size_bin_ids: Vec<u8>,
        zone_liberation_class_ids: Vec<u8>,
        zone_texture_profile_ids: Vec<u32>,
        zone_quantities: Vec<f64>,
        zone_sensible_enthalpies_j: Vec<f64>,
        pending_species_ids: Vec<u16>,
        pending_size_bin_ids: Vec<u8>,
        pending_liberation_class_ids: Vec<u8>,
        pending_texture_profile_ids: Vec<u32>,
        pending_quantities: Vec<f64>,
        pending_sensible_enthalpy_j: f64,
        gas_species_ids: Vec<u16>,
        gas_quantities: Vec<f64>,
        gas_sensible_enthalpy_j: f64,
    ) -> Result<(), JsValue> {
        if zone_lengths.len() != zone_sensible_enthalpies_j.len() {
            return Err(JsValue::from_str(
                "Furnace zone lengths and enthalpies must align",
            ));
        }
        let total: usize = zone_lengths.iter().map(|value| *value as usize).sum();
        if zone_species_ids.len() != total
            || zone_size_bin_ids.len() != total
            || zone_liberation_class_ids.len() != total
            || zone_texture_profile_ids.len() != total
            || zone_quantities.len() != total
        {
            return Err(JsValue::from_str(
                "Furnace flattened zone columns must align",
            ));
        }
        let mut zones = Vec::with_capacity(zone_lengths.len());
        let mut offset = 0usize;
        for (zone_index, length) in zone_lengths.iter().enumerate() {
            let end = offset + *length as usize;
            zones.push(
                solid_body_from_columns(
                    zone_species_ids[offset..end].to_vec(),
                    zone_size_bin_ids[offset..end].to_vec(),
                    zone_liberation_class_ids[offset..end].to_vec(),
                    zone_texture_profile_ids[offset..end].to_vec(),
                    zone_quantities[offset..end].to_vec(),
                    zone_sensible_enthalpies_j[zone_index],
                )
                .map_err(js_error)?,
            );
            offset = end;
        }
        let pending_feed = solid_body_from_columns(
            pending_species_ids,
            pending_size_bin_ids,
            pending_liberation_class_ids,
            pending_texture_profile_ids,
            pending_quantities,
            pending_sensible_enthalpy_j,
        )
        .map_err(js_error)?;
        let gas_inventory =
            gas_body_from_columns(gas_species_ids, gas_quantities, gas_sensible_enthalpy_j)
                .map_err(js_error)?;
        self.inner
            .import_furnace_state(node_id, zones, pending_feed, gas_inventory)
            .map_err(js_error)
    }

    pub fn seal(&mut self) {
        self.inner.seal();
    }

    pub fn pause(&mut self) {
        self.inner.pause();
    }

    pub fn resume(&mut self) {
        self.inner.resume();
    }

    pub fn running(&self) -> bool {
        self.inner.running()
    }

    pub fn tick_fixed(&mut self) -> Result<bool, JsValue> {
        Ok(self.inner.tick_fixed().map_err(js_error)?.advanced)
    }

    pub fn advance_fixed_steps(&mut self, steps: u32) -> Result<u32, JsValue> {
        self.inner.advance_fixed_steps(steps).map_err(js_error)
    }

    pub fn elapsed_seconds(&self) -> f64 {
        self.inner.elapsed_seconds()
    }

    pub fn site_elapsed_seconds(&self, site_id: u32) -> f64 {
        self.inner
            .site(site_id)
            .map(|site| site.elapsed_seconds())
            .unwrap_or(0.0)
    }

    pub fn site_extracted_kg(&self, site_id: u32) -> f64 {
        self.inner
            .site(site_id)
            .map(|site| site.extracted_kg())
            .unwrap_or(0.0)
    }

    pub fn hopper_stored_mass_kg(&self, node_id: u32) -> f64 {
        self.inner
            .hopper(node_id)
            .map(PackedHopperState::stored_mass_kg)
            .unwrap_or(0.0)
    }

    pub fn hopper_sensible_enthalpy_j(&self, node_id: u32) -> f64 {
        self.inner
            .hopper(node_id)
            .map(|hopper| hopper.body().sensible_enthalpy_j())
            .unwrap_or(0.0)
    }

    pub fn occurrence_extracted_mass_kg(&self, occurrence_id: u32) -> f64 {
        self.inner
            .occurrence(occurrence_id)
            .map(PackedResourceOccurrence::extracted_mass_kg)
            .unwrap_or(0.0)
    }

    pub fn occurrence_remaining_mass_kg(&self, occurrence_id: u32) -> f64 {
        self.inner
            .occurrence(occurrence_id)
            .and_then(PackedResourceOccurrence::remaining_mass_kg)
            .unwrap_or(f64::INFINITY)
    }

    pub fn vented_gas_mass_kg(&self, node_id: u32) -> f64 {
        self.inner
            .exhaust_vent(node_id)
            .map(PackedGasBody::total_mass_kg)
            .unwrap_or(0.0)
    }

    pub fn node_operating_state(&self, node_id: u32) -> String {
        self.inner
            .node_status(node_id)
            .map(|status| status.operating_state().as_str().to_string())
            .unwrap_or_default()
    }

    pub fn node_last_error(&self, node_id: u32) -> String {
        self.inner
            .node_status(node_id)
            .and_then(|status| status.last_error())
            .unwrap_or("")
            .to_string()
    }

    pub fn node_output_mass_flow_kg_per_second(&self, node_id: u32, output_index: u32) -> f64 {
        self.inner
            .node_output_mass_flow_kg_per_second(node_id, output_index as usize)
            .unwrap_or(0.0)
    }

    pub fn furnace_actual_charge_temperature_k(&self, node_id: u32) -> f64 {
        self.inner
            .furnace_diagnostics(node_id)
            .map(|value| value.actual_charge_temperature_k)
            .unwrap_or(0.0)
    }

    pub fn furnace_last_heater_power_kw(&self, node_id: u32) -> f64 {
        self.inner
            .furnace_diagnostics(node_id)
            .map(|value| value.last_heater_power_kw)
            .unwrap_or(0.0)
    }

    pub fn furnace_last_reaction_power_kw(&self, node_id: u32) -> f64 {
        self.inner
            .furnace_diagnostics(node_id)
            .map(|value| value.last_reaction_power_kw)
            .unwrap_or(0.0)
    }

    pub fn furnace_last_heat_loss_power_kw(&self, node_id: u32) -> f64 {
        self.inner
            .furnace_diagnostics(node_id)
            .map(|value| value.last_heat_loss_power_kw)
            .unwrap_or(0.0)
    }

    pub fn furnace_last_feed_rate_kg_per_second(&self, node_id: u32) -> f64 {
        self.inner
            .furnace_diagnostics(node_id)
            .map(|value| value.last_feed_rate_kg_per_second)
            .unwrap_or(0.0)
    }

    pub fn furnace_last_product_rate_kg_per_second(&self, node_id: u32) -> f64 {
        self.inner
            .furnace_diagnostics(node_id)
            .map(|value| value.last_product_rate_kg_per_second)
            .unwrap_or(0.0)
    }

    pub fn furnace_last_goethite_conversion_fraction(&self, node_id: u32) -> f64 {
        self.inner
            .furnace_diagnostics(node_id)
            .map(|value| value.last_goethite_conversion_fraction)
            .unwrap_or(0.0)
    }

    pub fn furnace_last_solver_evaluation_count(&self, node_id: u32) -> u32 {
        self.inner
            .furnace_diagnostics(node_id)
            .map(|value| value.last_solver_evaluation_count as u32)
            .unwrap_or(0)
    }

    pub fn site_passive_link_last_moved_kg(&self, site_id: u32, link_index: u32) -> f64 {
        self.inner
            .site_passive_storage_link(site_id, link_index as usize)
            .map(|value| value.last_moved_kg)
            .unwrap_or(0.0)
    }

    pub fn site_passive_link_last_rate_kg_per_second(&self, site_id: u32, link_index: u32) -> f64 {
        self.inner
            .site_passive_storage_link(site_id, link_index as usize)
            .map(|value| value.last_rate_kg_per_second)
            .unwrap_or(0.0)
    }

    pub fn boundary_last_moved_kg(&self, transfer_id: u32) -> f64 {
        self.inner
            .boundary_transfer(transfer_id)
            .map(|value| value.last_moved_kg)
            .unwrap_or(0.0)
    }

    pub fn boundary_last_rate_kg_per_second(&self, transfer_id: u32) -> f64 {
        self.inner
            .boundary_transfer(transfer_id)
            .map(|value| value.last_rate_kg_per_second)
            .unwrap_or(0.0)
    }
}

#[wasm_bindgen]
impl WasmPackedWorldRuntime {
    pub fn clone_for_live_reconfigure(&self) -> WasmPackedWorldRuntime {
        WasmPackedWorldRuntime {
            inner: self.inner.clone(),
            reaction_builder: None,
        }
    }

    pub fn begin_live_reconfigure(&mut self) {
        self.inner.begin_live_reconfigure();
    }

    #[allow(clippy::too_many_arguments)]
    pub fn replace_hopper_state_live(
        &mut self,
        node_id: u32,
        capacity_kg: f64,
        species_ids: Vec<u16>,
        size_bin_ids: Vec<u8>,
        liberation_class_ids: Vec<u8>,
        texture_profile_ids: Vec<u32>,
        quantities: Vec<f64>,
        sensible_enthalpy_j: f64,
    ) -> Result<(), JsValue> {
        let body = solid_body_from_columns(
            species_ids,
            size_bin_ids,
            liberation_class_ids,
            texture_profile_ids,
            quantities,
            sensible_enthalpy_j,
        )
        .map_err(js_error)?;
        let hopper = PackedHopperState::new(capacity_kg, body).map_err(js_error)?;
        self.inner
            .replace_hopper_live(node_id, hopper)
            .map_err(js_error)
    }

    pub fn remove_hopper_if_empty_live(&mut self, node_id: u32) -> Result<(), JsValue> {
        self.inner
            .remove_hopper_if_empty_live(node_id)
            .map_err(js_error)
    }

    pub fn replace_exhaust_vent_state_live(
        &mut self,
        node_id: u32,
        species_ids: Vec<u16>,
        quantities: Vec<f64>,
        sensible_enthalpy_j: f64,
    ) -> Result<(), JsValue> {
        let body = gas_body_from_columns(species_ids, quantities, sensible_enthalpy_j)
            .map_err(js_error)?;
        self.inner
            .replace_exhaust_vent_live(node_id, body)
            .map_err(js_error)
    }

    pub fn remove_exhaust_vent_live(&mut self, node_id: u32) {
        self.inner.remove_exhaust_vent_live(node_id);
    }

    pub fn upsert_extractor_live(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        rate_kg_per_second: f64,
        enabled: bool,
        occurrence_id: u32,
        output_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedExtractorRuntime::new(
            PackedExtractorConfig::new(rate_kg_per_second, enabled).map_err(js_error)?,
        );
        self.inner
            .upsert_extractor_live(
                site_id,
                node_id,
                ordinal,
                runtime,
                optional_id(occurrence_id),
                optional_id(output_hopper_id),
            )
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_merger_live(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        throughput_kg_per_second: f64,
        enabled: bool,
        input_a_hopper_id: u32,
        input_b_hopper_id: u32,
        output_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedMergerRuntime::new(
            PackedMergerConfig::new(throughput_kg_per_second, enabled).map_err(js_error)?,
        );
        self.inner
            .upsert_merger_live(
                site_id,
                node_id,
                ordinal,
                runtime,
                optional_id(input_a_hopper_id),
                optional_id(input_b_hopper_id),
                optional_id(output_hopper_id),
            )
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_feeder_live(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        flow_rate_kg_per_second: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
        input_hopper_id: u32,
        output_target_kind: u8,
        output_target_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedFeederRuntime::new(
            PackedFeederConfig::new(flow_rate_kg_per_second, throughput_kg_per_second, enabled)
                .map_err(js_error)?,
        );
        self.inner
            .upsert_feeder_live(
                site_id,
                node_id,
                ordinal,
                runtime,
                optional_id(input_hopper_id),
                solid_target(output_target_kind, output_target_id).map_err(js_error)?,
            )
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_comminution_live(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        equipment_kind: u8,
        target_size_bin_id: u8,
        target_particle_size_mm: f64,
        throughput_kg_per_second: f64,
        rated_power_kw: f64,
        enabled: bool,
        input_hopper_id: u32,
        output_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let (equipment, phase) = comminution_equipment(equipment_kind).map_err(js_error)?;
        let rated_power =
            (equipment != PackedComminutionEquipment::LegacyCrusher).then_some(rated_power_kw);
        let runtime = PackedComminutionRuntime::new(
            interlink_comminution::PackedComminutionConfig::new(
                equipment,
                target_size_bin_id,
                target_particle_size_mm,
                throughput_kg_per_second,
                rated_power,
                enabled,
            )
            .map_err(js_error)?,
        );
        self.inner
            .upsert_comminution_live(
                site_id,
                node_id,
                phase,
                ordinal,
                runtime,
                optional_id(input_hopper_id),
                optional_id(output_hopper_id),
            )
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_screen_live(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        aperture_size_mm: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
        input_hopper_id: u32,
        undersize_hopper_id: u32,
        oversize_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedScreenRuntime::new(
            PackedScreenConfig::new(aperture_size_mm, throughput_kg_per_second, enabled)
                .map_err(js_error)?,
        );
        self.inner
            .upsert_screen_live(
                site_id,
                node_id,
                ordinal,
                runtime,
                optional_id(input_hopper_id),
                optional_id(undersize_hopper_id),
                optional_id(oversize_hopper_id),
            )
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_splitter_live(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        split_fraction_to_a: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
        input_hopper_id: u32,
        output_a_hopper_id: u32,
        output_b_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedSplitterRuntime::new(
            PackedSplitterConfig::new(split_fraction_to_a, throughput_kg_per_second, enabled)
                .map_err(js_error)?,
        );
        self.inner
            .upsert_splitter_live(
                site_id,
                node_id,
                ordinal,
                runtime,
                optional_id(input_hopper_id),
                optional_id(output_a_hopper_id),
                optional_id(output_b_hopper_id),
            )
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_magnetic_separator_live(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        field_strength: f64,
        max_feed_particle_size_mm: f64,
        throughput_kg_per_second: f64,
        enabled: bool,
        input_hopper_id: u32,
        concentrate_hopper_id: u32,
        tailings_hopper_id: u32,
    ) -> Result<(), JsValue> {
        let runtime = PackedMagneticSeparatorRuntime::new(
            PackedMagneticSeparatorConfig::new(
                field_strength,
                max_feed_particle_size_mm,
                throughput_kg_per_second,
                enabled,
            )
            .map_err(js_error)?,
        );
        self.inner
            .upsert_magnetic_separator_live(
                site_id,
                node_id,
                ordinal,
                runtime,
                optional_id(input_hopper_id),
                optional_id(concentrate_hopper_id),
                optional_id(tailings_hopper_id),
            )
            .map_err(js_error)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_roasting_furnace_live(
        &mut self,
        site_id: u32,
        node_id: u32,
        ordinal: u32,
        temperature_setpoint_k: f64,
        rated_heater_power_kw: f64,
        maximum_operating_temperature_k: f64,
        maximum_solid_throughput_kg_per_second: f64,
        effective_chamber_hold_up_kg: f64,
        heat_loss_coefficient_w_per_k: f64,
        internal_zone_count: u32,
        enabled: bool,
        product_target_kind: u8,
        product_target_id: u32,
        gas_vent_id: u32,
        preserve_retained_state: bool,
    ) -> Result<(), JsValue> {
        let runtime = PackedRoastingFurnaceRuntime::new(
            PackedRoastingFurnaceConfig::new(
                temperature_setpoint_k,
                rated_heater_power_kw,
                maximum_operating_temperature_k,
                maximum_solid_throughput_kg_per_second,
                effective_chamber_hold_up_kg,
                heat_loss_coefficient_w_per_k,
                internal_zone_count as usize,
                enabled,
            )
            .map_err(js_error)?,
        );
        self.inner
            .upsert_roasting_furnace_live(
                site_id,
                node_id,
                ordinal,
                runtime,
                solid_target(product_target_kind, product_target_id).map_err(js_error)?,
                optional_id(gas_vent_id),
                preserve_retained_state,
            )
            .map_err(js_error)
    }

    pub fn finish_live_reconfigure(&mut self, active_machine_ids: Vec<u32>) -> Result<(), JsValue> {
        self.inner
            .finish_live_reconfigure(&active_machine_ids)
            .map_err(js_error)
    }

    pub fn node_input_mass_flow_kg_per_second(&self, node_id: u32, input_index: u32) -> f64 {
        self.inner
            .node_input_mass_flow_kg_per_second(node_id, input_index as usize)
            .unwrap_or(0.0)
    }

    pub fn furnace_charge_mass_kg(&self, node_id: u32) -> f64 {
        self.inner.furnace_charge_mass_kg(node_id).unwrap_or(0.0)
    }

    pub fn furnace_pending_feed_mass_kg(&self, node_id: u32) -> f64 {
        self.inner
            .furnace_pending_feed_mass_kg(node_id)
            .unwrap_or(0.0)
    }
}

impl Default for WasmPackedWorldRuntime {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn world_bridge_runs_phase_order_in_one_fixed_step() {
        let mut world = WasmPackedWorldRuntime::new();
        world.add_site(1).unwrap();
        world
            .add_occurrence_state(1, vec![1], vec![1], vec![1], vec![0], vec![1.0], false, 0.0)
            .unwrap();
        world
            .add_hopper_state(100, 100.0, vec![], vec![], vec![], vec![], vec![], 0.0)
            .unwrap();
        world
            .add_hopper_state(101, 100.0, vec![], vec![], vec![], vec![], vec![], 0.0)
            .unwrap();
        world.add_extractor(1, 10, 0, 5.0, true, 1, 100).unwrap();
        world
            .add_feeder(1, 11, 1, 2.0, 8.0, true, 100, 1, 101)
            .unwrap();
        world.seal();
        assert!(world.tick_fixed().unwrap());
        assert!((world.hopper_stored_mass_kg(100) - 0.3).abs() < 1e-12);
        assert!((world.hopper_stored_mass_kg(101) - 0.2).abs() < 1e-12);
        assert!((world.elapsed_seconds() - 0.1).abs() < 1e-12);
    }
}
