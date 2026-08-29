use interlink_core::{FractionDescriptor, PackedHopperState, PackedSolidState};
use interlink_processes::PackedOperatingState;
use interlink_routing::PackedSpeciesThermalTable;
use interlink_separation::{
    magnetic_recovery_for_fraction, split_magnetic_solid_state, split_screened_solid_state,
    PackedMagneticSeparatorConfig, PackedMagneticSeparatorRuntime, PackedScreenConfig,
    PackedScreenRuntime, PackedSeparationTables,
};

const QUARTZ: u16 = 1;
const HEMATITE: u16 = 2;
const MAGNETITE: u16 = 3;
const SIZE_5_15: u8 = 10;
const SIZE_15_25: u8 = 11;
const SIZE_25_60: u8 = 12;
const SIZE_60_120: u8 = 13;
const SIZE_CANONICAL_LT_32UM: u8 = 14;
const SIZE_LEGACY_LT_32UM: u8 = 15;
const LOCKED: u8 = 20;
const PARTIAL: u8 = 21;
const MOSTLY: u8 = 22;
const LIBERATED: u8 = 23;

fn descriptor(species_id: u16, size_bin_id: u8, liberation_class_id: u8) -> FractionDescriptor {
    FractionDescriptor {
        species_id,
        size_bin_id,
        liberation_class_id,
        texture_profile_id: 0,
    }
}

fn tables() -> PackedSeparationTables {
    let mut tables = PackedSeparationTables::new();
    tables.add_size_bin(SIZE_5_15, 15.0, 0.90).unwrap();
    tables.add_size_bin(SIZE_15_25, 25.0, 1.00).unwrap();
    tables.add_size_bin(SIZE_25_60, 60.0, 0.0).unwrap();
    tables.add_size_bin(SIZE_60_120, 120.0, 0.0).unwrap();
    tables
        .add_size_bin(SIZE_CANONICAL_LT_32UM, 0.032, 0.0)
        .unwrap();
    tables
        .add_size_bin(SIZE_LEGACY_LT_32UM, 0.032, 0.05)
        .unwrap();
    tables.add_liberation_class(LOCKED, 0.25).unwrap();
    tables.add_liberation_class(PARTIAL, 0.55).unwrap();
    tables.add_liberation_class(MOSTLY, 0.80).unwrap();
    tables.add_liberation_class(LIBERATED, 1.00).unwrap();
    tables.set_species_magnetic_response(QUARTZ, 0.0).unwrap();
    tables.set_species_magnetic_response(HEMATITE, 0.55).unwrap();
    tables.set_species_magnetic_response(MAGNETITE, 1.0).unwrap();
    tables
}

fn thermal() -> PackedSpeciesThermalTable {
    let mut thermal = PackedSpeciesThermalTable::new();
    thermal
        .set_specific_heat_capacity_j_per_kg_k(QUARTZ, 740.0)
        .unwrap();
    thermal
        .set_specific_heat_capacity_j_per_kg_k(HEMATITE, 650.0)
        .unwrap();
    thermal
        .set_specific_heat_capacity_j_per_kg_k(MAGNETITE, 670.0)
        .unwrap();
    thermal
}

fn screen_fixture() -> PackedSolidState {
    let mut feed = PackedSolidState::new();
    feed.push_fraction(descriptor(QUARTZ, SIZE_5_15, LOCKED), 30.0)
        .unwrap();
    feed.push_fraction(descriptor(HEMATITE, SIZE_15_25, PARTIAL), 20.0)
        .unwrap();
    feed.push_fraction(descriptor(MAGNETITE, SIZE_25_60, MOSTLY), 40.0)
        .unwrap();
    feed.push_fraction(descriptor(QUARTZ, SIZE_60_120, LIBERATED), 10.0)
        .unwrap();
    feed
}

#[test]
fn production_screen_fixture_is_50_50_at_25_mm() {
    let result = split_screened_solid_state(&screen_fixture(), 25.0, &tables()).unwrap();
    assert!((result.output_a.total_quantity() - 50.0).abs() < 1e-12);
    assert!((result.output_b.total_quantity() - 50.0).abs() < 1e-12);
    let undersize = result.output_a.to_columns();
    let oversize = result.output_b.to_columns();
    assert_eq!(undersize.quantities, vec![30.0, 20.0]);
    assert_eq!(oversize.quantities, vec![40.0, 10.0]);
}

#[test]
fn production_magnetic_formula_matches_known_magnetite_and_quartz_values() {
    let tables = tables();
    let magnetite = magnetic_recovery_for_fraction(
        descriptor(MAGNETITE, SIZE_15_25, LIBERATED),
        0.5,
        &tables,
    )
    .unwrap();
    let quartz = magnetic_recovery_for_fraction(
        descriptor(QUARTZ, SIZE_15_25, LIBERATED),
        0.5,
        &tables,
    )
    .unwrap();
    assert!((magnetite - 0.5875).abs() < 1e-12);
    assert!((quartz - 0.0125).abs() < 1e-12);
}

#[test]
fn magnetic_split_conserves_each_descriptor() {
    let tables = tables();
    let mut feed = PackedSolidState::new();
    feed.push_fraction(descriptor(MAGNETITE, SIZE_15_25, LIBERATED), 10.0)
        .unwrap();
    feed.push_fraction(descriptor(QUARTZ, SIZE_15_25, LIBERATED), 10.0)
        .unwrap();
    let result = split_magnetic_solid_state(&feed, 0.5, 25.0, &tables).unwrap();
    assert!((result.output_a.total_quantity() - 6.0).abs() < 1e-12);
    assert!((result.output_b.total_quantity() - 14.0).abs() < 1e-12);
    let concentrate = result.output_a.to_columns();
    let tailings = result.output_b.to_columns();
    assert!((concentrate.quantities[0] - 5.875).abs() < 1e-12);
    assert!((concentrate.quantities[1] - 0.125).abs() < 1e-12);
    assert!((tailings.quantities[0] - 4.125).abs() < 1e-12);
    assert!((tailings.quantities[1] - 9.875).abs() < 1e-12);
}

#[test]
fn current_ultrafine_compatibility_behavior_is_preserved() {
    let tables = tables();
    let canonical = magnetic_recovery_for_fraction(
        descriptor(MAGNETITE, SIZE_CANONICAL_LT_32UM, LIBERATED),
        1.0,
        &tables,
    )
    .unwrap();
    let legacy = magnetic_recovery_for_fraction(
        descriptor(MAGNETITE, SIZE_LEGACY_LT_32UM, LIBERATED),
        1.0,
        &tables,
    )
    .unwrap();
    assert_eq!(canonical, 0.0);
    assert!((legacy - 0.051).abs() < 1e-12);
}

#[test]
fn screen_full_zero_flow_branch_does_not_backpressure_required_product() {
    let tables = tables();
    let thermal = thermal();
    let mut source = PackedHopperState::empty(100.0).unwrap();
    source
        .body_mut()
        .solid_state_mut()
        .push_fraction(descriptor(QUARTZ, SIZE_5_15, LOCKED), 10.0)
        .unwrap();
    let mut undersize = PackedHopperState::empty(100.0).unwrap();
    let mut oversize = PackedHopperState::empty(1.0).unwrap();
    oversize
        .body_mut()
        .solid_state_mut()
        .push_fraction(descriptor(QUARTZ, SIZE_60_120, LIBERATED), 1.0)
        .unwrap();
    let mut screen = PackedScreenRuntime::new(
        PackedScreenConfig::new(25.0, 10.0, true).unwrap(),
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
    assert_eq!(result.operating_state, PackedOperatingState::Running);
    assert!((undersize.stored_mass_kg() - 10.0).abs() < 1e-12);
    assert!((oversize.stored_mass_kg() - 1.0).abs() < 1e-12);
}

#[test]
fn magnetic_output_capacity_throttles_both_products_together() {
    let tables = tables();
    let thermal = thermal();
    let mut source = PackedHopperState::empty(100.0).unwrap();
    source
        .body_mut()
        .solid_state_mut()
        .push_fraction(descriptor(MAGNETITE, SIZE_15_25, LIBERATED), 10.0)
        .unwrap();
    source
        .body_mut()
        .solid_state_mut()
        .push_fraction(descriptor(QUARTZ, SIZE_15_25, LIBERATED), 10.0)
        .unwrap();
    let mut concentrate = PackedHopperState::empty(3.0).unwrap();
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
    assert!((result.transferred_mass_kg - 10.0).abs() < 1e-12);
    assert!((concentrate.stored_mass_kg() - 3.0).abs() < 1e-12);
    assert!((tailings.stored_mass_kg() - 7.0).abs() < 1e-12);
    assert!((source.stored_mass_kg() - 10.0).abs() < 1e-12);
}
