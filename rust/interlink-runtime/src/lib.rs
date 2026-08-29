use std::collections::HashMap;

use interlink_comminution::{
    PackedComminutionRuntime, PackedComminutionTables,
};
use interlink_core::{
    transfer_between_hoppers, PackedHopperState, SIMULATION_STEP_SECONDS,
    SOLID_MATERIAL_TOLERANCE,
};
use interlink_extraction::{PackedExtractorRuntime, PackedResourceOccurrence};
use interlink_processes::{PackedFeederRuntime, PackedOperatingState, APPARATUS_TRANSFER_TOLERANCE_KG};
use interlink_roasting::{
    PackedRoastingFurnaceDiagnostics, PackedRoastingFurnaceRuntime,
};
use interlink_routing::{PackedMergerRuntime, PackedSpeciesThermalTable, PackedSplitterRuntime};
use interlink_separation::{
    PackedMagneticSeparatorRuntime, PackedScreenRuntime, PackedSeparationTables,
};
use interlink_thermal::PackedGasBody;
use interlink_thermochemistry::PackedGoethiteReactionTables;

pub type RuntimeNodeId = u32;
pub type RuntimeSiteId = u32;
pub type RuntimeOccurrenceId = u32;
pub type RuntimeTransferId = u32;

pub const PHASE_EXTRACTOR: i32 = 10;
pub const PHASE_MERGER: i32 = 15;
pub const PHASE_FEEDER: i32 = 18;
pub const PHASE_LEGACY_CRUSHER: i32 = 20;
pub const PHASE_JAW_CRUSHER: i32 = 20;
pub const PHASE_CONE_CRUSHER: i32 = 22;
pub const PHASE_BALL_MILL: i32 = 24;
pub const PHASE_SCREEN: i32 = 30;
pub const PHASE_SPLITTER: i32 = 35;
pub const PHASE_MAGNETIC_SEPARATOR: i32 = 40;
pub const PHASE_ROASTING_FURNACE: i32 = 45;
pub const DEFAULT_PASSIVE_STORAGE_TRANSFER_KG_PER_SECOND: f64 = 10.0;

fn validate_positive_finite(value: f64, label: &str) -> Result<(), String> {
    if !value.is_finite() || value <= 0.0 {
        return Err(format!("{label} must be finite and positive"));
    }
    Ok(())
}

fn validate_non_negative_finite(value: f64, label: &str) -> Result<(), String> {
    if !value.is_finite() || value < 0.0 {
        return Err(format!("{label} must be finite and non-negative"));
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PackedSolidTarget {
    Hopper(RuntimeNodeId),
    Furnace(RuntimeNodeId),
}

#[derive(Debug, Clone)]
pub struct PackedNodeStatus {
    operating_state: PackedOperatingState,
    last_error: Option<String>,
}

impl PackedNodeStatus {
    fn new(state: PackedOperatingState) -> Self {
        Self {
            operating_state: state,
            last_error: None,
        }
    }

    fn set(&mut self, state: PackedOperatingState, error: Option<&str>) {
        self.operating_state = state;
        self.last_error = error.map(str::to_string);
    }

    fn blocked(&mut self, message: impl Into<String>) {
        self.operating_state = PackedOperatingState::Blocked;
        self.last_error = Some(message.into());
    }

    fn idle(&mut self) {
        self.operating_state = PackedOperatingState::Idle;
        self.last_error = None;
    }

    pub fn operating_state(&self) -> PackedOperatingState {
        self.operating_state
    }

    pub fn last_error(&self) -> Option<&str> {
        self.last_error.as_deref()
    }
}

#[derive(Debug, Clone)]
enum PackedMachineKind {
    Extractor {
        runtime: PackedExtractorRuntime,
        occurrence_id: Option<RuntimeOccurrenceId>,
        output_hopper_id: Option<RuntimeNodeId>,
    },
    Merger {
        runtime: PackedMergerRuntime,
        input_a_hopper_id: Option<RuntimeNodeId>,
        input_b_hopper_id: Option<RuntimeNodeId>,
        output_hopper_id: Option<RuntimeNodeId>,
    },
    Feeder {
        runtime: PackedFeederRuntime,
        input_hopper_id: Option<RuntimeNodeId>,
        output_target: Option<PackedSolidTarget>,
    },
    Comminution {
        runtime: PackedComminutionRuntime,
        input_hopper_id: Option<RuntimeNodeId>,
        output_hopper_id: Option<RuntimeNodeId>,
    },
    Screen {
        runtime: PackedScreenRuntime,
        input_hopper_id: Option<RuntimeNodeId>,
        undersize_hopper_id: Option<RuntimeNodeId>,
        oversize_hopper_id: Option<RuntimeNodeId>,
    },
    Splitter {
        runtime: PackedSplitterRuntime,
        input_hopper_id: Option<RuntimeNodeId>,
        output_a_hopper_id: Option<RuntimeNodeId>,
        output_b_hopper_id: Option<RuntimeNodeId>,
    },
    MagneticSeparator {
        runtime: PackedMagneticSeparatorRuntime,
        input_hopper_id: Option<RuntimeNodeId>,
        concentrate_hopper_id: Option<RuntimeNodeId>,
        tailings_hopper_id: Option<RuntimeNodeId>,
    },
    Furnace {
        runtime: PackedRoastingFurnaceRuntime,
        product_target: Option<PackedSolidTarget>,
        gas_vent_id: Option<RuntimeNodeId>,
    },
}

#[derive(Debug, Clone)]
struct PackedMachineRecord {
    site_id: RuntimeSiteId,
    phase: i32,
    ordinal: u32,
    status: PackedNodeStatus,
    kind: PackedMachineKind,
}

#[derive(Debug, Clone, Copy)]
struct ScheduleEntry {
    node_id: RuntimeNodeId,
    phase: i32,
    ordinal: u32,
}

#[derive(Debug, Clone, Copy)]
pub struct PackedStorageLink {
    pub source_hopper_id: RuntimeNodeId,
    pub target_hopper_id: RuntimeNodeId,
    pub rate_kg_per_second: f64,
}

#[derive(Debug, Clone)]
pub struct PackedSiteRuntime {
    id: RuntimeSiteId,
    schedule: Vec<ScheduleEntry>,
    passive_storage_links: Vec<PackedStorageLink>,
    elapsed_seconds: f64,
    extracted_kg: f64,
}

impl PackedSiteRuntime {
    fn new(id: RuntimeSiteId) -> Self {
        Self {
            id,
            schedule: Vec::new(),
            passive_storage_links: Vec::new(),
            elapsed_seconds: 0.0,
            extracted_kg: 0.0,
        }
    }

    pub fn id(&self) -> RuntimeSiteId {
        self.id
    }

    pub fn elapsed_seconds(&self) -> f64 {
        self.elapsed_seconds
    }

    pub fn extracted_kg(&self) -> f64 {
        self.extracted_kg
    }
}

#[derive(Debug, Clone)]
pub struct PackedBoundaryTransfer {
    pub id: RuntimeTransferId,
    pub source_hopper_id: RuntimeNodeId,
    pub target_hopper_id: RuntimeNodeId,
    pub capacity_kg_per_second: f64,
    pub priority: i32,
    pub ordinal: u32,
    pub last_moved_kg: f64,
    pub last_rate_kg_per_second: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PackedWorldTickResult {
    pub advanced: bool,
    pub ticks: u32,
    pub extracted_kg: f64,
}

#[derive(Debug, Clone)]
pub struct PackedWorldRuntime {
    running: bool,
    elapsed_seconds: f64,
    site_order: Vec<RuntimeSiteId>,
    sites: HashMap<RuntimeSiteId, PackedSiteRuntime>,
    hoppers: HashMap<RuntimeNodeId, PackedHopperState>,
    occurrences: HashMap<RuntimeOccurrenceId, PackedResourceOccurrence>,
    vents: HashMap<RuntimeNodeId, PackedGasBody>,
    machines: HashMap<RuntimeNodeId, PackedMachineRecord>,
    boundary_transfers: Vec<PackedBoundaryTransfer>,
    thermal: PackedSpeciesThermalTable,
    comminution: PackedComminutionTables,
    separation: PackedSeparationTables,
    reaction: Option<PackedGoethiteReactionTables>,
    sealed: bool,
}

impl Default for PackedWorldRuntime {
    fn default() -> Self {
        Self::new()
    }
}

impl PackedWorldRuntime {
    pub fn new() -> Self {
        Self {
            running: true,
            elapsed_seconds: 0.0,
            site_order: Vec::new(),
            sites: HashMap::new(),
            hoppers: HashMap::new(),
            occurrences: HashMap::new(),
            vents: HashMap::new(),
            machines: HashMap::new(),
            boundary_transfers: Vec::new(),
            thermal: PackedSpeciesThermalTable::new(),
            comminution: PackedComminutionTables::new(),
            separation: PackedSeparationTables::new(),
            reaction: None,
            sealed: false,
        }
    }

    pub fn running(&self) -> bool {
        self.running
    }

    pub fn pause(&mut self) {
        self.running = false;
    }

    pub fn resume(&mut self) {
        self.running = true;
    }

    pub fn elapsed_seconds(&self) -> f64 {
        self.elapsed_seconds
    }

    pub fn thermal_table(&self) -> &PackedSpeciesThermalTable {
        &self.thermal
    }

    pub fn thermal_table_mut(&mut self) -> &mut PackedSpeciesThermalTable {
        self.sealed = false;
        &mut self.thermal
    }

    pub fn comminution_tables_mut(&mut self) -> &mut PackedComminutionTables {
        self.sealed = false;
        &mut self.comminution
    }

    pub fn separation_tables_mut(&mut self) -> &mut PackedSeparationTables {
        self.sealed = false;
        &mut self.separation
    }

    pub fn set_reaction_tables(&mut self, tables: PackedGoethiteReactionTables) {
        self.reaction = Some(tables);
        self.sealed = false;
    }

    pub fn reaction_tables(&self) -> Option<&PackedGoethiteReactionTables> {
        self.reaction.as_ref()
    }

    pub fn add_site(&mut self, site_id: RuntimeSiteId) -> Result<(), String> {
        if self.sites.contains_key(&site_id) {
            return Err(format!("runtime Site {site_id} already exists"));
        }
        self.sites.insert(site_id, PackedSiteRuntime::new(site_id));
        self.site_order.push(site_id);
        self.sealed = false;
        Ok(())
    }

    pub fn site(&self, site_id: RuntimeSiteId) -> Option<&PackedSiteRuntime> {
        self.sites.get(&site_id)
    }

    pub fn add_hopper(
        &mut self,
        node_id: RuntimeNodeId,
        hopper: PackedHopperState,
    ) -> Result<(), String> {
        if self.hoppers.contains_key(&node_id) || self.machines.contains_key(&node_id) || self.vents.contains_key(&node_id) {
            return Err(format!("runtime node {node_id} already exists"));
        }
        self.hoppers.insert(node_id, hopper);
        self.sealed = false;
        Ok(())
    }

    pub fn hopper(&self, node_id: RuntimeNodeId) -> Option<&PackedHopperState> {
        self.hoppers.get(&node_id)
    }

    pub fn hopper_mut(&mut self, node_id: RuntimeNodeId) -> Option<&mut PackedHopperState> {
        self.hoppers.get_mut(&node_id)
    }

    pub fn add_occurrence(
        &mut self,
        occurrence_id: RuntimeOccurrenceId,
        occurrence: PackedResourceOccurrence,
    ) -> Result<(), String> {
        if self.occurrences.contains_key(&occurrence_id) {
            return Err(format!("runtime occurrence {occurrence_id} already exists"));
        }
        self.occurrences.insert(occurrence_id, occurrence);
        self.sealed = false;
        Ok(())
    }

    pub fn occurrence(&self, occurrence_id: RuntimeOccurrenceId) -> Option<&PackedResourceOccurrence> {
        self.occurrences.get(&occurrence_id)
    }

    pub fn add_exhaust_vent(
        &mut self,
        node_id: RuntimeNodeId,
        emitted_gas: PackedGasBody,
    ) -> Result<(), String> {
        if self.hoppers.contains_key(&node_id) || self.machines.contains_key(&node_id) || self.vents.contains_key(&node_id) {
            return Err(format!("runtime node {node_id} already exists"));
        }
        self.vents.insert(node_id, emitted_gas);
        self.sealed = false;
        Ok(())
    }

    pub fn exhaust_vent(&self, node_id: RuntimeNodeId) -> Option<&PackedGasBody> {
        self.vents.get(&node_id)
    }

    fn add_machine(
        &mut self,
        site_id: RuntimeSiteId,
        node_id: RuntimeNodeId,
        phase: i32,
        ordinal: u32,
        initial_state: PackedOperatingState,
        kind: PackedMachineKind,
    ) -> Result<(), String> {
        if !self.sites.contains_key(&site_id) {
            return Err(format!("unknown runtime Site {site_id}"));
        }
        if self.hoppers.contains_key(&node_id) || self.machines.contains_key(&node_id) || self.vents.contains_key(&node_id) {
            return Err(format!("runtime node {node_id} already exists"));
        }
        let record = PackedMachineRecord {
            site_id,
            phase,
            ordinal,
            status: PackedNodeStatus::new(initial_state),
            kind,
        };
        self.machines.insert(node_id, record);
        self.sites.get_mut(&site_id).unwrap().schedule.push(ScheduleEntry {
            node_id,
            phase,
            ordinal,
        });
        self.sealed = false;
        Ok(())
    }

    pub fn add_extractor(
        &mut self,
        site_id: RuntimeSiteId,
        node_id: RuntimeNodeId,
        ordinal: u32,
        runtime: PackedExtractorRuntime,
        occurrence_id: Option<RuntimeOccurrenceId>,
        output_hopper_id: Option<RuntimeNodeId>,
    ) -> Result<(), String> {
        let state = runtime.operating_state();
        self.add_machine(
            site_id,
            node_id,
            PHASE_EXTRACTOR,
            ordinal,
            state,
            PackedMachineKind::Extractor { runtime, occurrence_id, output_hopper_id },
        )
    }

    pub fn add_merger(
        &mut self,
        site_id: RuntimeSiteId,
        node_id: RuntimeNodeId,
        ordinal: u32,
        runtime: PackedMergerRuntime,
        input_a_hopper_id: Option<RuntimeNodeId>,
        input_b_hopper_id: Option<RuntimeNodeId>,
        output_hopper_id: Option<RuntimeNodeId>,
    ) -> Result<(), String> {
        let state = runtime.operating_state();
        self.add_machine(
            site_id,
            node_id,
            PHASE_MERGER,
            ordinal,
            state,
            PackedMachineKind::Merger { runtime, input_a_hopper_id, input_b_hopper_id, output_hopper_id },
        )
    }

    pub fn add_feeder(
        &mut self,
        site_id: RuntimeSiteId,
        node_id: RuntimeNodeId,
        ordinal: u32,
        runtime: PackedFeederRuntime,
        input_hopper_id: Option<RuntimeNodeId>,
        output_target: Option<PackedSolidTarget>,
    ) -> Result<(), String> {
        let state = runtime.operating_state();
        self.add_machine(
            site_id,
            node_id,
            PHASE_FEEDER,
            ordinal,
            state,
            PackedMachineKind::Feeder { runtime, input_hopper_id, output_target },
        )
    }

    pub fn add_comminution(
        &mut self,
        site_id: RuntimeSiteId,
        node_id: RuntimeNodeId,
        phase: i32,
        ordinal: u32,
        runtime: PackedComminutionRuntime,
        input_hopper_id: Option<RuntimeNodeId>,
        output_hopper_id: Option<RuntimeNodeId>,
    ) -> Result<(), String> {
        if !matches!(phase, PHASE_LEGACY_CRUSHER | PHASE_CONE_CRUSHER | PHASE_BALL_MILL) {
            return Err(format!("invalid comminution scheduler phase {phase}"));
        }
        let state = runtime.operating_state();
        self.add_machine(
            site_id,
            node_id,
            phase,
            ordinal,
            state,
            PackedMachineKind::Comminution { runtime, input_hopper_id, output_hopper_id },
        )
    }

    pub fn add_screen(
        &mut self,
        site_id: RuntimeSiteId,
        node_id: RuntimeNodeId,
        ordinal: u32,
        runtime: PackedScreenRuntime,
        input_hopper_id: Option<RuntimeNodeId>,
        undersize_hopper_id: Option<RuntimeNodeId>,
        oversize_hopper_id: Option<RuntimeNodeId>,
    ) -> Result<(), String> {
        let state = runtime.operating_state();
        self.add_machine(
            site_id,
            node_id,
            PHASE_SCREEN,
            ordinal,
            state,
            PackedMachineKind::Screen { runtime, input_hopper_id, undersize_hopper_id, oversize_hopper_id },
        )
    }

    pub fn add_splitter(
        &mut self,
        site_id: RuntimeSiteId,
        node_id: RuntimeNodeId,
        ordinal: u32,
        runtime: PackedSplitterRuntime,
        input_hopper_id: Option<RuntimeNodeId>,
        output_a_hopper_id: Option<RuntimeNodeId>,
        output_b_hopper_id: Option<RuntimeNodeId>,
    ) -> Result<(), String> {
        let state = runtime.operating_state();
        self.add_machine(
            site_id,
            node_id,
            PHASE_SPLITTER,
            ordinal,
            state,
            PackedMachineKind::Splitter { runtime, input_hopper_id, output_a_hopper_id, output_b_hopper_id },
        )
    }

    pub fn add_magnetic_separator(
        &mut self,
        site_id: RuntimeSiteId,
        node_id: RuntimeNodeId,
        ordinal: u32,
        runtime: PackedMagneticSeparatorRuntime,
        input_hopper_id: Option<RuntimeNodeId>,
        concentrate_hopper_id: Option<RuntimeNodeId>,
        tailings_hopper_id: Option<RuntimeNodeId>,
    ) -> Result<(), String> {
        let state = runtime.operating_state();
        self.add_machine(
            site_id,
            node_id,
            PHASE_MAGNETIC_SEPARATOR,
            ordinal,
            state,
            PackedMachineKind::MagneticSeparator { runtime, input_hopper_id, concentrate_hopper_id, tailings_hopper_id },
        )
    }

    pub fn add_roasting_furnace(
        &mut self,
        site_id: RuntimeSiteId,
        node_id: RuntimeNodeId,
        ordinal: u32,
        runtime: PackedRoastingFurnaceRuntime,
        product_target: Option<PackedSolidTarget>,
        gas_vent_id: Option<RuntimeNodeId>,
    ) -> Result<(), String> {
        let state = runtime.operating_state();
        self.add_machine(
            site_id,
            node_id,
            PHASE_ROASTING_FURNACE,
            ordinal,
            state,
            PackedMachineKind::Furnace { runtime, product_target, gas_vent_id },
        )
    }

    pub fn add_site_passive_storage_link(
        &mut self,
        site_id: RuntimeSiteId,
        source_hopper_id: RuntimeNodeId,
        target_hopper_id: RuntimeNodeId,
        rate_kg_per_second: f64,
    ) -> Result<(), String> {
        validate_non_negative_finite(rate_kg_per_second, "passive storage transfer rate")?;
        if source_hopper_id == target_hopper_id {
            return Err("passive storage link source and target must differ".to_string());
        }
        let site = self.sites.get_mut(&site_id)
            .ok_or_else(|| format!("unknown runtime Site {site_id}"))?;
        site.passive_storage_links.push(PackedStorageLink {
            source_hopper_id,
            target_hopper_id,
            rate_kg_per_second,
        });
        self.sealed = false;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_boundary_transfer(
        &mut self,
        id: RuntimeTransferId,
        source_hopper_id: RuntimeNodeId,
        target_hopper_id: RuntimeNodeId,
        capacity_kg_per_second: f64,
        priority: i32,
        ordinal: u32,
    ) -> Result<(), String> {
        validate_positive_finite(capacity_kg_per_second, "boundary transfer capacity")?;
        if source_hopper_id == target_hopper_id {
            return Err("boundary transfer source and target must differ".to_string());
        }
        if self.boundary_transfers.iter().any(|item| item.id == id) {
            return Err(format!("runtime boundary transfer {id} already exists"));
        }
        self.boundary_transfers.push(PackedBoundaryTransfer {
            id,
            source_hopper_id,
            target_hopper_id,
            capacity_kg_per_second,
            priority,
            ordinal,
            last_moved_kg: 0.0,
            last_rate_kg_per_second: 0.0,
        });
        self.sealed = false;
        Ok(())
    }

    pub fn seal(&mut self) {
        for site in self.sites.values_mut() {
            site.schedule.sort_by_key(|entry| (entry.phase, entry.ordinal));
        }
        self.boundary_transfers
            .sort_by_key(|transfer| (transfer.priority, transfer.ordinal));
        self.sealed = true;
    }

    fn ensure_sealed(&mut self) {
        if !self.sealed {
            self.seal();
        }
    }

    pub fn node_status(&self, node_id: RuntimeNodeId) -> Option<&PackedNodeStatus> {
        self.machines.get(&node_id).map(|record| &record.status)
    }

    pub fn node_output_mass_flow_kg_per_second(
        &self,
        node_id: RuntimeNodeId,
        output_index: usize,
    ) -> Option<f64> {
        let record = self.machines.get(&node_id)?;
        match &record.kind {
            PackedMachineKind::Extractor { runtime, .. } => (output_index == 0)
                .then(|| runtime.output_stream().total_mass_flow_kg_per_second()),
            PackedMachineKind::Merger { runtime, .. } => (output_index == 0)
                .then(|| runtime.output_stream().total_mass_flow_kg_per_second()),
            PackedMachineKind::Feeder { runtime, .. } => (output_index == 0)
                .then(|| runtime.output_stream().total_mass_flow_kg_per_second()),
            PackedMachineKind::Comminution { runtime, .. } => (output_index == 0)
                .then(|| runtime.output_stream().total_mass_flow_kg_per_second()),
            PackedMachineKind::Screen { runtime, .. } => match output_index {
                0 => Some(runtime.undersize_stream().total_mass_flow_kg_per_second()),
                1 => Some(runtime.oversize_stream().total_mass_flow_kg_per_second()),
                _ => None,
            },
            PackedMachineKind::Splitter { runtime, .. } => match output_index {
                0 => Some(runtime.output_a_stream().total_mass_flow_kg_per_second()),
                1 => Some(runtime.output_b_stream().total_mass_flow_kg_per_second()),
                _ => None,
            },
            PackedMachineKind::MagneticSeparator { runtime, .. } => match output_index {
                0 => Some(runtime.concentrate_stream().total_mass_flow_kg_per_second()),
                1 => Some(runtime.tailings_stream().total_mass_flow_kg_per_second()),
                _ => None,
            },
            PackedMachineKind::Furnace { runtime, .. } => match output_index {
                0 => Some(runtime.solid_product_stream().total_mass_flow_kg_per_second()),
                1 => Some(runtime.gas_exhaust_stream().total_mass_flow_kg_per_second()),
                _ => None,
            },
        }
    }

    pub fn furnace_diagnostics(
        &self,
        node_id: RuntimeNodeId,
    ) -> Option<PackedRoastingFurnaceDiagnostics> {
        let record = self.machines.get(&node_id)?;
        if let PackedMachineKind::Furnace { runtime, .. } = &record.kind {
            Some(runtime.diagnostics())
        } else {
            None
        }
    }

    pub fn boundary_transfer(&self, id: RuntimeTransferId) -> Option<&PackedBoundaryTransfer> {
        self.boundary_transfers.iter().find(|transfer| transfer.id == id)
    }

    fn take_two_hoppers(
        &mut self,
        a: RuntimeNodeId,
        b: RuntimeNodeId,
    ) -> Result<(PackedHopperState, PackedHopperState), String> {
        if a == b {
            return Err("runtime operation requires distinct Hopper owners".to_string());
        }
        let first = self.hoppers.remove(&a)
            .ok_or_else(|| format!("missing runtime Hopper {a}"))?;
        match self.hoppers.remove(&b) {
            Some(second) => Ok((first, second)),
            None => {
                self.hoppers.insert(a, first);
                Err(format!("missing runtime Hopper {b}"))
            }
        }
    }

    fn restore_two_hoppers(
        &mut self,
        a: RuntimeNodeId,
        first: PackedHopperState,
        b: RuntimeNodeId,
        second: PackedHopperState,
    ) {
        self.hoppers.insert(a, first);
        self.hoppers.insert(b, second);
    }

    fn take_three_hoppers(
        &mut self,
        a: RuntimeNodeId,
        b: RuntimeNodeId,
        c: RuntimeNodeId,
    ) -> Result<(PackedHopperState, PackedHopperState, PackedHopperState), String> {
        if a == b || a == c || b == c {
            return Err("runtime operation requires three distinct Hopper owners".to_string());
        }
        let first = self.hoppers.remove(&a)
            .ok_or_else(|| format!("missing runtime Hopper {a}"))?;
        let second = match self.hoppers.remove(&b) {
            Some(value) => value,
            None => {
                self.hoppers.insert(a, first);
                return Err(format!("missing runtime Hopper {b}"));
            }
        };
        let third = match self.hoppers.remove(&c) {
            Some(value) => value,
            None => {
                self.hoppers.insert(a, first);
                self.hoppers.insert(b, second);
                return Err(format!("missing runtime Hopper {c}"));
            }
        };
        Ok((first, second, third))
    }

    fn restore_three_hoppers(
        &mut self,
        a: RuntimeNodeId,
        first: PackedHopperState,
        b: RuntimeNodeId,
        second: PackedHopperState,
        c: RuntimeNodeId,
        third: PackedHopperState,
    ) {
        self.hoppers.insert(a, first);
        self.hoppers.insert(b, second);
        self.hoppers.insert(c, third);
    }

    fn execute_feeder_to_furnace(
        &mut self,
        runtime: &mut PackedFeederRuntime,
        source_id: RuntimeNodeId,
        furnace_id: RuntimeNodeId,
        dt: f64,
    ) -> Result<(), String> {
        let source = self.hoppers.get(&source_id)
            .ok_or_else(|| format!("missing runtime Hopper {source_id}"))?;
        if source.stored_mass_kg() <= SOLID_MATERIAL_TOLERANCE {
            let mut temporary = PackedHopperState::empty(1.0)?;
            let mut staged_source = source.clone();
            let mut staged_runtime = runtime.clone();
            staged_runtime.tick_hopper_to_hopper(&mut staged_source, &mut temporary, dt)?;
            *runtime = staged_runtime;
            return Ok(());
        }

        let mut target_record = self.machines.remove(&furnace_id)
            .ok_or_else(|| format!("missing runtime furnace {furnace_id}"))?;
        let result = (|| {
            let target_furnace = match &mut target_record.kind {
                PackedMachineKind::Furnace { runtime, .. } => runtime,
                _ => return Err(format!("runtime node {furnace_id} is not a furnace")),
            };
            let target_capacity = target_furnace.input_capacity_kg(dt)?;
            let temporary_capacity = target_capacity.max(1e-12);
            let mut temporary = PackedHopperState::empty(temporary_capacity)?;
            let mut staged_source = self.hoppers.get(&source_id).unwrap().clone();
            let mut staged_feeder = runtime.clone();
            let mut staged_target = target_furnace.clone();
            let feeder_result = staged_feeder.tick_hopper_to_hopper(
                &mut staged_source,
                &mut temporary,
                dt,
            )?;
            if feeder_result.transferred_mass_kg > APPARATUS_TRANSFER_TOLERANCE_KG {
                let accepted = staged_target.receive_feed(temporary.body(), dt)?;
                if (accepted - feeder_result.transferred_mass_kg).abs()
                    > APPARATUS_TRANSFER_TOLERANCE_KG * accepted.max(1.0)
                {
                    return Err("Feeder furnace feed could not commit atomically".to_string());
                }
            }
            self.hoppers.insert(source_id, staged_source);
            *runtime = staged_feeder;
            *target_furnace = staged_target;
            Ok(())
        })();
        self.machines.insert(furnace_id, target_record);
        result
    }

    fn execute_furnace(
        &mut self,
        runtime: &mut PackedRoastingFurnaceRuntime,
        product_target: Option<PackedSolidTarget>,
        gas_vent_id: Option<RuntimeNodeId>,
        dt: f64,
    ) -> Result<(), String> {
        let reaction = self.reaction.as_ref()
            .ok_or_else(|| "Roasting Furnace requires compiled thermochemical reaction tables".to_string())?;

        match product_target {
            Some(PackedSolidTarget::Hopper(hopper_id)) => {
                let mut product = self.hoppers.remove(&hopper_id)
                    .ok_or_else(|| format!("missing runtime Hopper {hopper_id}"))?;
                let mut vent = match gas_vent_id {
                    Some(id) => Some(self.vents.remove(&id)
                        .ok_or_else(|| format!("missing runtime exhaust vent {id}"))?),
                    None => None,
                };
                let result = runtime.tick_to_hopper_and_vent(
                    Some(&mut product),
                    vent.as_mut(),
                    &self.thermal,
                    reaction,
                    dt,
                );
                self.hoppers.insert(hopper_id, product);
                if let (Some(id), Some(body)) = (gas_vent_id, vent) {
                    self.vents.insert(id, body);
                }
                result.map(|_| ())
            }
            Some(PackedSolidTarget::Furnace(target_id)) => {
                let mut target_record = self.machines.remove(&target_id)
                    .ok_or_else(|| format!("missing runtime furnace {target_id}"))?;
                let mut vent = match gas_vent_id {
                    Some(id) => Some(self.vents.remove(&id)
                        .ok_or_else(|| format!("missing runtime exhaust vent {id}"))?),
                    None => None,
                };
                let result = (|| {
                    let target_furnace = match &mut target_record.kind {
                        PackedMachineKind::Furnace { runtime, .. } => runtime,
                        _ => return Err(format!("runtime node {target_id} is not a furnace")),
                    };
                    let target_capacity = target_furnace.input_capacity_kg(dt)?;
                    let mut temporary = PackedHopperState::empty(target_capacity.max(1e-12))?;
                    let mut staged_source = runtime.clone();
                    let mut staged_target = target_furnace.clone();
                    let tick = staged_source.tick_to_hopper_and_vent(
                        Some(&mut temporary),
                        vent.as_mut(),
                        &self.thermal,
                        reaction,
                        dt,
                    )?;
                    if tick.discharged_mass_kg > APPARATUS_TRANSFER_TOLERANCE_KG {
                        let accepted = staged_target.receive_feed(temporary.body(), dt)?;
                        if (accepted - tick.discharged_mass_kg).abs()
                            > APPARATUS_TRANSFER_TOLERANCE_KG * accepted.max(1.0)
                        {
                            return Err("Furnace-to-furnace product could not commit atomically".to_string());
                        }
                    }
                    *runtime = staged_source;
                    *target_furnace = staged_target;
                    Ok(())
                })();
                self.machines.insert(target_id, target_record);
                if let (Some(id), Some(body)) = (gas_vent_id, vent) {
                    self.vents.insert(id, body);
                }
                result
            }
            None => {
                let mut vent = match gas_vent_id {
                    Some(id) => Some(self.vents.remove(&id)
                        .ok_or_else(|| format!("missing runtime exhaust vent {id}"))?),
                    None => None,
                };
                let result = runtime.tick_to_hopper_and_vent(
                    None,
                    vent.as_mut(),
                    &self.thermal,
                    reaction,
                    dt,
                );
                if let (Some(id), Some(body)) = (gas_vent_id, vent) {
                    self.vents.insert(id, body);
                }
                result.map(|_| ())
            }
        }
    }

    fn execute_machine(&mut self, record: &mut PackedMachineRecord, dt: f64) -> Result<f64, String> {
        match &mut record.kind {
            PackedMachineKind::Extractor { runtime, occurrence_id, output_hopper_id } => {
                let Some(occurrence_id) = *occurrence_id else {
                    record.status.blocked("Extractor requires a connected Feature resource source");
                    return Ok(0.0);
                };
                let Some(output_id) = *output_hopper_id else {
                    record.status.blocked("Extractor requires a connected material output");
                    return Ok(0.0);
                };
                let mut occurrence = self.occurrences.remove(&occurrence_id)
                    .ok_or_else(|| format!("missing runtime occurrence {occurrence_id}"))?;
                let mut hopper = self.hoppers.remove(&output_id)
                    .ok_or_else(|| format!("missing runtime Hopper {output_id}"))?;
                let result = runtime.tick_occurrence_to_hopper(&mut occurrence, &mut hopper, dt);
                self.occurrences.insert(occurrence_id, occurrence);
                self.hoppers.insert(output_id, hopper);
                let tick = result?;
                record.status.set(runtime.operating_state(), runtime.last_error());
                Ok(tick.extracted_mass_kg)
            }
            PackedMachineKind::Merger { runtime, input_a_hopper_id, input_b_hopper_id, output_hopper_id } => {
                let (Some(a), Some(b), Some(out)) = (*input_a_hopper_id, *input_b_hopper_id, *output_hopper_id) else {
                    record.status.blocked("Material Merger requires input A, input B, and product connections");
                    return Ok(0.0);
                };
                let (mut ha, mut hb, mut ho) = self.take_three_hoppers(a, b, out)?;
                let result = runtime.tick_hoppers_to_hopper(&mut ha, &mut hb, &mut ho, &self.thermal, dt);
                self.restore_three_hoppers(a, ha, b, hb, out, ho);
                result?;
                record.status.set(runtime.operating_state(), runtime.last_error());
                Ok(0.0)
            }
            PackedMachineKind::Feeder { runtime, input_hopper_id, output_target } => {
                let Some(source_id) = *input_hopper_id else {
                    record.status.idle();
                    return Ok(0.0);
                };
                if self.hoppers.get(&source_id).map(PackedHopperState::stored_mass_kg).unwrap_or(0.0)
                    <= SOLID_MATERIAL_TOLERANCE
                {
                    let mut temporary = PackedHopperState::empty(1.0)?;
                    let mut source = self.hoppers.remove(&source_id)
                        .ok_or_else(|| format!("missing runtime Hopper {source_id}"))?;
                    runtime.tick_hopper_to_hopper(&mut source, &mut temporary, dt)?;
                    self.hoppers.insert(source_id, source);
                    record.status.set(runtime.operating_state(), runtime.last_error());
                    return Ok(0.0);
                }
                let Some(target) = *output_target else {
                    record.status.blocked("Feeder requires feed and product connections");
                    return Ok(0.0);
                };
                match target {
                    PackedSolidTarget::Hopper(target_id) => {
                        let (mut source, mut target) = self.take_two_hoppers(source_id, target_id)?;
                        let result = runtime.tick_hopper_to_hopper(&mut source, &mut target, dt);
                        self.restore_two_hoppers(source_id, source, target_id, target);
                        result?;
                    }
                    PackedSolidTarget::Furnace(target_id) => {
                        self.execute_feeder_to_furnace(runtime, source_id, target_id, dt)?;
                    }
                }
                record.status.set(runtime.operating_state(), runtime.last_error());
                Ok(0.0)
            }
            PackedMachineKind::Comminution { runtime, input_hopper_id, output_hopper_id } => {
                let (Some(source_id), Some(target_id)) = (*input_hopper_id, *output_hopper_id) else {
                    record.status.blocked("Comminution equipment requires feed and product Hopper connections");
                    return Ok(0.0);
                };
                let (mut source, mut target) = self.take_two_hoppers(source_id, target_id)?;
                let result = runtime.tick_hopper_to_hopper(&mut source, &mut target, &self.comminution, dt);
                self.restore_two_hoppers(source_id, source, target_id, target);
                result?;
                record.status.set(runtime.operating_state(), runtime.last_error());
                Ok(0.0)
            }
            PackedMachineKind::Screen { runtime, input_hopper_id, undersize_hopper_id, oversize_hopper_id } => {
                let (Some(input), Some(under), Some(over)) = (*input_hopper_id, *undersize_hopper_id, *oversize_hopper_id) else {
                    record.status.blocked("Screen requires feed, undersize, and oversize Hopper connections");
                    return Ok(0.0);
                };
                let (mut hi, mut hu, mut ho) = self.take_three_hoppers(input, under, over)?;
                let result = runtime.tick_hopper_to_hoppers(&mut hi, &mut hu, &mut ho, &self.separation, &self.thermal, dt);
                self.restore_three_hoppers(input, hi, under, hu, over, ho);
                result?;
                record.status.set(runtime.operating_state(), runtime.last_error());
                Ok(0.0)
            }
            PackedMachineKind::Splitter { runtime, input_hopper_id, output_a_hopper_id, output_b_hopper_id } => {
                let (Some(input), Some(a), Some(b)) = (*input_hopper_id, *output_a_hopper_id, *output_b_hopper_id) else {
                    record.status.blocked("Splitter requires feed, output A, and output B connections");
                    return Ok(0.0);
                };
                let (mut hi, mut ha, mut hb) = self.take_three_hoppers(input, a, b)?;
                let result = runtime.tick_hopper_to_hoppers(&mut hi, &mut ha, &mut hb, &self.thermal, dt);
                self.restore_three_hoppers(input, hi, a, ha, b, hb);
                result?;
                record.status.set(runtime.operating_state(), runtime.last_error());
                Ok(0.0)
            }
            PackedMachineKind::MagneticSeparator { runtime, input_hopper_id, concentrate_hopper_id, tailings_hopper_id } => {
                let (Some(input), Some(concentrate), Some(tailings)) = (*input_hopper_id, *concentrate_hopper_id, *tailings_hopper_id) else {
                    record.status.blocked("Magnetic Separator requires feed, concentrate, and tailings Hopper connections");
                    return Ok(0.0);
                };
                let (mut hi, mut hc, mut ht) = self.take_three_hoppers(input, concentrate, tailings)?;
                let result = runtime.tick_hopper_to_hoppers(&mut hi, &mut hc, &mut ht, &self.separation, &self.thermal, dt);
                self.restore_three_hoppers(input, hi, concentrate, hc, tailings, ht);
                result?;
                record.status.set(runtime.operating_state(), runtime.last_error());
                Ok(0.0)
            }
            PackedMachineKind::Furnace { runtime, product_target, gas_vent_id } => {
                self.execute_furnace(runtime, *product_target, *gas_vent_id, dt)?;
                record.status.set(runtime.operating_state(), runtime.last_error());
                Ok(0.0)
            }
        }
    }

    fn execute_storage_link(&mut self, link: PackedStorageLink, dt: f64) -> Result<f64, String> {
        let (mut source, mut target) = self.take_two_hoppers(link.source_hopper_id, link.target_hopper_id)?;
        let moved = transfer_between_hoppers(&mut source, &mut target, link.rate_kg_per_second, dt);
        self.restore_two_hoppers(link.source_hopper_id, source, link.target_hopper_id, target);
        moved
    }

    pub fn tick(&mut self, dt: f64) -> Result<PackedWorldTickResult, String> {
        validate_positive_finite(dt, "world simulation dt")?;
        if !self.running {
            return Ok(PackedWorldTickResult { advanced: false, ticks: 0, extracted_kg: 0.0 });
        }
        self.ensure_sealed();
        let site_order = self.site_order.clone();
        let mut world_extracted = 0.0;

        for site_id in site_order {
            let (schedule, passive_links) = {
                let site = self.sites.get(&site_id)
                    .ok_or_else(|| format!("missing runtime Site {site_id}"))?;
                (site.schedule.clone(), site.passive_storage_links.clone())
            };
            let mut site_extracted = 0.0;
            for entry in schedule {
                let mut record = self.machines.remove(&entry.node_id)
                    .ok_or_else(|| format!("missing scheduled runtime node {}", entry.node_id))?;
                if record.site_id != site_id || record.phase != entry.phase || record.ordinal != entry.ordinal {
                    self.machines.insert(entry.node_id, record);
                    return Err("runtime schedule metadata drifted from machine ownership".to_string());
                }
                let result = self.execute_machine(&mut record, dt);
                self.machines.insert(entry.node_id, record);
                site_extracted += result?;
            }
            for link in passive_links {
                self.execute_storage_link(link, dt)?;
            }
            let site = self.sites.get_mut(&site_id).unwrap();
            site.elapsed_seconds += dt;
            site.extracted_kg += site_extracted;
            world_extracted += site_extracted;
        }

        for index in 0..self.boundary_transfers.len() {
            let transfer = self.boundary_transfers[index].clone();
            let moved = self.execute_storage_link(PackedStorageLink {
                source_hopper_id: transfer.source_hopper_id,
                target_hopper_id: transfer.target_hopper_id,
                rate_kg_per_second: transfer.capacity_kg_per_second,
            }, dt)?;
            self.boundary_transfers[index].last_moved_kg = moved;
            self.boundary_transfers[index].last_rate_kg_per_second = moved / dt;
        }

        self.elapsed_seconds += dt;
        Ok(PackedWorldTickResult { advanced: true, ticks: 1, extracted_kg: world_extracted })
    }

    pub fn tick_fixed(&mut self) -> Result<PackedWorldTickResult, String> {
        self.tick(SIMULATION_STEP_SECONDS)
    }

    pub fn advance_fixed_steps(&mut self, steps: u32) -> Result<u32, String> {
        let mut advanced = 0;
        for _ in 0..steps {
            if self.tick_fixed()?.advanced {
                advanced += 1;
            }
        }
        Ok(advanced)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use interlink_core::{FractionDescriptor, PackedSolidBody, PackedSolidState};
    use interlink_extraction::{PackedExtractorConfig, PackedExtractorRuntime};
    use interlink_processes::{PackedFeederConfig, PackedFeederRuntime};
    use interlink_roasting::{PackedRoastingFurnaceConfig, PackedRoastingFurnaceRuntime};
    use interlink_thermochemistry::{PackedGoethiteReactionConfig, PackedGoethiteReactionTables};

    fn descriptor(species_id: u16) -> FractionDescriptor {
        FractionDescriptor {
            species_id,
            size_bin_id: 1,
            liberation_class_id: 1,
            texture_profile_id: 0,
        }
    }

    fn occurrence() -> PackedResourceOccurrence {
        let mut state = PackedSolidState::new();
        state.push_fraction(descriptor(1), 1.0).unwrap();
        PackedResourceOccurrence::new_unbounded(state)
    }

    fn hopper(capacity: f64) -> PackedHopperState {
        PackedHopperState::empty(capacity).unwrap()
    }

    #[test]
    fn phase_order_allows_extractor_then_feeder_to_propagate_in_same_tick() {
        let mut world = PackedWorldRuntime::new();
        world.add_site(1).unwrap();
        world.add_occurrence(1, occurrence()).unwrap();
        world.add_hopper(100, hopper(100.0)).unwrap();
        world.add_hopper(101, hopper(100.0)).unwrap();
        world.add_extractor(
            1,
            10,
            0,
            PackedExtractorRuntime::new(PackedExtractorConfig::new(5.0, true).unwrap()),
            Some(1),
            Some(100),
        ).unwrap();
        world.add_feeder(
            1,
            11,
            1,
            PackedFeederRuntime::new(PackedFeederConfig::new(2.0, 8.0, true).unwrap()),
            Some(100),
            Some(PackedSolidTarget::Hopper(101)),
        ).unwrap();

        let tick = world.tick_fixed().unwrap();
        assert!(tick.advanced);
        assert!((tick.extracted_kg - 0.5).abs() < 1e-12);
        assert!((world.hopper(100).unwrap().stored_mass_kg() - 0.3).abs() < 1e-12);
        assert!((world.hopper(101).unwrap().stored_mass_kg() - 0.2).abs() < 1e-12);
        assert!((world.site(1).unwrap().elapsed_seconds() - 0.1).abs() < 1e-12);
        assert!((world.site(1).unwrap().extracted_kg() - 0.5).abs() < 1e-12);
    }

    #[test]
    fn world_boundary_transfer_runs_after_all_site_machine_phases() {
        let mut world = PackedWorldRuntime::new();
        world.add_site(1).unwrap();
        world.add_site(2).unwrap();
        world.add_occurrence(1, occurrence()).unwrap();
        world.add_hopper(100, hopper(100.0)).unwrap();
        world.add_hopper(200, hopper(100.0)).unwrap();
        world.add_hopper(201, hopper(100.0)).unwrap();
        world.add_extractor(
            1,
            10,
            0,
            PackedExtractorRuntime::new(PackedExtractorConfig::new(5.0, true).unwrap()),
            Some(1),
            Some(100),
        ).unwrap();
        world.add_feeder(
            2,
            20,
            0,
            PackedFeederRuntime::new(PackedFeederConfig::new(5.0, 8.0, true).unwrap()),
            Some(200),
            Some(PackedSolidTarget::Hopper(201)),
        ).unwrap();
        world.add_boundary_transfer(1, 100, 200, 10.0, 0, 0).unwrap();

        world.tick_fixed().unwrap();
        assert!((world.hopper(100).unwrap().stored_mass_kg() - 0.0).abs() < 1e-12);
        assert!((world.hopper(200).unwrap().stored_mass_kg() - 0.5).abs() < 1e-12);
        assert_eq!(world.hopper(201).unwrap().stored_mass_kg(), 0.0);

        world.tick_fixed().unwrap();
        assert!((world.hopper(201).unwrap().stored_mass_kg() - 0.5).abs() < 1e-12);
    }

    #[test]
    fn pause_freezes_world_and_site_clocks_and_inventories() {
        let mut world = PackedWorldRuntime::new();
        world.add_site(1).unwrap();
        world.add_occurrence(1, occurrence()).unwrap();
        world.add_hopper(100, hopper(100.0)).unwrap();
        world.add_extractor(
            1,
            10,
            0,
            PackedExtractorRuntime::new(PackedExtractorConfig::new(5.0, true).unwrap()),
            Some(1),
            Some(100),
        ).unwrap();
        world.pause();
        let result = world.tick_fixed().unwrap();
        assert!(!result.advanced);
        assert_eq!(world.elapsed_seconds(), 0.0);
        assert_eq!(world.site(1).unwrap().elapsed_seconds(), 0.0);
        assert_eq!(world.hopper(100).unwrap().stored_mass_kg(), 0.0);
    }

    fn reaction() -> PackedGoethiteReactionTables {
        let config = PackedGoethiteReactionConfig::new(
            1, 2, 3,
            0.177702, 0.159687, 0.018015,
            90_000.0, 90_000.0, 60_000.0,
        ).unwrap();
        let mut reaction = PackedGoethiteReactionTables::new(config);
        reaction.set_size_factor(1, 1.0).unwrap();
        reaction
    }

    fn furnace() -> PackedRoastingFurnaceRuntime {
        PackedRoastingFurnaceRuntime::new(PackedRoastingFurnaceConfig::new(
            800.0, 60.0, 1200.0, 4.0, 20.0, 25.0, 4, true,
        ).unwrap())
    }

    #[test]
    fn feeder_can_stage_directly_into_furnace_before_furnace_phase() {
        let mut world = PackedWorldRuntime::new();
        world.add_site(1).unwrap();
        world.thermal_table_mut().set_specific_heat_capacity_j_per_kg_k(1, 650.0).unwrap();
        world.thermal_table_mut().set_specific_heat_capacity_j_per_kg_k(2, 650.0).unwrap();
        world.thermal_table_mut().set_specific_heat_capacity_j_per_kg_k(3, 1900.0).unwrap();
        world.set_reaction_tables(reaction());
        let mut feed = PackedSolidState::new();
        feed.push_fraction(descriptor(1), 1.0).unwrap();
        world.add_hopper(100, PackedHopperState::new(
            10.0,
            PackedSolidBody::new(feed, 0.0).unwrap(),
        ).unwrap()).unwrap();
        world.add_hopper(102, hopper(100.0)).unwrap();
        world.add_exhaust_vent(103, PackedGasBody::empty()).unwrap();
        world.add_feeder(
            1,
            10,
            0,
            PackedFeederRuntime::new(PackedFeederConfig::new(1.0, 8.0, true).unwrap()),
            Some(100),
            Some(PackedSolidTarget::Furnace(20)),
        ).unwrap();
        world.add_roasting_furnace(
            1,
            20,
            1,
            furnace(),
            Some(PackedSolidTarget::Hopper(102)),
            Some(103),
        ).unwrap();

        world.tick_fixed().unwrap();
        assert!((world.hopper(100).unwrap().stored_mass_kg() - 0.9).abs() < 1e-12);
        let diagnostics = world.furnace_diagnostics(20).unwrap();
        assert!(diagnostics.last_feed_rate_kg_per_second > 0.0);
        assert_eq!(world.node_status(10).unwrap().operating_state(), PackedOperatingState::Running);
    }

    #[test]
    fn passive_storage_links_run_after_site_apparatus() {
        let mut world = PackedWorldRuntime::new();
        world.add_site(1).unwrap();
        let mut state = PackedSolidState::new();
        state.push_fraction(descriptor(1), 1.0).unwrap();
        world.add_hopper(100, PackedHopperState::new(10.0, PackedSolidBody::new(state, 100.0).unwrap()).unwrap()).unwrap();
        world.add_hopper(101, hopper(10.0)).unwrap();
        world.add_site_passive_storage_link(1, 100, 101, DEFAULT_PASSIVE_STORAGE_TRANSFER_KG_PER_SECOND).unwrap();
        world.tick_fixed().unwrap();
        assert_eq!(world.hopper(100).unwrap().stored_mass_kg(), 0.0);
        assert_eq!(world.hopper(101).unwrap().stored_mass_kg(), 1.0);
        assert!((world.hopper(101).unwrap().body().sensible_enthalpy_j() - 100.0).abs() < 1e-12);
    }
}
