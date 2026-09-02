#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PlanetPhysicalParameters {
    pub radius_m: f64,
    pub surface_gravity_m_s2: f64,
    pub rotation_period_s: f64,
    pub axial_tilt_rad: f64,
    pub orbital_period_s: f64,
    pub stellar_flux_w_m2: f64,
    pub reference_surface_pressure_pa: f64,
}

impl PlanetPhysicalParameters {
    /// Earth-like reference values used by diagnostics until physical planet
    /// parameter generation is introduced in a later WG stage.
    pub const fn earthlike_reference() -> Self {
        Self {
            radius_m: 6_371_000.0,
            surface_gravity_m_s2: 9.80665,
            rotation_period_s: 86_164.0905,
            axial_tilt_rad: 0.409_092_804_222_328_97,
            orbital_period_s: 31_558_149.763_545_6,
            stellar_flux_w_m2: 1_361.0,
            reference_surface_pressure_pa: 101_325.0,
        }
    }

    pub fn validate(&self) -> Result<(), &'static str> {
        if !self.radius_m.is_finite() || self.radius_m <= 0.0 {
            return Err("planet radius must be finite and positive");
        }
        if !self.surface_gravity_m_s2.is_finite() || self.surface_gravity_m_s2 <= 0.0 {
            return Err("surface gravity must be finite and positive");
        }
        if !self.rotation_period_s.is_finite() || self.rotation_period_s <= 0.0 {
            return Err("rotation period must be finite and positive");
        }
        if !self.axial_tilt_rad.is_finite() {
            return Err("axial tilt must be finite");
        }
        if !self.orbital_period_s.is_finite() || self.orbital_period_s <= 0.0 {
            return Err("orbital period must be finite and positive");
        }
        if !self.stellar_flux_w_m2.is_finite() || self.stellar_flux_w_m2 <= 0.0 {
            return Err("stellar flux must be finite and positive");
        }
        if !self.reference_surface_pressure_pa.is_finite() || self.reference_surface_pressure_pa < 0.0 {
            return Err("reference surface pressure must be finite and non-negative");
        }
        Ok(())
    }
}

impl Default for PlanetPhysicalParameters {
    fn default() -> Self {
        Self::earthlike_reference()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn earthlike_reference_is_physically_valid() {
        PlanetPhysicalParameters::earthlike_reference().validate().unwrap();
    }
}
