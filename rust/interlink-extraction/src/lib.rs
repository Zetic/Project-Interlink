use interlink_core::{
    FractionDescriptor, PackedHopperState, PackedSolidState, SOLID_MATERIAL_TOLERANCE,
};
use interlink_processes::{
    PackedOperatingState, PackedSolidStream, APPARATUS_TRANSFER_TOLERANCE_KG,
};

const OCCURRENCE_TEMPLATE_TOLERANCE: f64 = 1e-8;

fn validate_finite(value: f64, label: &str) -> Result<(), String> {
    if !value.is_finite() {
        return Err(format!("{label} must be finite"));
    }
    Ok(())
}

fn validate_positive_finite(value: f64, label: &str) -> Result<(), String> {
    validate_finite(value, label)?;
    if value <= 0.0 {
        return Err(format!("{label} must be finite and positive"));
    }
    Ok(())
}

/// Packed execution representation of one extractable solid ResourceOccurrence.
///
/// `material_per_kg` is a normalized one-kilogram material template compiled
/// from canonical occurrence composition/texture/fragmentation. Current worlds
/// do not define a measured reserve, so `remaining_mass_kg == None` preserves
/// production's effectively unbounded source behavior. A finite reserve is
/// supported for future world models without changing today's save schema.
#[derive(Debug, Clone)]
pub struct PackedResourceOccurrence {
    material_per_kg: PackedSolidState,
    remaining_mass_kg: Option<f64>,
    extracted_mass_kg: f64,
}

impl Default for PackedResourceOccurrence {
    fn default() -> Self {
        Self::new_unbounded(PackedSolidState::new())
    }
}

impl PackedResourceOccurrence {
    pub fn new_unbounded(material_per_kg: PackedSolidState) -> Self {
        Self {
            material_per_kg,
            remaining_mass_kg: None,
            extracted_mass_kg: 0.0,
        }
    }

    pub fn new_finite(
        material_per_kg: PackedSolidState,
        remaining_mass_kg: f64,
    ) -> Result<Self, String> {
        validate_positive_finite(remaining_mass_kg, "ResourceOccurrence reserve mass")?;
        Ok(Self {
            material_per_kg,
            remaining_mass_kg: Some(remaining_mass_kg),
            extracted_mass_kg: 0.0,
        })
    }

    /// Incremental setup helper for WASM/compiler initialization. Runtime code
    /// must not mutate the occurrence material template after extraction begins.
    pub fn push_material_fraction(
        &mut self,
        descriptor: FractionDescriptor,
        quantity_per_kg: f64,
    ) -> Result<(), String> {
        if self.extracted_mass_kg > APPARATUS_TRANSFER_TOLERANCE_KG {
            return Err(
                "ResourceOccurrence material template cannot change after extraction begins"
                    .to_string(),
            );
        }
        self.material_per_kg
            .push_fraction(descriptor, quantity_per_kg)
    }

    pub fn set_finite_reserve_mass_kg(&mut self, value: f64) -> Result<(), String> {
        validate_positive_finite(value, "ResourceOccurrence reserve mass")?;
        if self.extracted_mass_kg > APPARATUS_TRANSFER_TOLERANCE_KG {
            return Err("ResourceOccurrence reserve cannot be reset after extraction begins".to_string());
        }
        self.remaining_mass_kg = Some(value);
        Ok(())
    }

    pub fn material_per_kg(&self) -> &PackedSolidState {
        &self.material_per_kg
    }

    pub fn remaining_mass_kg(&self) -> Option<f64> {
        self.remaining_mass_kg
    }

    pub fn extracted_mass_kg(&self) -> f64 {
        self.extracted_mass_kg
    }

    pub fn is_finite(&self) -> bool {
        self.remaining_mass_kg.is_some()
    }

    pub fn is_depleted(&self) -> bool {
        matches!(self.remaining_mass_kg, Some(value) if value <= APPARATUS_TRANSFER_TOLERANCE_KG)
    }

    fn validate_template(&self) -> Result<(), String> {
        let total = self.material_per_kg.total_quantity();
        if total <= SOLID_MATERIAL_TOLERANCE {
            return Err("ResourceOccurrence material template must not be empty".to_string());
        }
        if (total - 1.0).abs() > OCCURRENCE_TEMPLATE_TOLERANCE {
            return Err(format!(
                "ResourceOccurrence material template must total 1 kg, got {total} kg"
            ));
        }
        Ok(())
    }

    fn available_mass_kg(&self) -> f64 {
        self.remaining_mass_kg.unwrap_or(f64::INFINITY)
    }

    fn record_extraction(&mut self, extracted_mass_kg: f64) -> Result<(), String> {
        if !extracted_mass_kg.is_finite() || extracted_mass_kg < 0.0 {
            return Err("extracted occurrence mass must be finite and non-negative".to_string());
        }
        if extracted_mass_kg <= APPARATUS_TRANSFER_TOLERANCE_KG {
            return Ok(());
        }
        if let Some(remaining) = self.remaining_mass_kg {
            if extracted_mass_kg > remaining + APPARATUS_TRANSFER_TOLERANCE_KG {
                return Err("extraction cannot exceed the remaining occurrence reserve".to_string());
            }
            self.remaining_mass_kg = Some((remaining - extracted_mass_kg).max(0.0));
        }
        self.extracted_mass_kg += extracted_mass_kg;
        validate_finite(self.extracted_mass_kg, "cumulative extracted occurrence mass")
    }
}

#[derive(Debug, Clone, Copy)]
pub struct PackedExtractorConfig {
    pub rate_kg_per_second: f64,
    pub enabled: bool,
}

impl PackedExtractorConfig {
    pub fn new(rate_kg_per_second: f64, enabled: bool) -> Result<Self, String> {
        validate_positive_finite(rate_kg_per_second, "Extractor rate")?;
        Ok(Self {
            rate_kg_per_second,
            enabled,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PackedExtractorTickResult {
    pub operating_state: PackedOperatingState,
    pub extracted_mass_kg: f64,
    pub actual_rate_kg_per_second: f64,
}

/// Packed equivalent of the current Feature ResourceOccurrence -> Extractor ->
/// Hopper path. Eligibility/ownership of the source Feature remains a graph/world
/// compiler concern; once a supported solid occurrence is compiled, Rust owns
/// material generation, output throttling, reserve accounting, and stream state.
#[derive(Debug, Clone)]
pub struct PackedExtractorRuntime {
    config: PackedExtractorConfig,
    output_stream: PackedSolidStream,
    operating_state: PackedOperatingState,
    last_error: Option<String>,
}

impl PackedExtractorRuntime {
    pub fn new(config: PackedExtractorConfig) -> Self {
        Self {
            operating_state: if config.enabled {
                PackedOperatingState::Idle
            } else {
                PackedOperatingState::Off
            },
            config,
            output_stream: PackedSolidStream::new(),
            last_error: None,
        }
    }

    pub fn config(&self) -> PackedExtractorConfig {
        self.config
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.config.enabled = enabled;
        if !enabled {
            self.operating_state = PackedOperatingState::Off;
        } else if self.operating_state == PackedOperatingState::Off {
            self.operating_state = PackedOperatingState::Idle;
        }
    }

    pub fn set_rate_kg_per_second(&mut self, value: f64) -> Result<(), String> {
        validate_positive_finite(value, "Extractor rate")?;
        self.config.rate_kg_per_second = value;
        Ok(())
    }

    pub fn output_stream(&self) -> &PackedSolidStream {
        &self.output_stream
    }

    pub fn operating_state(&self) -> PackedOperatingState {
        self.operating_state
    }

    pub fn last_error(&self) -> Option<&str> {
        self.last_error.as_deref()
    }

    fn finish(
        &mut self,
        state: PackedOperatingState,
        extracted_mass_kg: f64,
        dt: f64,
    ) -> PackedExtractorTickResult {
        self.operating_state = state;
        PackedExtractorTickResult {
            operating_state: state,
            extracted_mass_kg,
            actual_rate_kg_per_second: if extracted_mass_kg <= APPARATUS_TRANSFER_TOLERANCE_KG {
                0.0
            } else {
                extracted_mass_kg / dt
            },
        }
    }

    pub fn tick_occurrence_to_hopper(
        &mut self,
        occurrence: &mut PackedResourceOccurrence,
        target: &mut PackedHopperState,
        dt: f64,
    ) -> Result<PackedExtractorTickResult, String> {
        validate_positive_finite(dt, "Extractor simulation dt")?;
        self.output_stream.clear();
        self.last_error = None;

        if !self.config.enabled {
            return Ok(self.finish(PackedOperatingState::Off, 0.0, dt));
        }

        occurrence.validate_template()?;
        if occurrence.is_depleted() {
            self.last_error = Some("ResourceOccurrence is depleted".to_string());
            return Ok(self.finish(PackedOperatingState::Blocked, 0.0, dt));
        }

        let free_capacity_kg = target.free_capacity_kg();
        if free_capacity_kg <= APPARATUS_TRANSFER_TOLERANCE_KG {
            self.last_error = Some("Extractor output storage is full".to_string());
            return Ok(self.finish(PackedOperatingState::Blocked, 0.0, dt));
        }

        let requested_mass_kg = self.config.rate_kg_per_second * dt;
        let planned_mass_kg = requested_mass_kg
            .min(free_capacity_kg)
            .min(occurrence.available_mass_kg());
        if planned_mass_kg <= APPARATUS_TRANSFER_TOLERANCE_KG {
            self.last_error = Some(if occurrence.is_depleted() {
                "ResourceOccurrence is depleted".to_string()
            } else {
                "Extractor output storage is full".to_string()
            });
            return Ok(self.finish(PackedOperatingState::Blocked, 0.0, dt));
        }

        let planned_rate = planned_mass_kg / dt;
        let output_flow = occurrence.material_per_kg().scaled(planned_rate)?;
        let expected_mass_kg = output_flow.total_quantity() * dt;

        let mut staged_occurrence = occurrence.clone();
        let mut staged_target = target.clone();
        let accepted_mass_kg = staged_target.receive_flow(&output_flow, dt, 0.0)?;
        let tolerance = APPARATUS_TRANSFER_TOLERANCE_KG * expected_mass_kg.max(1.0);
        if (accepted_mass_kg - expected_mass_kg).abs() > tolerance {
            return Err("Extractor output could not commit its planned material atomically".to_string());
        }
        staged_occurrence.record_extraction(accepted_mass_kg)?;

        *occurrence = staged_occurrence;
        *target = staged_target;
        self.output_stream.set_flow(&output_flow, 0.0)?;
        self.last_error = None;
        Ok(self.finish(PackedOperatingState::Running, accepted_mass_kg, dt))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn descriptor(species_id: u16, size_bin_id: u8) -> FractionDescriptor {
        FractionDescriptor {
            species_id,
            size_bin_id,
            liberation_class_id: 1,
            texture_profile_id: 0,
        }
    }

    fn basalt_occurrence() -> PackedResourceOccurrence {
        let mut state = PackedSolidState::new();
        state.push_fraction(descriptor(1, 10), 0.55).unwrap();
        state.push_fraction(descriptor(2, 10), 0.30).unwrap();
        state.push_fraction(descriptor(3, 10), 0.15).unwrap();
        PackedResourceOccurrence::new_unbounded(state)
    }

    #[test]
    fn unbounded_occurrence_matches_current_five_kg_per_second_extraction() {
        let mut occurrence = basalt_occurrence();
        let mut hopper = PackedHopperState::empty(100.0).unwrap();
        let mut extractor = PackedExtractorRuntime::new(
            PackedExtractorConfig::new(5.0, true).unwrap(),
        );
        let result = extractor
            .tick_occurrence_to_hopper(&mut occurrence, &mut hopper, 0.1)
            .unwrap();

        assert_eq!(result.operating_state, PackedOperatingState::Running);
        assert!((result.extracted_mass_kg - 0.5).abs() < 1e-12);
        assert!((hopper.stored_mass_kg() - 0.5).abs() < 1e-12);
        assert!((occurrence.extracted_mass_kg() - 0.5).abs() < 1e-12);
        assert_eq!(occurrence.remaining_mass_kg(), None);
        assert!((extractor.output_stream().total_mass_flow_kg_per_second() - 5.0).abs() < 1e-12);
        let columns = hopper.body().solid_state().to_columns();
        assert!((columns.quantities[0] - 0.275).abs() < 1e-12);
        assert!((columns.quantities[1] - 0.15).abs() < 1e-12);
        assert!((columns.quantities[2] - 0.075).abs() < 1e-12);
    }

    #[test]
    fn output_capacity_throttles_extraction_without_losing_material() {
        let mut occurrence = basalt_occurrence();
        let mut hopper = PackedHopperState::empty(0.2).unwrap();
        let mut extractor = PackedExtractorRuntime::new(
            PackedExtractorConfig::new(5.0, true).unwrap(),
        );
        let result = extractor
            .tick_occurrence_to_hopper(&mut occurrence, &mut hopper, 0.1)
            .unwrap();

        assert!((result.extracted_mass_kg - 0.2).abs() < 1e-12);
        assert!((hopper.stored_mass_kg() - 0.2).abs() < 1e-12);
        assert!((occurrence.extracted_mass_kg() - 0.2).abs() < 1e-12);
        assert!((extractor.output_stream().total_mass_flow_kg_per_second() - 2.0).abs() < 1e-12);
    }

    #[test]
    fn finite_occurrence_depletes_exactly_when_a_future_world_supplies_a_reserve() {
        let template = basalt_occurrence().material_per_kg().clone();
        let mut occurrence = PackedResourceOccurrence::new_finite(template, 0.75).unwrap();
        let mut hopper = PackedHopperState::empty(100.0).unwrap();
        let mut extractor = PackedExtractorRuntime::new(
            PackedExtractorConfig::new(5.0, true).unwrap(),
        );

        let first = extractor
            .tick_occurrence_to_hopper(&mut occurrence, &mut hopper, 0.1)
            .unwrap();
        let second = extractor
            .tick_occurrence_to_hopper(&mut occurrence, &mut hopper, 0.1)
            .unwrap();
        let third = extractor
            .tick_occurrence_to_hopper(&mut occurrence, &mut hopper, 0.1)
            .unwrap();

        assert!((first.extracted_mass_kg - 0.5).abs() < 1e-12);
        assert!((second.extracted_mass_kg - 0.25).abs() < 1e-12);
        assert_eq!(second.operating_state, PackedOperatingState::Running);
        assert_eq!(third.operating_state, PackedOperatingState::Blocked);
        assert_eq!(extractor.last_error(), Some("ResourceOccurrence is depleted"));
        assert_eq!(occurrence.remaining_mass_kg(), Some(0.0));
        assert!((occurrence.extracted_mass_kg() - 0.75).abs() < 1e-12);
        assert!((hopper.stored_mass_kg() - 0.75).abs() < 1e-12);
    }

    #[test]
    fn invalid_non_unit_occurrence_template_is_rejected_before_mutation() {
        let mut template = PackedSolidState::new();
        template.push_fraction(descriptor(1, 10), 0.5).unwrap();
        let mut occurrence = PackedResourceOccurrence::new_unbounded(template);
        let mut hopper = PackedHopperState::empty(100.0).unwrap();
        let before = hopper.stored_mass_kg();
        let mut extractor = PackedExtractorRuntime::new(
            PackedExtractorConfig::new(5.0, true).unwrap(),
        );
        let error = extractor
            .tick_occurrence_to_hopper(&mut occurrence, &mut hopper, 0.1)
            .unwrap_err();
        assert!(error.contains("must total 1 kg"));
        assert_eq!(hopper.stored_mass_kg(), before);
        assert_eq!(occurrence.extracted_mass_kg(), 0.0);
    }
}
