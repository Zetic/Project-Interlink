use interlink_core::{FractionDescriptor, PackedSolidBody, PackedSolidState};
use interlink_roasting::{PackedRoastingFurnaceConfig, PackedRoastingFurnaceRuntime};
use interlink_runtime::PackedWorldRuntime;
use interlink_thermal::PackedGasBody;

fn body(mass_kg: f64, sensible_enthalpy_j: f64) -> PackedSolidBody {
    if mass_kg <= 0.0 {
        return PackedSolidBody::empty();
    }
    let mut state = PackedSolidState::new();
    state
        .push_fraction(
            FractionDescriptor {
                species_id: 1,
                size_bin_id: 1,
                liberation_class_id: 1,
                texture_profile_id: 0,
            },
            mass_kg,
        )
        .unwrap();
    PackedSolidBody::new(state, sensible_enthalpy_j).unwrap()
}

fn furnace() -> PackedRoastingFurnaceRuntime {
    PackedRoastingFurnaceRuntime::new(
        PackedRoastingFurnaceConfig::new(
            800.0,
            60.0,
            1200.0,
            4.0,
            20.0,
            25.0,
            2,
            true,
        )
        .unwrap(),
    )
}

#[test]
fn world_and_site_clocks_import_without_advancing_simulation() {
    let mut world = PackedWorldRuntime::new();
    world.add_site(7).unwrap();

    world.import_elapsed_seconds(12.5).unwrap();
    world.import_site_stats(7, 3.25, 9.75).unwrap();

    assert_eq!(world.elapsed_seconds(), 12.5);
    let site = world.site(7).unwrap();
    assert_eq!(site.elapsed_seconds(), 3.25);
    assert_eq!(site.extracted_kg(), 9.75);

    assert!(world.import_elapsed_seconds(-0.1).is_err());
    assert!(world.import_site_stats(7, -0.1, 0.0).is_err());
    assert!(world.import_site_stats(999, 0.0, 0.0).is_err());
}

#[test]
fn furnace_retained_inventory_import_preserves_mass_and_sensible_energy() {
    let mut runtime = furnace();
    let zones = vec![body(1.5, 450.0), body(0.5, 125.0)];
    let pending = body(0.25, 50.0);
    let gas = PackedGasBody::empty();

    runtime
        .import_retained_state(zones, pending, gas)
        .unwrap();

    assert_eq!(runtime.zones().len(), 2);
    assert!((runtime.zones()[0].total_mass_kg() - 1.5).abs() < 1e-12);
    assert!((runtime.zones()[0].sensible_enthalpy_j() - 450.0).abs() < 1e-12);
    assert!((runtime.zones()[1].total_mass_kg() - 0.5).abs() < 1e-12);
    assert!((runtime.pending_feed().total_mass_kg() - 0.25).abs() < 1e-12);
    assert!((runtime.pending_feed().sensible_enthalpy_j() - 50.0).abs() < 1e-12);
    assert_eq!(runtime.gas_inventory().total_mass_kg(), 0.0);
    assert_eq!(runtime.solid_product_stream().total_mass_flow_kg_per_second(), 0.0);
    assert_eq!(runtime.gas_exhaust_stream().total_mass_flow_kg_per_second(), 0.0);

    assert!(runtime
        .import_retained_state(
            vec![PackedSolidBody::empty()],
            PackedSolidBody::empty(),
            PackedGasBody::empty(),
        )
        .is_err());
}

#[test]
fn world_furnace_import_rejects_nonexistent_runtime_owner() {
    let mut world = PackedWorldRuntime::new();
    world.add_site(1).unwrap();
    let error = world
        .import_furnace_state(
            999,
            vec![PackedSolidBody::empty(), PackedSolidBody::empty()],
            PackedSolidBody::empty(),
            PackedGasBody::empty(),
        )
        .unwrap_err();
    assert!(error.contains("missing runtime furnace 999"));
}
