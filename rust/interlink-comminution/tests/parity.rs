use std::collections::HashMap;

use interlink_comminution::{
    legacy_crush, staged_comminute, PackedComminutionEquipment, PackedComminutionTables,
    PackedSpeciesTexture,
};
use interlink_core::{FractionDescriptor, PackedSolidState};

fn tables() -> PackedComminutionTables {
    let mut tables = PackedComminutionTables::new();
    let representatives = [
        0.002, 0.006, 0.012, 0.024, 0.0475, 0.094, 0.1875, 0.375, 0.75, 3.0,
        10.0, 20.0, 42.5, 90.0, 185.0, 375.0, 750.0, 1200.0,
    ];
    let maxima = [
        0.004,
        0.008,
        0.016,
        0.032,
        0.063,
        0.125,
        0.25,
        0.5,
        1.0,
        5.0,
        15.0,
        25.0,
        60.0,
        120.0,
        250.0,
        500.0,
        1000.0,
        f64::INFINITY,
    ];
    for index in 0..representatives.len() {
        tables
            .add_size_bin(
                index as u8,
                index,
                maxima[index],
                representatives[index],
                true,
            )
            .unwrap();
    }
    // Compatibility <1 mm alias used by historical generic Crusher 10/12 mm settings.
    tables.add_size_bin(18, 8, 1.0, 0.5, false).unwrap();
    tables.set_legacy_lt_one_mm_id(18);
    for index in 0..4 {
        tables.add_liberation_class(index as u8, index);
    }
    tables
}

fn state(size_bin_id: u8, texture_profile_id: u32) -> PackedSolidState {
    let mut state = PackedSolidState::new();
    state
        .push_fraction(
            FractionDescriptor {
                species_id: 1,
                size_bin_id,
                liberation_class_id: 0,
                texture_profile_id,
            },
            100.0,
        )
        .unwrap();
    state
}

fn size_summary(state: &PackedSolidState) -> HashMap<u8, f64> {
    let mut summary = HashMap::new();
    for index in 0..state.len() {
        let descriptor = state.descriptor_at(index).unwrap();
        *summary.entry(descriptor.size_bin_id).or_insert(0.0) += state.quantity_at(index).unwrap();
    }
    summary
}

fn useful_liberation_share(state: &PackedSolidState) -> f64 {
    let total = state.total_quantity();
    let mut useful = 0.0;
    for index in 0..state.len() {
        let descriptor = state.descriptor_at(index).unwrap();
        if descriptor.liberation_class_id >= 2 {
            useful += state.quantity_at(index).unwrap();
        }
    }
    useful / total
}

#[test]
fn historical_generic_crusher_retains_10_mm_compatibility_distribution() {
    let tables = tables();
    let product = legacy_crush(&state(13, 0), 10, 10.0, &tables).unwrap();
    let sizes = size_summary(&product);
    assert!((sizes[&10] - 65.0).abs() < 1e-9);
    assert!((sizes[&9] - 25.0).abs() < 1e-9);
    assert!((sizes[&18] - 10.0).abs() < 1e-9);
    assert!((product.total_quantity() - 100.0).abs() < 1e-9);
}

#[test]
fn texture_grain_scale_changes_ball_mill_liberation_like_production() {
    let mut tables = tables();
    let modes = [0.15, 0.35, 0.35, 0.15];
    tables.set_species_texture(
        1,
        1,
        PackedSpeciesTexture::new(140.0, 350.0, 875.0, modes).unwrap(),
    );
    tables.set_species_texture(
        2,
        1,
        PackedSpeciesTexture::new(22.0, 55.0, 137.5, modes).unwrap(),
    );

    let coarse = staged_comminute(
        &state(11, 1),
        6,
        PackedComminutionEquipment::BallMill,
        &tables,
    )
    .unwrap();
    let fine = staged_comminute(
        &state(11, 2),
        6,
        PackedComminutionEquipment::BallMill,
        &tables,
    )
    .unwrap();

    assert!(useful_liberation_share(&coarse) > useful_liberation_share(&fine) + 0.05);
    assert!((coarse.total_quantity() - 100.0).abs() < 1e-9);
    assert!((fine.total_quantity() - 100.0).abs() < 1e-9);
}
