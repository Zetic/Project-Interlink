use std::collections::HashSet;

use super::*;

impl PackedWorldRuntime {
    /// Begin an edit-time topology transaction. Physical owners remain in place;
    /// only graph/scheduling edges are rebuilt. Worker command serialization
    /// guarantees no fixed step can observe the intermediate topology.
    pub fn begin_live_reconfigure(&mut self) {
        for site in self.sites.values_mut() {
            site.passive_storage_links.clear();
        }
        self.boundary_transfers.clear();
        self.sealed = false;
    }

    fn upsert_machine_live(
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
        if self.hoppers.contains_key(&node_id) || self.vents.contains_key(&node_id) {
            return Err(format!("runtime node {node_id} is owned by persistent storage"));
        }
        self.machines.insert(
            node_id,
            PackedMachineRecord {
                site_id,
                phase,
                ordinal,
                status: PackedNodeStatus::new(initial_state),
                kind,
            },
        );
        self.sealed = false;
        Ok(())
    }

    pub fn upsert_extractor_live(
        &mut self,
        site_id: RuntimeSiteId,
        node_id: RuntimeNodeId,
        ordinal: u32,
        runtime: PackedExtractorRuntime,
        occurrence_id: Option<RuntimeOccurrenceId>,
        output_hopper_id: Option<RuntimeNodeId>,
    ) -> Result<(), String> {
        let state = runtime.operating_state();
        self.upsert_machine_live(
            site_id,
            node_id,
            PHASE_EXTRACTOR,
            ordinal,
            state,
            PackedMachineKind::Extractor {
                runtime,
                occurrence_id,
                output_hopper_id,
            },
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_merger_live(
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
        self.upsert_machine_live(
            site_id,
            node_id,
            PHASE_MERGER,
            ordinal,
            state,
            PackedMachineKind::Merger {
                runtime,
                input_a_hopper_id,
                input_b_hopper_id,
                output_hopper_id,
            },
        )
    }

    pub fn upsert_feeder_live(
        &mut self,
        site_id: RuntimeSiteId,
        node_id: RuntimeNodeId,
        ordinal: u32,
        runtime: PackedFeederRuntime,
        input_hopper_id: Option<RuntimeNodeId>,
        output_target: Option<PackedSolidTarget>,
    ) -> Result<(), String> {
        let state = runtime.operating_state();
        self.upsert_machine_live(
            site_id,
            node_id,
            PHASE_FEEDER,
            ordinal,
            state,
            PackedMachineKind::Feeder {
                runtime,
                input_hopper_id,
                output_target,
            },
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_comminution_live(
        &mut self,
        site_id: RuntimeSiteId,
        node_id: RuntimeNodeId,
        phase: i32,
        ordinal: u32,
        runtime: PackedComminutionRuntime,
        input_hopper_id: Option<RuntimeNodeId>,
        output_hopper_id: Option<RuntimeNodeId>,
    ) -> Result<(), String> {
        if ![
            PHASE_LEGACY_CRUSHER,
            PHASE_JAW_CRUSHER,
            PHASE_CONE_CRUSHER,
            PHASE_BALL_MILL,
        ]
        .contains(&phase)
        {
            return Err(format!("invalid comminution scheduler phase {phase}"));
        }
        let state = runtime.operating_state();
        self.upsert_machine_live(
            site_id,
            node_id,
            phase,
            ordinal,
            state,
            PackedMachineKind::Comminution {
                runtime,
                input_hopper_id,
                output_hopper_id,
            },
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_screen_live(
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
        self.upsert_machine_live(
            site_id,
            node_id,
            PHASE_SCREEN,
            ordinal,
            state,
            PackedMachineKind::Screen {
                runtime,
                input_hopper_id,
                undersize_hopper_id,
                oversize_hopper_id,
            },
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_splitter_live(
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
        self.upsert_machine_live(
            site_id,
            node_id,
            PHASE_SPLITTER,
            ordinal,
            state,
            PackedMachineKind::Splitter {
                runtime,
                input_hopper_id,
                output_a_hopper_id,
                output_b_hopper_id,
            },
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_magnetic_separator_live(
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
        self.upsert_machine_live(
            site_id,
            node_id,
            PHASE_MAGNETIC_SEPARATOR,
            ordinal,
            state,
            PackedMachineKind::MagneticSeparator {
                runtime,
                input_hopper_id,
                concentrate_hopper_id,
                tailings_hopper_id,
            },
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_roasting_furnace_live(
        &mut self,
        site_id: RuntimeSiteId,
        node_id: RuntimeNodeId,
        ordinal: u32,
        mut runtime: PackedRoastingFurnaceRuntime,
        product_target: Option<PackedSolidTarget>,
        gas_vent_id: Option<RuntimeNodeId>,
        preserve_retained_state: bool,
    ) -> Result<(), String> {
        if preserve_retained_state {
            if let Some(record) = self.machines.get(&node_id) {
                if let PackedMachineKind::Furnace { runtime: previous, .. } = &record.kind {
                    runtime.import_retained_state(
                        previous.zones().to_vec(),
                        previous.pending_feed().clone(),
                        previous.gas_inventory().clone(),
                    )?;
                }
            }
        }
        let state = runtime.operating_state();
        self.upsert_machine_live(
            site_id,
            node_id,
            PHASE_ROASTING_FURNACE,
            ordinal,
            state,
            PackedMachineKind::Furnace {
                runtime,
                product_target,
                gas_vent_id,
            },
        )
    }

    /// Remove machines no longer present, rebuild every Site schedule from the
    /// freshly upserted records, then atomically publish the new execution plan.
    pub fn finish_live_reconfigure(
        &mut self,
        active_machine_ids: &[RuntimeNodeId],
    ) -> Result<(), String> {
        let active: HashSet<RuntimeNodeId> = active_machine_ids.iter().copied().collect();
        self.machines.retain(|node_id, _| active.contains(node_id));
        for site in self.sites.values_mut() {
            site.schedule.clear();
        }
        let schedule_entries: Vec<(RuntimeSiteId, ScheduleEntry)> = self
            .machines
            .iter()
            .map(|(node_id, record)| {
                (
                    record.site_id,
                    ScheduleEntry {
                        node_id: *node_id,
                        phase: record.phase,
                        ordinal: record.ordinal,
                    },
                )
            })
            .collect();
        for (site_id, entry) in schedule_entries {
            let site = self
                .sites
                .get_mut(&site_id)
                .ok_or_else(|| format!("runtime machine references missing Site {site_id}"))?;
            site.schedule.push(entry);
        }
        self.seal();
        Ok(())
    }

    pub fn has_site_live(&self, site_id: RuntimeSiteId) -> bool {
        self.sites.contains_key(&site_id)
    }

    pub fn has_hopper_live(&self, node_id: RuntimeNodeId) -> bool {
        self.hoppers.contains_key(&node_id)
    }

    pub fn has_exhaust_vent_live(&self, node_id: RuntimeNodeId) -> bool {
        self.vents.contains_key(&node_id)
    }

    pub fn replace_hopper_live(
        &mut self,
        node_id: RuntimeNodeId,
        hopper: PackedHopperState,
    ) -> Result<(), String> {
        if self.machines.contains_key(&node_id) || self.vents.contains_key(&node_id) {
            return Err(format!("runtime node {node_id} is not Hopper storage"));
        }
        self.hoppers.insert(node_id, hopper);
        self.sealed = false;
        Ok(())
    }

    pub fn remove_hopper_if_empty_live(&mut self, node_id: RuntimeNodeId) -> Result<(), String> {
        let Some(hopper) = self.hoppers.get(&node_id) else {
            return Ok(());
        };
        if hopper.stored_mass_kg() > SOLID_MATERIAL_TOLERANCE {
            return Err(format!(
                "cannot remove runtime Hopper {node_id} while it contains material"
            ));
        }
        self.hoppers.remove(&node_id);
        self.sealed = false;
        Ok(())
    }

    pub fn replace_exhaust_vent_live(
        &mut self,
        node_id: RuntimeNodeId,
        body: PackedGasBody,
    ) -> Result<(), String> {
        if self.machines.contains_key(&node_id) || self.hoppers.contains_key(&node_id) {
            return Err(format!("runtime node {node_id} is not an exhaust vent"));
        }
        self.vents.insert(node_id, body);
        self.sealed = false;
        Ok(())
    }

    pub fn remove_exhaust_vent_live(&mut self, node_id: RuntimeNodeId) {
        self.vents.remove(&node_id);
        self.sealed = false;
    }

    /// Runtime UI projection needs both input and output rates. These remain
    /// scalar queries; material populations stay inside Rust unless a future
    /// explicit Inspector-detail request asks for them.
    pub fn node_input_mass_flow_kg_per_second(
        &self,
        node_id: RuntimeNodeId,
        input_index: usize,
    ) -> Option<f64> {
        let record = self.machines.get(&node_id)?;
        match &record.kind {
            PackedMachineKind::Extractor { .. } => None,
            PackedMachineKind::Merger { runtime, .. } => match input_index {
                0 => Some(runtime.input_a_stream().total_mass_flow_kg_per_second()),
                1 => Some(runtime.input_b_stream().total_mass_flow_kg_per_second()),
                _ => None,
            },
            PackedMachineKind::Feeder { runtime, .. } => (input_index == 0)
                .then(|| runtime.input_stream().total_mass_flow_kg_per_second()),
            PackedMachineKind::Comminution { runtime, .. } => (input_index == 0)
                .then(|| runtime.input_stream().total_mass_flow_kg_per_second()),
            PackedMachineKind::Screen { runtime, .. } => (input_index == 0)
                .then(|| runtime.input_stream().total_mass_flow_kg_per_second()),
            PackedMachineKind::Splitter { runtime, .. } => (input_index == 0)
                .then(|| runtime.input_stream().total_mass_flow_kg_per_second()),
            PackedMachineKind::MagneticSeparator { runtime, .. } => (input_index == 0)
                .then(|| runtime.input_stream().total_mass_flow_kg_per_second()),
            PackedMachineKind::Furnace { runtime, .. } => (input_index == 0)
                .then(|| runtime.diagnostics().last_feed_rate_kg_per_second),
        }
    }

    pub fn furnace_charge_mass_kg(&self, node_id: RuntimeNodeId) -> Option<f64> {
        let record = self.machines.get(&node_id)?;
        match &record.kind {
            PackedMachineKind::Furnace { runtime, .. } => Some(runtime.charge_mass_kg()),
            _ => None,
        }
    }

    pub fn furnace_pending_feed_mass_kg(&self, node_id: RuntimeNodeId) -> Option<f64> {
        let record = self.machines.get(&node_id)?;
        match &record.kind {
            PackedMachineKind::Furnace { runtime, .. } => Some(runtime.pending_feed_mass_kg()),
            _ => None,
        }
    }
}