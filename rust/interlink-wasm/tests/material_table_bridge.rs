use interlink_wasm::WasmPackedWorldRuntime;

const THERMAL_REFERENCE_TEMPERATURE_K: f64 = 298.15;

fn assert_close(actual: f64, expected: f64, tolerance: f64) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "expected {expected}, got {actual}"
    );
}

#[test]
fn bridge_loaded_thermal_table_controls_hopper_temperature() {
    let mut world = WasmPackedWorldRuntime::new();
    world
        .set_specific_heat_capacity_j_per_kg_k(7, 500.0)
        .unwrap();
    world
        .add_hopper_state(
            100,
            10.0,
            vec![7],
            vec![11],
            vec![0],
            vec![0],
            vec![2.0],
            1_000.0,
        )
        .unwrap();

    let expected = THERMAL_REFERENCE_TEMPERATURE_K + 1.0;
    assert_close(world.hopper_temperature_k(100).unwrap(), expected, 1e-9);
}

#[test]
fn bridge_loaded_comminution_tables_drive_jaw_crusher_psd() {
    let mut world = WasmPackedWorldRuntime::new();
    world.add_site(1).unwrap();

    // The Jaw Crusher target is canonical bin index 13. Its mature staged
    // profile emits to indexes 14, 13, 12, and 11, so load that neighborhood
    // plus the incoming 500-1000 mm class at index 16.
    for (runtime_id, order_index, max_mm, representative_mm) in [
        (11, 11, 25.0, 20.0),
        (12, 12, 60.0, 42.5),
        (13, 13, 120.0, 90.0),
        (14, 14, 250.0, 185.0),
        (15, 15, 500.0, 375.0),
        (16, 16, 1_000.0, 750.0),
    ] {
        world
            .add_comminution_size_bin(
                runtime_id,
                order_index,
                max_mm,
                representative_mm,
                true,
            )
            .unwrap();
    }
    for (runtime_id, order_index) in [(0, 0), (1, 1), (2, 2), (3, 3)] {
        world.add_comminution_liberation_class(runtime_id, order_index);
    }
    world
        .set_comminution_species_texture(
            9,
            7,
            72.0,
            180.0,
            450.0,
            0.15,
            0.35,
            0.35,
            0.15,
        )
        .unwrap();
    world
        .set_comminution_texture_properties(9, 10.0, 15.0, 0.3)
        .unwrap();

    world
        .add_hopper_state(
            100,
            100.0,
            vec![7],
            vec![16],
            vec![0],
            vec![9],
            vec![10.0],
            0.0,
        )
        .unwrap();
    world
        .add_hopper_state(101, 100.0, vec![], vec![], vec![], vec![], vec![], 0.0)
        .unwrap();
    world
        .add_comminution(1, 10, 0, 1, 13, 120.0, 5.0, 1_000.0, true, 100, 101)
        .unwrap();
    world.seal();

    assert!(world.tick_fixed().unwrap());
    assert_eq!(world.node_operating_state(10), "running");
    assert!(world.node_last_error(10).is_empty());

    let size_ids = world.hopper_size_bin_ids(101).unwrap();
    let quantities = world.hopper_quantities(101).unwrap();
    let by_size = |size_id: u8| {
        size_ids
            .iter()
            .zip(quantities.iter())
            .filter(|(id, _)| **id == size_id)
            .map(|(_, quantity)| *quantity)
            .sum::<f64>()
    };

    // 5 kg/s for one 0.1 s fixed step = 0.5 kg. The mature Jaw profile is
    // 15% / 55% / 20% / 10% around the selected target size.
    assert_close(world.hopper_stored_mass_kg(101), 0.5, 1e-9);
    assert_close(by_size(14), 0.075, 1e-9);
    assert_close(by_size(13), 0.275, 1e-9);
    assert_close(by_size(12), 0.100, 1e-9);
    assert_close(by_size(11), 0.050, 1e-9);
}

#[test]
fn bridge_loaded_separation_tables_drive_magnetic_partition() {
    let mut world = WasmPackedWorldRuntime::new();
    world.add_site(1).unwrap();

    world.add_separation_size_bin(11, 25.0, 1.0).unwrap();
    world.add_separation_liberation_class(3, 0.8).unwrap();
    world.set_species_magnetic_response(7, 0.5).unwrap();

    world
        .add_hopper_state(
            200,
            10.0,
            vec![7],
            vec![11],
            vec![3],
            vec![0],
            vec![1.0],
            0.0,
        )
        .unwrap();
    world
        .add_hopper_state(201, 10.0, vec![], vec![], vec![], vec![], vec![], 0.0)
        .unwrap();
    world
        .add_hopper_state(202, 10.0, vec![], vec![], vec![], vec![], vec![], 0.0)
        .unwrap();
    world
        .add_magnetic_separator(1, 20, 0, 1.0, 25.0, 1.0, true, 200, 201, 202)
        .unwrap();
    world.seal();

    assert!(world.tick_fixed().unwrap());
    assert_eq!(world.node_operating_state(20), "running");
    assert!(world.node_last_error(20).is_empty());

    // Recovery = 0.5 magnetic response * 0.8 liberation * 1.0 size *
    // 1.0 field curve + 0.02 entrainment = 0.42. One step processes 0.1 kg.
    assert_close(world.hopper_stored_mass_kg(201), 0.042, 1e-9);
    assert_close(world.hopper_stored_mass_kg(202), 0.058, 1e-9);
}

#[test]
fn bridge_accepts_complete_goethite_reaction_table_before_seal() {
    let mut world = WasmPackedWorldRuntime::new();

    world
        .begin_goethite_reaction(
            1,
            2,
            3,
            1.0,
            0.9,
            0.1,
            85_000.0,
            120_000.0,
            100_000.0,
        )
        .unwrap();
    world.set_reaction_size_factor(11, 1.25).unwrap();
    world
        .set_reaction_product_texture_mapping(9, 10)
        .unwrap();
    world.commit_goethite_reaction().unwrap();

    // Sealing after commit exercises the same setup lifecycle used by the
    // browser Worker and ensures the builder can be finalized into runtime state.
    world.seal();
}
