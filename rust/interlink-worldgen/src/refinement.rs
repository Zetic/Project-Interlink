use crate::{expected_sample_count, GeodesicTopology, WorldgenError};
use std::cmp::Ordering;
use std::collections::BinaryHeap;

pub const MULTIRES_STAGE_ID: &str = "foundation:multires-inheritance";
pub const MULTIRES_STAGE_VERSION: u32 = 1;
const FNV_OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;
const DISTANCE_EPSILON: f64 = 1.0e-15;

#[derive(Clone, Debug, PartialEq)]
pub struct RefinementMetrics {
    pub coarse_level: u8,
    pub fine_level: u8,
    pub coarse_sample_count: u32,
    pub fine_sample_count: u32,
    pub added_sample_count: u32,
    pub provenance_hash: u64,
}

impl RefinementMetrics {
    pub fn provenance_hash_hex(&self) -> String {
        format!("{:016x}", self.provenance_hash)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct RefinementMap {
    pub metrics: RefinementMetrics,
    pub nearest_coarse_source: Vec<u32>,
    pub inherited_sample_mask: Vec<u8>,
}

#[derive(Clone, Copy, Debug)]
struct QueueEntry {
    distance: f64,
    source: u32,
    sample: u32,
}

impl PartialEq for QueueEntry {
    fn eq(&self, other: &Self) -> bool {
        self.distance.to_bits() == other.distance.to_bits()
            && self.source == other.source
            && self.sample == other.sample
    }
}
impl Eq for QueueEntry {}
impl PartialOrd for QueueEntry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for QueueEntry {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .distance
            .total_cmp(&self.distance)
            .then_with(|| other.source.cmp(&self.source))
            .then_with(|| other.sample.cmp(&self.sample))
    }
}

fn fnv_update(mut hash: u64, bytes: &[u8]) -> u64 {
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

fn validate_levels(
    fine_topology: &GeodesicTopology,
    coarse_level: u8,
) -> Result<u32, WorldgenError> {
    if coarse_level > fine_topology.level() {
        return Err(WorldgenError::InvalidRefinement(
            "coarse level cannot exceed fine topology level",
        ));
    }
    let coarse_count = expected_sample_count(coarse_level).ok_or(
        WorldgenError::InvalidRefinement("coarse topology level is unsupported"),
    )?;
    if coarse_count > fine_topology.metrics().sample_count {
        return Err(WorldgenError::InvalidRefinement(
            "coarse sample count exceeds fine topology",
        ));
    }
    for sample in 0..coarse_count as usize {
        if fine_topology.birth_levels()[sample] > coarse_level {
            return Err(WorldgenError::InvalidRefinement(
                "stable inherited sample prefix is not preserved",
            ));
        }
    }
    Ok(coarse_count)
}

pub fn build_refinement_map(
    fine_topology: &GeodesicTopology,
    coarse_level: u8,
) -> Result<RefinementMap, WorldgenError> {
    let coarse_count = validate_levels(fine_topology, coarse_level)?;
    let fine_count = fine_topology.metrics().sample_count;
    let mut distances = vec![f64::INFINITY; fine_count as usize];
    let mut sources = vec![u32::MAX; fine_count as usize];
    let mut queue = BinaryHeap::new();

    for source in 0..coarse_count {
        distances[source as usize] = 0.0;
        sources[source as usize] = source;
        queue.push(QueueEntry {
            distance: 0.0,
            source,
            sample: source,
        });
    }

    while let Some(entry) = queue.pop() {
        let index = entry.sample as usize;
        let known_distance = distances[index];
        let known_source = sources[index];
        if entry.distance > known_distance + DISTANCE_EPSILON
            || ((entry.distance - known_distance).abs() <= DISTANCE_EPSILON
                && entry.source != known_source)
        {
            continue;
        }
        let neighbors = fine_topology.neighbors_of(entry.sample);
        let lengths = fine_topology.neighbor_arc_lengths_of(entry.sample);
        for (neighbor, length) in neighbors.iter().zip(lengths.iter()) {
            let candidate_distance = entry.distance + *length;
            let neighbor_index = *neighbor as usize;
            let improves_distance =
                candidate_distance + DISTANCE_EPSILON < distances[neighbor_index];
            let ties_with_better_source = (candidate_distance - distances[neighbor_index]).abs()
                <= DISTANCE_EPSILON
                && entry.source < sources[neighbor_index];
            if improves_distance || ties_with_better_source {
                distances[neighbor_index] = candidate_distance;
                sources[neighbor_index] = entry.source;
                queue.push(QueueEntry {
                    distance: candidate_distance,
                    source: entry.source,
                    sample: *neighbor,
                });
            }
        }
    }

    if sources.iter().any(|source| *source == u32::MAX) {
        return Err(WorldgenError::InvalidRefinement(
            "refinement provenance does not cover the fine topology",
        ));
    }

    let inherited_sample_mask = (0..fine_count)
        .map(|sample| u8::from(sample < coarse_count))
        .collect::<Vec<_>>();
    let mut hash = FNV_OFFSET_BASIS;
    hash = fnv_update(hash, &[coarse_level, fine_topology.level()]);
    hash = fnv_update(hash, &coarse_count.to_le_bytes());
    hash = fnv_update(hash, &fine_count.to_le_bytes());
    for source in &sources {
        hash = fnv_update(hash, &source.to_le_bytes());
    }

    Ok(RefinementMap {
        metrics: RefinementMetrics {
            coarse_level,
            fine_level: fine_topology.level(),
            coarse_sample_count: coarse_count,
            fine_sample_count: fine_count,
            added_sample_count: fine_count - coarse_count,
            provenance_hash: hash,
        },
        nearest_coarse_source: sources,
        inherited_sample_mask,
    })
}

fn validate_scalar_len<T>(
    fine_topology: &GeodesicTopology,
    coarse_level: u8,
    coarse_values: &[T],
) -> Result<u32, WorldgenError> {
    let coarse_count = validate_levels(fine_topology, coarse_level)?;
    if coarse_values.len() != coarse_count as usize {
        return Err(WorldgenError::InvalidRefinement(
            "coarse field length does not match coarse topology",
        ));
    }
    Ok(coarse_count)
}

pub fn refine_scalar_f32(
    fine_topology: &GeodesicTopology,
    coarse_level: u8,
    coarse_values: &[f32],
) -> Result<Vec<f32>, WorldgenError> {
    let coarse_count = validate_scalar_len(fine_topology, coarse_level, coarse_values)?;
    if coarse_values.iter().any(|value| !value.is_finite()) {
        return Err(WorldgenError::InvalidRefinement(
            "coarse scalar field contains non-finite values",
        ));
    }
    let mut output = vec![0.0_f32; fine_topology.metrics().sample_count as usize];
    output[..coarse_count as usize].copy_from_slice(coarse_values);
    for sample in coarse_count as usize..output.len() {
        let [a, b] = fine_topology.parent_edges()[sample];
        if a == u32::MAX || b == u32::MAX || a as usize >= sample || b as usize >= sample {
            return Err(WorldgenError::InvalidRefinement(
                "fine sample has invalid hierarchical parents",
            ));
        }
        output[sample] = (output[a as usize] + output[b as usize]) * 0.5;
    }
    Ok(output)
}

pub fn refine_scalar_f64(
    fine_topology: &GeodesicTopology,
    coarse_level: u8,
    coarse_values: &[f64],
) -> Result<Vec<f64>, WorldgenError> {
    let coarse_count = validate_scalar_len(fine_topology, coarse_level, coarse_values)?;
    if coarse_values.iter().any(|value| !value.is_finite()) {
        return Err(WorldgenError::InvalidRefinement(
            "coarse scalar field contains non-finite values",
        ));
    }
    let mut output = vec![0.0_f64; fine_topology.metrics().sample_count as usize];
    output[..coarse_count as usize].copy_from_slice(coarse_values);
    for sample in coarse_count as usize..output.len() {
        let [a, b] = fine_topology.parent_edges()[sample];
        if a == u32::MAX || b == u32::MAX || a as usize >= sample || b as usize >= sample {
            return Err(WorldgenError::InvalidRefinement(
                "fine sample has invalid hierarchical parents",
            ));
        }
        output[sample] = (output[a as usize] + output[b as usize]) * 0.5;
    }
    Ok(output)
}

pub fn refine_vector3_f64(
    fine_topology: &GeodesicTopology,
    coarse_level: u8,
    coarse_values: &[[f64; 3]],
) -> Result<Vec<[f64; 3]>, WorldgenError> {
    let coarse_count = validate_scalar_len(fine_topology, coarse_level, coarse_values)?;
    if coarse_values
        .iter()
        .flatten()
        .any(|value| !value.is_finite())
    {
        return Err(WorldgenError::InvalidRefinement(
            "coarse vector field contains non-finite values",
        ));
    }
    let mut output = vec![[0.0_f64; 3]; fine_topology.metrics().sample_count as usize];
    output[..coarse_count as usize].copy_from_slice(coarse_values);
    for sample in coarse_count as usize..output.len() {
        let [a, b] = fine_topology.parent_edges()[sample];
        if a == u32::MAX || b == u32::MAX || a as usize >= sample || b as usize >= sample {
            return Err(WorldgenError::InvalidRefinement(
                "fine sample has invalid hierarchical parents",
            ));
        }
        for component in 0..3 {
            output[sample][component] =
                (output[a as usize][component] + output[b as usize][component]) * 0.5;
        }
    }
    Ok(output)
}

pub fn refine_categorical_u16(
    map: &RefinementMap,
    coarse_values: &[u16],
) -> Result<Vec<u16>, WorldgenError> {
    if coarse_values.len() != map.metrics.coarse_sample_count as usize {
        return Err(WorldgenError::InvalidRefinement(
            "coarse categorical field length does not match refinement map",
        ));
    }
    Ok(map
        .nearest_coarse_source
        .iter()
        .map(|source| coarse_values[*source as usize])
        .collect())
}

pub fn refine_categorical_u8(
    map: &RefinementMap,
    coarse_values: &[u8],
) -> Result<Vec<u8>, WorldgenError> {
    if coarse_values.len() != map.metrics.coarse_sample_count as usize {
        return Err(WorldgenError::InvalidRefinement(
            "coarse categorical field length does not match refinement map",
        ));
    }
    Ok(map
        .nearest_coarse_source
        .iter()
        .map(|source| coarse_values[*source as usize])
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::build_icosphere;

    #[test]
    fn scalar_refinement_preserves_every_coarse_sample_exactly() {
        let fine = build_icosphere(5).unwrap();
        let coarse_count = expected_sample_count(3).unwrap() as usize;
        let coarse = (0..coarse_count)
            .map(|sample| sample as f64 * 0.125 - 7.0)
            .collect::<Vec<_>>();
        let refined = refine_scalar_f64(&fine, 3, &coarse).unwrap();
        assert_eq!(&refined[..coarse_count], coarse.as_slice());
        assert_eq!(refined.len(), expected_sample_count(5).unwrap() as usize);
    }

    #[test]
    fn direct_and_staged_scalar_refinement_are_identical() {
        let level4 = build_icosphere(4).unwrap();
        let level6 = build_icosphere(6).unwrap();
        let coarse_count = expected_sample_count(3).unwrap() as usize;
        let coarse = (0..coarse_count)
            .map(|sample| ((sample * 17) % 101) as f32 / 100.0)
            .collect::<Vec<_>>();
        let level4_values = refine_scalar_f32(&level4, 3, &coarse).unwrap();
        let staged = refine_scalar_f32(&level6, 4, &level4_values).unwrap();
        let direct = refine_scalar_f32(&level6, 3, &coarse).unwrap();
        assert_eq!(direct, staged);
    }

    #[test]
    fn categorical_refinement_is_deterministic_complete_and_preserves_coarse_truth() {
        let fine = build_icosphere(5).unwrap();
        let coarse_count = expected_sample_count(3).unwrap() as usize;
        let coarse = (0..coarse_count)
            .map(|sample| (sample % 13) as u16)
            .collect::<Vec<_>>();
        let a = build_refinement_map(&fine, 3).unwrap();
        let b = build_refinement_map(&fine, 3).unwrap();
        assert_eq!(a, b);
        let refined = refine_categorical_u16(&a, &coarse).unwrap();
        assert_eq!(&refined[..coarse_count], coarse.as_slice());
        assert!(a
            .nearest_coarse_source
            .iter()
            .all(|source| (*source as usize) < coarse_count));
        assert_eq!(
            a.inherited_sample_mask
                .iter()
                .map(|value| u32::from(*value))
                .sum::<u32>(),
            coarse_count as u32
        );
    }

    #[test]
    fn backwards_refinement_is_rejected() {
        let level3 = build_icosphere(3).unwrap();
        assert!(build_refinement_map(&level3, 4).is_err());
    }
}
