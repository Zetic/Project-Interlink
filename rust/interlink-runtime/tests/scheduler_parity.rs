use interlink_core::{FractionDescriptor, PackedHopperState, PackedSolidBody, PackedSolidState};
use interlink_extraction::{PackedExtractorConfig, PackedExtractorRuntime};
use interlink_processes::{PackedFeederConfig, PackedFeederRuntime, PackedOperatingState};
use interlink_roasting::{PackedRoastingFurnaceConfig, PackedRoastingFurnaceRuntime};
use interlink_runtime::{PackedSolidTarget, PackedWorldRuntime};
use interlink_thermal::PackedGasBody;
use interlink_thermochemistry::{PackedGoethiteReactionConfig, PackedGoethiteReactionTables};

fn descriptor(species_id: u16) -> FractionDescriptor {
    FractionDescriptor {
        species_id,
        size_bin_id: 1,
        liberation_class_id: 1,
        texture_profile_id: 0,
    }
}

fn feed_hopper(mass_kg: f64) -> PackedHopperState {
    let mut state = PackedSolidState::new();
    state.push_fraction(descriptor(1), mass_kg).unwrap();
    PackedHopperState::new(
        mass_kg.max(1.0) + 10.0,
        PackedSolidBody::new(state, 0.0).unwrap(),
    )
    .unwrap()
}

fn reaction() -> PackedGoethiteReactionTables {
    let config = PackedGoethiteReactionConfig::new(
        1,
        2,
        3,
        0.177702,
        0.159687,
        0.018015,
        90_000.0,
        90_000.0,
        60_000.0,
    )
    .unwrap();
    let mut reaction = PackedGoethiteReactionTables::new(config);
    reaction.set_size_factor(1, 1.0).unwrap();
    reaction
}

fn furnace(enabled: bool) -> PackedRoastingFurnaceRuntime {
    PackedRoastingFurnaceRuntime::new(
        PackedRoastingFurnaceConfig::new(
            800.0, 60.0, 1200.0, 4.0, 4.0, 25.0, 4, enabled,
        )
        .unwrap(),
    )
}

fn add_thermal_and_reaction(world: &mut PackedWorldRuntime) {
    world
        .thermal_table_mut()
        .set_specific_heat_capacity_j_per_kg_k(1, 650.0)
        .unwrap();
    world
        .thermal_table_mut()
        .set_specific_heat_capacity_j_per_kg_k(2, 650.0)
        .unwrap();
    world
        .thermal_table_mut()
        .set_specific_heat_capacity_j_per_kg_k(3, 1900.0)
        .unwrap();
    world.set_reaction_tables(reaction());
}

#[test]
fn disconnected_disabled_machines_remain_off_before_connection_validation() {
    let mut world = PackedWorldRuntime::new();
    world.add_site(1).unwrap();
    world
        .add_extractor(
            1,
            10,
            0,
            PackedExtractorRuntime::new(PackedExtractorConfig::new(5.0, false).unwrap()),
            None,
            None,
        )
        .unwrap();
    world
        .add_feeder(
            1,
            11,
            1,
            PackedFeederRuntime::new(PackedFeederConfig::new(2.0, 8.0, false).unwrap()),
            None,
            None,
        )
        .unwrap();
    world
        .add_roasting_furnace(1, 12, 2, furnace(false), None, None)
        .unwrap();

    world.tick_fixed().unwrap();

    for node_id in [10, 11, 12] {
        let status = world.node_status(node_id).unwrap();
        assert_eq!(status.operating_state(), PackedOperatingState::Off);
        assert_eq!(status.last_error(), None);
    }
}

#[test]
fn missing_furnace_vent_does_not_drop_other_runtime_owners_on_error() {
    let mut world = PackedWorldRuntime::new();
    world.add_site(1).unwrap();
    add_thermal_and_reaction(&mut world);
    world
        .add_hopper(100, PackedHopperState::empty(100.0).unwrap())
        .unwrap();
    world
        .add_roasting_furnace(
            1,
            20,
            0,
            furnace(true),
            Some(PackedSolidTarget::Hopper(100)),
            Some(999),
        )
        .unwrap();

    let error = world.tick_fixed().unwrap_err();
    assert!(error.contains("missing runtime exhaust vent 999"));
    assert!(
        world.hopper(100).is_some(),
        "product Hopper must remain owned after failed preflight"
    );
    assert!(
        world.node_status(20).is_some(),
        "source furnace record must be restored by the scheduler loop"
    );
}

#[test]
fn missing_furnace_chain_vent_does_not_drop_downstream_furnace() {
    let mut world = PackedWorldRuntime::new();
    world.add_site(1).unwrap();
    add_thermal_and_reaction(&mut world);
    world
        .add_roasting_furnace(
            1,
            20,
            0,
            furnace(true),
            Some(PackedSolidTarget::Furnace(21)),
            Some(999),
        )
        .unwrap();
    world
        .add_roasting_furnace(1, 21, 1, furnace(true), None, None)
        .unwrap();

    let error = world.tick_fixed().unwrap_err();
    assert!(error.contains("missing runtime exhaust vent 999"));
    assert!(
        world.node_status(21).is_some(),
        "downstream furnace must survive failed source preflight"
    );
}

#[test]
fn direct_feeder_and_furnace_chaining_runs_entirely_inside_world_scheduler() {
    let mut world = PackedWorldRuntime::new();
    world.add_site(1).unwrap();
    add_thermal_and_reaction(&mut world);
    world.add_hopper(100, feed_hopper(4.0)).unwrap();
    world
        .add_hopper(101, PackedHopperState::empty(100.0).unwrap())
        .unwrap();
    world
        .add_exhaust_vent(200, PackedGasBody::empty())
        .unwrap();
    world
        .add_exhaust_vent(201, PackedGasBody::empty())
        .unwrap();
    world
        .add_feeder(
            1,
            10,
            0,
            PackedFeederRuntime::new(PackedFeederConfig::new(1.0, 8.0, true).unwrap()),
            Some(100),
            Some(PackedSolidTarget::Furnace(20)),
        )
        .unwrap();
    world
        .add_roasting_furnace(
            1,
            20,
            1,
            furnace(true),
            Some(PackedSolidTarget::Furnace(21)),
            Some(200),
        )
        .unwrap();
    world
        .add_roasting_furnace(
            1,
            21,
            2,
            furnace(true),
            Some(PackedSolidTarget::Hopper(101)),
            Some(201),
        )
        .unwrap();

    let initial_mass = world.hopper(100).unwrap().stored_mass_kg();
    let mut downstream_received = false;
    for _ in 0..160 {
        world.tick_fixed().unwrap();
        if world
            .furnace_diagnostics(21)
            .unwrap()
            .last_feed_rate_kg_per_second
            > 0.0
        {
            downstream_received = true;
        }
    }

    assert!(
        downstream_received,
        "upstream furnace product must feed the downstream furnace directly"
    );
    assert!(world.hopper(100).unwrap().stored_mass_kg() < initial_mass);
    assert!(world.exhaust_vent(200).unwrap().total_mass_kg().is_finite());
    assert!(world.exhaust_vent(201).unwrap().total_mass_kg().is_finite());
}
