// ============================================================
// Particle Physics Simulation
// ============================================================
//
// Canvas-based particle system where particles attract, form clusters,
// build internal pressure through an implosion lifecycle (critical →
// terminal → collapse → explosion), and emit glowing halos. Clusters
// exert gravity on surrounding particles, creating orbital fly-by
// effects. Stagnant clusters are dissolved and redistributed.
//
// Physics runs at display refresh rate (~60fps). All distances scale
// with viewport size via a reference dimension of 1080px.


// ============================================================
// Constants — Simulation Parameters
// ============================================================

const PARTICLE_COUNT = 60;
const REFERENCE_SIZE = 1080;

// -- Pairwise Forces --

// Particle-particle attraction (linear with distance)
const ATTRACT_STRENGTH = 0.00003;

// Close-range repulsion (inverse-square)
const REPEL_STRENGTH = 0.3;

// Minimum squared distance for repulsion (prevents singularity)
const MIN_REPEL_DIST_SQ = 4;

// Free-particle velocity decay per frame
const DAMPING = 0.9995;

// -- Cluster Detection --

// Minimum particles for a cluster to become critical
const CLUSTER_THRESHOLD = Math.ceil(PARTICLE_COUNT * 0.15);

// Exit threshold multiplier to prevent oscillation at boundary
const CRITICAL_HYSTERESIS = 0.85;

// Expanded connection radius multiplier for critical cluster cores
const CRITICAL_CAPTURE_MULT = 1.4;

// -- Implosion Lifecycle --

// Base inward force toward centroid
const IMPLODE_STRENGTH = 0.025;

// Random angular deviation of implode force (radians at full progress)
const IMPLODE_JITTER = 0.4;

// Minimum force scale for unintegrated particles (allows gravity-assist flyby)
const IMPLODE_FORCE_FLOOR = 0.15;

// Pressure progress at which terminal phase begins
const TERMINAL_THRESHOLD = 0.5;

// Max implode force multiplier during terminal/collapse
const TERMINAL_IMPLODE_MULT = 4;

// Containment radius multiplier for terminal particles
const TERMINAL_RADIUS_MULT = 1.5;

// Minimum containment radius as fraction of CONNECTION_DISTANCE at full collapse
const TERMINAL_MIN_RADIUS = 0.1;

// Hysteresis multiplier for exiting terminal state (exits at 1.2x enter radius)
const TERMINAL_EXIT_HYSTERESIS = 1.2;

// Pressure progress at which collapse phase begins
const COLLAPSE_THRESHOLD = 0.92;

// -- Pressure --

// Frames of pressure accumulation before explosion
const PRESSURE_BUILDUP = 600;

// Pressure lost per frame when below critical threshold
const PRESSURE_DECAY = 3;

// Newly captured particles start at this fraction of cluster min pressure
const CAPTURE_PRESSURE_RATIO = 0.5;

// -- Explosion --

// Frames of post-explosion immunity from clustering
const EXPLOSION_COOLDOWN = 150;

// Velocity decay per frame during explosion
const EXPLOSION_DRAG = 0.997;

// Frames of immunity after leaving a cluster
const ESCAPE_COOLDOWN = 30;

// Base explosion speed multiplier (particles get 0.8–1.4x EXPLODE_SPEED)
const EXPLODE_SPEED_BASE = 0.8;
const EXPLODE_SPEED_VARIANCE = 0.6;

// -- Glow System --

// Glow increase per frame when eligible (0→1 in 50 frames)
const GLOW_RAMP_UP = 0.02;

// Glow decrease per frame when losing neighbors
const GLOW_RAMP_DOWN = 0.05;

// Frames before glow can restart after losing it
const GLOW_REGAIN_DELAY = 30;

// Explosion afterglow fade rate per frame
const GLOW_FADE_SPEED = 0.02;

// Minimum cluster neighbors within CONNECTION_DISTANCE for glow eligibility
const GLOW_MIN_NEIGHBORS = 2;

// -- Inter-Cluster Gravity --

const CLUSTER_GRAVITY_STRENGTH = 0.003;

// -- Stagnation Detection --

// Frames without critical clusters before dissolving one
const STAGNATION_TIMEOUT = 240;

// Minimum cluster size eligible for dissolution
const STAGNATION_MIN_SIZE = 4;

// Frames for each phase of fade-out and fade-in during dissolution
const FADE_DURATION = 120;

// -- Puff Effect (radial expansion on particle capture) --

// Target expansion ratio for a single capture (~1.3x radius)
const PUFF_BASE_EXPANSION = 0.3;

// Minimum glow for a particle to receive puff force
const PUFF_GLOW_GATE = 0.3;

// -- Bulk Velocity --

// Exponential smoothing rate for bulk velocity between frames
const BULK_BLEND_RATE = 0.05;

// Minimum weight for unglowed particles in bulk velocity averaging
const MIN_BULK_WEIGHT = 0.01;

// Bulk velocity damping per frame
const BULK_VELOCITY_DAMP = 0.998;

// Minimum drift speed as fraction of PARTICLE_SPEED
const MIN_DRIFT_RATIO = 0.5;

// -- In-Cluster Damping --

// Base relative velocity retention per frame
const CLUSTER_DAMP_BASE = 0.995;

// Additional damping scaled by critical progress (slows oscillation in mature clusters)
const CLUSTER_DAMP_PROGRESS_SCALE = 0.015;

// Additional damping scaled by distance from centroid
const CLUSTER_DAMP_EDGE_SCALE = 0.03;

// -- Free Particle Speed Clamp --

// Max speed multiplier for recently-escaped particles (decays with criticalProgress)
const FREE_SPEED_CLAMP_MULT = 4;

// Decay rate for criticalProgress on sub-critical particles
const CRITICAL_PROGRESS_DECAY_RATE = 0.02;


// ============================================================
// Constants — Rendering
// ============================================================

// Particle dot opacity
const PARTICLE_OPACITY = 0.4;

// Edge connection alpha scaling
const EDGE_ALPHA_SCALE = 0.5;

// Minimum alpha to bother rendering
const EDGE_ALPHA_MIN = 0.003;

// Edge halo (soft glow behind connection lines) width and alpha
const EDGE_HALO_WIDTH = 6;
const EDGE_HALO_ALPHA_SCALE = 0.15;

// Rate at which inGlow (continuous 0–1 flag for glow envelope membership) ramps
const IN_GLOW_RAMP = 0.05;

// Minimum glow for visual effects (PCA inclusion, outlier rendering, inGlow)
const GLOW_VIS_MIN = 0.1;

// Minimum glow weight before treating as zero in PCA
const GLOW_WEIGHT_EPSILON = 0.001;

// Base cluster glow opacity (multiplied by avgGlow)
const BASE_GLOW_OPACITY = 0.4;

// How much avgGlow shrinks the glow radius (higher = tighter glow)
const GLOW_RADIUS_CONTRACTION = 0.5;

// PCA-derived ellipse scaling: base + range * axis_ratio
const PCA_SCALE_BASE = 0.6;
const PCA_SCALE_RANGE = 0.8;

// Cluster opacity flicker parameters (three-frequency sine composite)
const FLICKER_RAMP_MIN = 0.3;
const FLICKER_FREQ_1 = 0.05;
const FLICKER_FREQ_2 = 0.13;
const FLICKER_FREQ_3 = 0.031;
const FLICKER_WEIGHT_1 = 0.6;
const FLICKER_WEIGHT_2 = 0.3;
const FLICKER_WEIGHT_3 = 0.1;
// Must stay below BASE_GLOW_OPACITY to prevent negative cluster opacity
const FLICKER_INTENSITY = 0.15;

// Outlier glow radius as multiple of REPEL_DISTANCE
const OUTLIER_RADIUS_MULT = 1.5;

// Explosion afterglow fade-in duration (frames)
const GLOW_FADE_IN_FRAMES = 5;

// Primary glow color
const GLOW_COLOR = "189, 0, 189";


// ============================================================
// Viewport-Scaled Constants (recomputed on resize)
// ============================================================

let scale = 1;
let CONNECTION_DISTANCE, PARTICLE_SPEED, PARTICLE_RADIUS, MAX_SPEED;
let REPEL_DISTANCE, EXPLODE_SPEED, CLUSTER_ATTRACT_RANGE;


// ============================================================
// Mutable State
// ============================================================

const canvas = document.getElementById("particles");
const ctx = canvas.getContext("2d");

let particles = [];
let glows = [];
let w, h;
let lastInteractionFrame = 0;
let frameCount = 0;

// Hoisted typed arrays (reused per frame to avoid allocation churn)
const _visited = new Uint8Array(PARTICLE_COUNT);
const _clusterIndex = new Int8Array(PARTICLE_COUNT);
const _wasImploding = new Uint8Array(PARTICLE_COUNT);

// Precomputed color strings for hot-path rendering
const GLOW_COLOR_TRANSPARENT = `rgba(${GLOW_COLOR}, 0)`;
const PARTICLE_FILL_FULL = `rgba(${GLOW_COLOR}, ${PARTICLE_OPACITY})`;


// ============================================================
// Initialization
// ============================================================

/**
 * Recompute all viewport-scaled constants from current window size.
 */
function updateScale() {
    scale = Math.min(window.innerWidth, window.innerHeight) / REFERENCE_SIZE;
    CONNECTION_DISTANCE = 120 * scale;
    PARTICLE_SPEED = 0.6 * scale;
    PARTICLE_RADIUS = 2.5 * scale;
    MAX_SPEED = 1.2 * scale;
    REPEL_DISTANCE = 80 * scale;
    EXPLODE_SPEED = 6 * scale;
    CLUSTER_ATTRACT_RANGE = 700 * scale;
}

/**
 * Resize canvas to fill viewport and recompute scale.
 */
function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    updateScale();
}

/**
 * Create the initial particle array with random positions and velocities.
 * All fields initialized upfront for V8 hidden class stability.
 */
function createParticles() {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * PARTICLE_SPEED,
            vy: (Math.random() - 0.5) * PARTICLE_SPEED,
            pressure: 0,
            exploding: false,
            imploding: false,
            terminal: false,
            cooldown: 0,
            glow: 0,
            glowCooldown: 0,
            criticalProgress: 0,
            implodeCx: 0,
            implodeCy: 0,
            implodeVx: 0,
            implodeVy: 0,
            inGlow: 0,
            opacity: 1,
            fadeFrame: -1,
        });
    }
}


// ============================================================
// Cluster Detection
// ============================================================

/**
 * Find all connected clusters via flood-fill.
 *
 * Core particles in critical clusters use an expanded connection radius
 * (CRITICAL_CAPTURE_MULT) to pull in nearby particles. Non-core particles
 * (captured at extended range) use the normal radius, preventing unbounded
 * cluster growth at edges.
 *
 * @returns {number[][]} Array of clusters, each an array of particle indices.
 */
function findClusters() {
    _visited.fill(0);
    const clusters = [];
    const connDistSqNormal = CONNECTION_DISTANCE * CONNECTION_DISTANCE;
    const connDistSqCapture = connDistSqNormal * CRITICAL_CAPTURE_MULT * CRITICAL_CAPTURE_MULT;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        if (_visited[i] || particles[i].cooldown > 0 || particles[i].opacity < 1) continue;

        const cluster = [i];
        const stackIdx = [i];
        const stackCore = [1];
        _visited[i] = 1;

        while (stackIdx.length > 0) {
            const idx = stackIdx.pop();
            const isCore = stackCore.pop();
            const p = particles[idx];
            const isCritical = cluster.length >= CLUSTER_THRESHOLD;
            const threshold = (isCritical && isCore) ? connDistSqCapture : connDistSqNormal;

            for (let j = 0; j < PARTICLE_COUNT; j++) {
                if (_visited[j] || particles[j].cooldown > 0 || particles[j].opacity < 1) continue;
                const q = particles[j];
                const dx = p.x - q.x;
                const dy = p.y - q.y;
                const dSq = dx * dx + dy * dy;
                if (dSq < threshold) {
                    _visited[j] = 1;
                    cluster.push(j);
                    stackIdx.push(j);
                    stackCore.push(dSq < connDistSqNormal ? 1 : 0);
                }
            }
        }

        clusters.push(cluster);
    }

    return clusters;
}

/**
 * Compute the centroid (mean position) of a cluster.
 */
function clusterCentroid(cluster) {
    let cx = 0, cy = 0;
    for (const idx of cluster) {
        cx += particles[idx].x;
        cy += particles[idx].y;
    }
    return { x: cx / cluster.length, y: cy / cluster.length };
}


// ============================================================
// Cluster Physics — Implosion
// ============================================================

/**
 * Compute the implosion phase state for a cluster.
 *
 * The lifecycle progresses through three phases based on pressure:
 *   1. Critical (progress 0–0.5): gentle inward pull
 *   2. Terminal (0.5–0.92): stronger pull, particles contained
 *   3. Collapse (0.92–1.0): rapid contraction toward singularity
 *
 * Force strength scales with progress², phase multiplier, and cluster
 * size ratio (larger clusters pull harder).
 *
 * @returns {{ progress, terminal, strength }}
 */
function computeImplodeState(cluster) {
    let minPressure = Infinity;
    for (const idx of cluster) {
        if (particles[idx].pressure < minPressure) minPressure = particles[idx].pressure;
    }
    const progress = minPressure / PRESSURE_BUILDUP;
    const terminal = progress >= TERMINAL_THRESHOLD;
    const terminalProgress = terminal
        ? (progress - TERMINAL_THRESHOLD) / (1 - TERMINAL_THRESHOLD)
        : 0;
    const sizeRatio = cluster.length / CLUSTER_THRESHOLD;

    const collapsing = progress >= COLLAPSE_THRESHOLD;
    const collapseRamp = collapsing
        ? Math.pow((progress - COLLAPSE_THRESHOLD) / (1 - COLLAPSE_THRESHOLD), 2)
        : 0;

    const phaseMult = 1
        + terminalProgress * terminalProgress * (TERMINAL_IMPLODE_MULT - 1)
        + collapseRamp * TERMINAL_IMPLODE_MULT;

    const strength = IMPLODE_STRENGTH * progress * progress * phaseMult * sizeRatio;

    return { progress, terminal, strength };
}

/**
 * Compute the cluster's bulk velocity using glow-weighted averaging
 * with exponential smoothing from the previous frame.
 *
 * Glow weighting ensures recently captured (low-glow) particles
 * don't jerk the cluster direction. Blend smoothing prevents abrupt
 * changes when cluster composition shifts between frames.
 *
 * @returns {{ vx, vy }}
 */
function computeBulkVelocity(cluster) {
    let avgVx = 0, avgVy = 0, bulkWeight = 0;

    for (const idx of cluster) {
        const bw = Math.max(particles[idx].glow, MIN_BULK_WEIGHT);
        avgVx += particles[idx].vx * bw;
        avgVy += particles[idx].vy * bw;
        bulkWeight += bw;
    }
    avgVx /= bulkWeight;
    avgVy /= bulkWeight;

    // Glow-weighted average of stored bulk velocities from imploding particles
    let prevVx = 0, prevVy = 0, prevWeight = 0;
    for (const idx of cluster) {
        if (particles[idx].imploding) {
            const gw = Math.max(particles[idx].glow, MIN_BULK_WEIGHT);
            prevVx += particles[idx].implodeVx * gw;
            prevVy += particles[idx].implodeVy * gw;
            prevWeight += gw;
        }
    }
    if (prevWeight > 0) {
        prevVx /= prevWeight;
        prevVy /= prevWeight;
    } else {
        prevVx = avgVx;
        prevVy = avgVy;
    }

    return {
        vx: prevVx + (avgVx - prevVx) * BULK_BLEND_RATE,
        vy: prevVy + (avgVy - prevVy) * BULK_BLEND_RATE,
    };
}

/**
 * Count particles whose glow just started ramping this frame.
 * These are freshly captured particles that trigger the puff effect.
 */
function countJustCaptured(cluster) {
    let count = 0;
    for (const idx of cluster) {
        if (particles[idx].glow > 0 && particles[idx].glow <= GLOW_RAMP_UP) count++;
    }
    return count;
}

/**
 * Apply implode forces to each particle, pulling toward the centroid
 * with angular jitter for organic motion.
 *
 * Force is scaled by each particle's glow (integration time) via
 * IMPLODE_FORCE_FLOOR, so freshly captured edge particles feel less
 * pull — enabling gravity-assist flyby behavior.
 *
 * When new particles are captured (justCapturedCount > 0), integrated
 * core particles receive a one-frame radial velocity kick outward,
 * creating a visible "puff" expansion that the implode force then
 * contracts back. Kick magnitude is calibrated against IMPLODE_STRENGTH
 * to produce ~1.3x radius expansion for a single capture.
 */
function applyImplodeForces(cluster, centroid, state, bulkVel, glowRadius, justCapturedCount) {
    const { progress, terminal, strength } = state;

    for (const idx of cluster) {
        const p = particles[idx];
        const dx = centroid.x - p.x;
        const dy = centroid.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        p.imploding = true;
        p.criticalProgress = progress;

        // Terminal flag with hysteresis to prevent flicker at boundary
        if (terminal && dist < glowRadius) {
            p.terminal = true;
        } else if (!terminal || dist > glowRadius * TERMINAL_EXIT_HYSTERESIS) {
            p.terminal = false;
        }

        // Store centroid and bulk velocity for damping and containment
        p.implodeCx = centroid.x;
        p.implodeCy = centroid.y;
        p.implodeVx = bulkVel.vx;
        p.implodeVy = bulkVel.vy;

        // Jitter the force direction for amorphous cluster shapes
        const jitterAngle = (Math.random() - 0.5) * IMPLODE_JITTER * progress;
        const nx = dx / dist;
        const ny = dy / dist;
        const cosJ = Math.cos(jitterAngle);
        const sinJ = Math.sin(jitterAngle);
        const jnx = nx * cosJ - ny * sinJ;
        const jny = nx * sinJ + ny * cosJ;

        const forceScale = IMPLODE_FORCE_FLOOR + (1 - IMPLODE_FORCE_FLOOR) * p.glow;
        p.vx += jnx * strength * dist * forceScale;
        p.vy += jny * strength * dist * forceScale;

        // Puff: one-frame radial kick calibrated so implode naturally reverses it
        if (justCapturedCount > 0 && dist > 1 && dist < glowRadius && p.glow > PUFF_GLOW_GATE) {
            const expansionTarget = PUFF_BASE_EXPANSION * Math.sqrt(justCapturedCount);
            const kickSpeed = dist * Math.sqrt(2 * strength * forceScale * expansionTarget);
            p.vx -= (dx / dist) * kickSpeed;
            p.vy -= (dy / dist) * kickSpeed;
        }
    }
}

/**
 * Correct particle velocities to maintain the cluster's target bulk velocity.
 *
 * After implode forces are applied, particles may have drifted from the
 * desired bulk motion. This pass computes the correction needed and applies
 * it weighted by each particle's glow (integration time), so edge particles
 * aren't yanked into lock-step.
 *
 * Bulk speed is capped inversely proportional to cluster size (larger
 * clusters move slower) and floored at MIN_DRIFT_RATIO to prevent stalling.
 */
function applyBulkCorrection(cluster, bulkVel) {
    let newAvgVx = 0, newAvgVy = 0;
    for (const idx of cluster) {
        newAvgVx += particles[idx].vx;
        newAvgVy += particles[idx].vy;
    }
    newAvgVx /= cluster.length;
    newAvgVy /= cluster.length;

    let dampedVx = bulkVel.vx * BULK_VELOCITY_DAMP;
    let dampedVy = bulkVel.vy * BULK_VELOCITY_DAMP;
    let bulkSpeed = Math.sqrt(dampedVx * dampedVx + dampedVy * dampedVy);

    const maxBulkSpeed = MAX_SPEED * (CLUSTER_THRESHOLD / Math.max(cluster.length, CLUSTER_THRESHOLD));
    if (bulkSpeed > maxBulkSpeed && bulkSpeed > 0) {
        dampedVx = (dampedVx / bulkSpeed) * maxBulkSpeed;
        dampedVy = (dampedVy / bulkSpeed) * maxBulkSpeed;
        bulkSpeed = maxBulkSpeed;
    }

    const minDrift = PARTICLE_SPEED * MIN_DRIFT_RATIO;
    if (bulkSpeed < minDrift && bulkSpeed > 0) {
        dampedVx = (dampedVx / bulkSpeed) * minDrift;
        dampedVy = (dampedVy / bulkSpeed) * minDrift;
    }

    const corrVx = dampedVx - newAvgVx;
    const corrVy = dampedVy - newAvgVy;
    for (const idx of cluster) {
        const integration = particles[idx].glow;
        particles[idx].vx += corrVx * integration;
        particles[idx].vy += corrVy * integration;
    }
}

/**
 * Orchestrate the full implosion pass for a critical cluster.
 */
function implodeCluster(cluster, glowRadius) {
    const centroid = clusterCentroid(cluster);
    const state = computeImplodeState(cluster);
    const bulkVel = computeBulkVelocity(cluster);
    const justCapturedCount = countJustCaptured(cluster);

    applyImplodeForces(cluster, centroid, state, bulkVel, glowRadius, justCapturedCount);
    applyBulkCorrection(cluster, bulkVel);
}


// ============================================================
// Cluster Physics — Explosion
// ============================================================

/**
 * Explode a cluster: scatter particles radially with randomized
 * angles and speeds. Each particle gets a cooldown preventing
 * immediate reclustering.
 */
function explodeCluster(cluster) {
    for (let i = 0; i < cluster.length; i++) {
        const p = particles[cluster[i]];
        const angle = Math.random() * Math.PI * 2;
        const speed = EXPLODE_SPEED * (EXPLODE_SPEED_BASE + Math.random() * EXPLODE_SPEED_VARIANCE);
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.exploding = true;
        p.imploding = false;
        p.cooldown = EXPLOSION_COOLDOWN;
    }
}


// ============================================================
// Cluster Physics — Inter-Cluster Gravity
// ============================================================

/**
 * Apply gravitational attraction from terminal clusters to all particles.
 *
 * Force uses quadratic proximity falloff and includes inertial resistance:
 * larger receivers resist deflection (srcSize / totalMass), and force is
 * divided among receiver cluster members so clusters aren't yanked as a
 * rigid body.
 */
function applyClusterGravity(terminalClusters) {
    // Build lookup: particle index → which terminal cluster it belongs to
    _clusterIndex.fill(-1);
    const clusterSizes = [];
    for (let t = 0; t < terminalClusters.length; t++) {
        clusterSizes.push(terminalClusters[t].cluster.length);
        for (const idx of terminalClusters[t].cluster) {
            _clusterIndex[idx] = t;
        }
    }

    const attractRangeSq = CLUSTER_ATTRACT_RANGE * CLUSTER_ATTRACT_RANGE;

    for (let t = 0; t < terminalClusters.length; t++) {
        const tc = terminalClusters[t].centroid;
        const mass = terminalClusters[t].coreMass;
        const srcSize = terminalClusters[t].cluster.length;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            if (_clusterIndex[i] === t || particles[i].exploding || particles[i].cooldown > 0) continue;
            if (particles[i].opacity < 1) continue;

            const p = particles[i];
            const dx = tc.x - p.x;
            const dy = tc.y - p.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > attractRangeSq || distSq < 1) continue;

            const dist = Math.sqrt(distSq);
            const proximity = 1 - dist / CLUSTER_ATTRACT_RANGE;
            const receiverSize = _clusterIndex[i] >= 0 ? clusterSizes[_clusterIndex[i]] : 1;
            const totalMass = srcSize + receiverSize;
            const inertia = srcSize / totalMass;

            let force = CLUSTER_GRAVITY_STRENGTH * proximity * proximity * mass * inertia;
            force /= receiverSize;

            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
        }
    }
}


// ============================================================
// Rendering — Glow PCA
// ============================================================

/**
 * Compute glow-weighted PCA for a cluster to determine its asymmetric
 * glow shape. Returns rotation angle and axis scale factors for an
 * elliptical gradient that follows the cluster's spatial distribution.
 *
 * Particles with higher glow contribute more to the shape, so the
 * ellipse tracks the integrated core rather than outlier stragglers.
 *
 * @returns {{ angle, scaleX, scaleY }}
 */
function computeGlowPCA(cluster, centroid) {
    let sxx = 0, syy = 0, sxy = 0, glowWeight = 0;

    for (const idx of cluster) {
        const dx = particles[idx].x - centroid.x;
        const dy = particles[idx].y - centroid.y;
        const gw = particles[idx].glow * particles[idx].glow;
        sxx += dx * dx * gw;
        syy += dy * dy * gw;
        sxy += dx * dy * gw;
        glowWeight += gw;
    }

    const divisor = glowWeight > GLOW_WEIGHT_EPSILON ? glowWeight : 1;
    sxx /= divisor;
    syy /= divisor;
    sxy /= divisor;

    const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const spread = Math.sqrt(sxx + syy) || 1;
    const majorScale = Math.sqrt(Math.max(sxx, syy)) / spread;
    const minorScale = Math.sqrt(Math.min(sxx, syy)) / spread;

    return {
        angle,
        scaleX: PCA_SCALE_BASE + majorScale * PCA_SCALE_RANGE,
        scaleY: PCA_SCALE_BASE + minorScale * PCA_SCALE_RANGE,
    };
}

/**
 * Mark particles within the glow radius as "in glow" for edge halo
 * suppression. The inGlow field ramps continuously (0–1) to prevent
 * visual popping when particles enter/exit the glow envelope.
 */
function updateInGlowState(cluster, centroid, glowRadius) {
    for (const idx of cluster) {
        const dx = particles[idx].x - centroid.x;
        const dy = particles[idx].y - centroid.y;
        if (Math.sqrt(dx * dx + dy * dy) <= glowRadius) {
            const glowWeight = Math.min(particles[idx].glow / GLOW_VIS_MIN, 1);
            particles[idx].inGlow = Math.min(particles[idx].inGlow + IN_GLOW_RAMP * glowWeight, 1);
        }
    }
}


// ============================================================
// Rendering — Cluster Glows
// ============================================================

/**
 * Render a PCA-transformed radial gradient glow centered on a cluster.
 */
function renderClusterGlow(centroid, radius, opacity, pca) {
    ctx.save();
    ctx.translate(centroid.x, centroid.y);
    ctx.rotate(pca.angle);
    ctx.scale(pca.scaleX, pca.scaleY);

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, `rgba(${GLOW_COLOR}, ${opacity})`);
    gradient.addColorStop(1, GLOW_COLOR_TRANSPARENT);

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
}

/**
 * Render individual glow halos for particles outside the main cluster
 * glow radius but still integrated (glow > GLOW_VIS_MIN). Creates a
 * trailing-tentacle effect as outlier particles maintain their glow
 * while being pulled inward.
 */
function renderOutlierGlows(cluster, centroid, glowRadius, clusterOpacity) {
    const outlierGlowRadius = REPEL_DISTANCE * OUTLIER_RADIUS_MULT;
    const innerFade = outlierGlowRadius * 0.3;

    for (const idx of cluster) {
        const p = particles[idx];
        const dx = p.x - centroid.x;
        const dy = p.y - centroid.y;
        const distFromCenter = Math.sqrt(dx * dx + dy * dy);

        if (distFromCenter <= glowRadius || p.glow < GLOW_VIS_MIN) continue;

        const outlierFactor = 1 - Math.min((distFromCenter - glowRadius) / CONNECTION_DISTANCE, 1);
        const outlierOpacity = clusterOpacity * outlierFactor * p.glow * p.glow;

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, outlierGlowRadius);
        gradient.addColorStop(0, `rgba(${GLOW_COLOR}, ${outlierOpacity * 0.5})`);
        gradient.addColorStop(innerFade / outlierGlowRadius, `rgba(${GLOW_COLOR}, ${outlierOpacity * 0.3})`);
        gradient.addColorStop(0.7, `rgba(${GLOW_COLOR}, ${outlierOpacity * 0.1})`);
        gradient.addColorStop(1, GLOW_COLOR_TRANSPARENT);

        ctx.beginPath();
        ctx.arc(p.x, p.y, outlierGlowRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
    }
}

/**
 * Render and decay explosion afterglow effects.
 * Each glow fades in over GLOW_FADE_IN_FRAMES then decays at GLOW_FADE_SPEED.
 */
function renderExplosionGlows() {
    for (let g = glows.length - 1; g >= 0; g--) {
        const glow = glows[g];
        glow.age++;

        const fadeIn = Math.min(glow.age / GLOW_FADE_IN_FRAMES, 1);
        const visibleOpacity = glow.opacity * fadeIn;

        const gradient = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, CONNECTION_DISTANCE);
        gradient.addColorStop(0, `rgba(${GLOW_COLOR}, ${visibleOpacity})`);
        gradient.addColorStop(1, GLOW_COLOR_TRANSPARENT);

        ctx.beginPath();
        ctx.arc(glow.x, glow.y, CONNECTION_DISTANCE, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        glow.opacity -= GLOW_FADE_SPEED;
        if (glow.opacity <= 0) {
            glows.splice(g, 1);
        }
    }
}


// ============================================================
// Cluster Processing
// ============================================================

/**
 * Update pressure and glow state for particles in a critical cluster.
 *
 * Pressure: newly captured particles (below cluster minimum) get boosted
 * to CAPTURE_PRESSURE_RATIO of the cluster's minimum, reducing integration
 * time. All particles increment pressure by 1 per frame.
 *
 * Glow: eligibility requires GLOW_MIN_NEIGHBORS within CONNECTION_DISTANCE.
 * After losing glow, a cooldown (GLOW_REGAIN_DELAY) prevents flicker from
 * momentary neighbor loss.
 */
function updateCriticalClusterState(cluster) {
    // Boost pressure for newly captured particles
    let clusterMinPressure = Infinity;
    for (const idx of cluster) {
        if (particles[idx].pressure > 0 && particles[idx].pressure < clusterMinPressure) {
            clusterMinPressure = particles[idx].pressure;
        }
    }
    if (clusterMinPressure === Infinity) clusterMinPressure = 0;

    const captureFloor = Math.floor(clusterMinPressure * CAPTURE_PRESSURE_RATIO);
    for (const idx of cluster) {
        if (particles[idx].pressure < captureFloor) {
            particles[idx].pressure = captureFloor;
        }
    }

    // Increment pressure and update glow eligibility
    const connDistSqGlow = CONNECTION_DISTANCE * CONNECTION_DISTANCE;
    for (const idx of cluster) {
        particles[idx].pressure++;

        let neighborCount = 0;
        for (const jdx of cluster) {
            if (idx === jdx) continue;
            const dx = particles[idx].x - particles[jdx].x;
            const dy = particles[idx].y - particles[jdx].y;
            if (dx * dx + dy * dy <= connDistSqGlow) {
                neighborCount++;
                if (neighborCount >= GLOW_MIN_NEIGHBORS) break;
            }
        }

        if (neighborCount >= GLOW_MIN_NEIGHBORS) {
            if (particles[idx].glowCooldown > 0) {
                particles[idx].glowCooldown--;
            } else {
                particles[idx].glow = Math.min(particles[idx].glow + GLOW_RAMP_UP, 1);
            }
        } else {
            particles[idx].glow = Math.max(0, particles[idx].glow - GLOW_RAMP_DOWN);
            if (particles[idx].glow > 0) {
                particles[idx].glowCooldown = GLOW_REGAIN_DELAY;
            }
        }
    }
}

/**
 * Compute aggregate pressure and glow stats for a cluster.
 * @returns {{ minPressure, avgGlow }}
 */
function computeClusterStats(cluster) {
    let minPressure = Infinity, totalGlow = 0;
    for (const idx of cluster) {
        if (particles[idx].pressure < minPressure) minPressure = particles[idx].pressure;
        totalGlow += particles[idx].glow;
    }
    return { minPressure, avgGlow: totalGlow / cluster.length };
}

/**
 * Compute the fraction of cluster particles within the glow radius.
 * Used as the mass term for inter-cluster gravity calculations.
 */
function computeCoreMass(cluster, centroid, glowRadius) {
    const coreDistSq = glowRadius * glowRadius;
    let coreCount = 0;

    for (const idx of cluster) {
        const dx = particles[idx].x - centroid.x;
        const dy = particles[idx].y - centroid.y;
        if (dx * dx + dy * dy <= coreDistSq) coreCount++;
    }

    return Math.min(coreCount / CLUSTER_THRESHOLD, 1);
}

/**
 * Compute the visual flicker for a cluster based on three-frequency
 * sine composite modulated by pressure. The flicker ramps in with
 * avgGlow to prevent popping on fresh clusters.
 */
function computeFlicker(minPressure, avgGlow) {
    const flickerRamp = Math.pow(Math.max(0, (avgGlow - FLICKER_RAMP_MIN) / (1 - FLICKER_RAMP_MIN)), 2);
    return flickerRamp
        * (Math.sin(minPressure * FLICKER_FREQ_1) * FLICKER_WEIGHT_1
            + Math.sin(minPressure * FLICKER_FREQ_2) * FLICKER_WEIGHT_2
            + Math.sin(minPressure * FLICKER_FREQ_3) * FLICKER_WEIGHT_3)
        * FLICKER_INTENSITY * avgGlow;
}

/**
 * Process a critical cluster: update state, check for explosion,
 * apply implosion physics, and render glows.
 *
 * @returns {object|null} Terminal cluster record for gravity, or null if exploded.
 */
function processCriticalCluster(cluster) {
    updateCriticalClusterState(cluster);
    const { minPressure, avgGlow } = computeClusterStats(cluster);
    const centroid = clusterCentroid(cluster);

    // Explosion: pressure has reached the buildup threshold
    if (minPressure >= PRESSURE_BUILDUP) {
        lastInteractionFrame = frameCount;
        explodeCluster(cluster);
        glows.push({ x: centroid.x, y: centroid.y, opacity: avgGlow * BASE_GLOW_OPACITY, age: 0 });

        for (const idx of cluster) {
            particles[idx].pressure = 0;
            particles[idx].glow = 0;
            particles[idx].terminal = false;
        }
        return null;
    }

    // Glow radius scales with cluster size (sqrt) and contracts with integration
    const clusterSizeScale = Math.sqrt(cluster.length / CLUSTER_THRESHOLD);
    const glowRadius = Math.max(1, CONNECTION_DISTANCE * (1 - avgGlow * GLOW_RADIUS_CONTRACTION) * clusterSizeScale);

    implodeCluster(cluster, glowRadius);

    const coreMass = computeCoreMass(cluster, centroid, glowRadius);
    const flicker = computeFlicker(minPressure, avgGlow);

    // Opacity dims for larger clusters to avoid visual overload
    const sizeScale = CLUSTER_THRESHOLD / Math.max(cluster.length, CLUSTER_THRESHOLD);
    const clusterOpacity = (avgGlow * BASE_GLOW_OPACITY + flicker) * sizeScale;

    updateInGlowState(cluster, centroid, glowRadius);
    const pca = computeGlowPCA(cluster, centroid);
    renderClusterGlow(centroid, glowRadius, clusterOpacity, pca);
    renderOutlierGlows(cluster, centroid, glowRadius, clusterOpacity);

    return { cluster, centroid, coreMass };
}

/**
 * Process a sub-critical cluster: decay pressure/glow, clear state flags,
 * and render any remaining fading glow with PCA-based shape.
 */
function processSubCriticalCluster(cluster) {
    for (const idx of cluster) {
        particles[idx].pressure = Math.max(0, particles[idx].pressure - PRESSURE_DECAY);
        particles[idx].glow = Math.max(0, particles[idx].glow - GLOW_RAMP_DOWN);
        particles[idx].imploding = false;
        particles[idx].terminal = false;
        particles[idx].criticalProgress = Math.max(0, particles[idx].criticalProgress - CRITICAL_PROGRESS_DECAY_RATE);
    }

    const avgGlow = cluster.reduce((sum, idx) => sum + particles[idx].glow, 0) / cluster.length;
    if (avgGlow > GLOW_WEIGHT_EPSILON) {
        const centroid = clusterCentroid(cluster);
        const sizeScale = Math.sqrt(cluster.length / CLUSTER_THRESHOLD);
        const radius = Math.max(1, CONNECTION_DISTANCE * (1 - avgGlow * GLOW_RADIUS_CONTRACTION) * sizeScale);
        const pca = computeGlowPCA(cluster, centroid);
        renderClusterGlow(centroid, radius, avgGlow * BASE_GLOW_OPACITY, pca);
    }
}

/**
 * Process all clusters: categorize as critical or sub-critical using
 * hysteresis, apply physics and rendering, collect terminal clusters.
 *
 * Hysteresis prevents oscillation: a cluster that was previously critical
 * stays critical down to CRITICAL_HYSTERESIS * CLUSTER_THRESHOLD, while
 * a new cluster needs the full CLUSTER_THRESHOLD to become critical.
 *
 * @returns {object[]} Terminal cluster records for gravity computation.
 */
function processClusters(clusters) {
    const terminalClusters = [];

    for (const cluster of clusters) {
        let wasCritical = false;
        for (const idx of cluster) {
            if (particles[idx].imploding) { wasCritical = true; break; }
        }

        const activeThreshold = wasCritical
            ? Math.ceil(CLUSTER_THRESHOLD * CRITICAL_HYSTERESIS)
            : CLUSTER_THRESHOLD;

        if (cluster.length > activeThreshold) {
            lastInteractionFrame = frameCount;
            const record = processCriticalCluster(cluster);
            if (record) terminalClusters.push(record);
        } else {
            processSubCriticalCluster(cluster);
        }
    }

    return terminalClusters;
}


// ============================================================
// Stagnation Detection
// ============================================================

/**
 * When no critical clusters have existed for STAGNATION_TIMEOUT frames,
 * dissolve the smallest qualifying cluster (≥ STAGNATION_MIN_SIZE particles).
 *
 * Dissolution: particles fade out over FADE_DURATION frames, teleport to
 * random positions, then fade back in. This breaks deadlocks where particles
 * are evenly distributed with no cluster large enough to become critical.
 */
function handleStagnation(clusters) {
    const stagnant = frameCount - lastInteractionFrame > STAGNATION_TIMEOUT;
    if (!stagnant) return;

    let targetCluster = null;
    let targetSize = Infinity;

    for (const cluster of clusters) {
        if (cluster.length >= STAGNATION_MIN_SIZE && cluster.length < targetSize) {
            let anyFading = false;
            for (const idx of cluster) {
                if (particles[idx].fadeFrame >= 0) { anyFading = true; break; }
            }
            if (!anyFading) {
                targetSize = cluster.length;
                targetCluster = cluster;
            }
        }
    }

    if (targetCluster) {
        lastInteractionFrame = frameCount;
        for (const idx of targetCluster) {
            particles[idx].fadeFrame = frameCount;
            particles[idx].imploding = false;
            particles[idx].terminal = false;
            particles[idx].pressure = 0;
            particles[idx].glow = 0;
            particles[idx].criticalProgress = 0;
        }
    }
}


// ============================================================
// Particle Updates
// ============================================================

/**
 * Update particles in the fade-out/scatter/fade-in dissolution lifecycle.
 *
 * Three phases, each FADE_DURATION frames:
 *   1. Fade out: opacity 1→0, particle still at original position
 *   2. Teleport: random position and velocity, cooldown applied
 *   3. Fade in: opacity 0→1 at new position
 */
function updateFadingParticles() {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particles[i];
        if (p.fadeFrame < 0) continue;

        const elapsed = frameCount - p.fadeFrame;

        if (elapsed < FADE_DURATION) {
            p.opacity = 1 - elapsed / FADE_DURATION;
        } else if (elapsed === FADE_DURATION) {
            p.x = Math.random() * w;
            p.y = Math.random() * h;
            p.vx = (Math.random() - 0.5) * PARTICLE_SPEED;
            p.vy = (Math.random() - 0.5) * PARTICLE_SPEED;
            p.opacity = 0;
            p.cooldown = FADE_DURATION;
        } else if (elapsed < FADE_DURATION * 2) {
            p.opacity = (elapsed - FADE_DURATION) / FADE_DURATION;
        } else {
            p.opacity = 1;
            p.fadeFrame = -1;
        }
    }
}

/**
 * Apply velocity damping based on particle state.
 *
 * Exploding: constant drag slows explosion debris.
 *
 * Imploding: blends between cluster-relative damping and free damping,
 * weighted by glow. Cluster damping increases with critical progress
 * to slow internal oscillation as the cluster matures, and increases
 * with distance from centroid so edge particles damp faster.
 *
 * Free: standard damping with speed clamp that decays with criticalProgress
 * so recently escaped particles don't instantly snap to MAX_SPEED.
 */
function applyDamping(p) {
    if (p.exploding) {
        p.vx *= EXPLOSION_DRAG;
        p.vy *= EXPLOSION_DRAG;
        return;
    }

    if (p.imploding) {
        const integration = p.glow;
        const relVx = p.vx - p.implodeVx;
        const relVy = p.vy - p.implodeVy;

        const cdx = p.x - p.implodeCx;
        const cdy = p.y - p.implodeCy;
        const distRatio = Math.min(Math.sqrt(cdx * cdx + cdy * cdy) / CONNECTION_DISTANCE, 1);

        const progressDamp = p.criticalProgress * CLUSTER_DAMP_PROGRESS_SCALE;
        const relDamp = CLUSTER_DAMP_BASE - progressDamp - distRatio * CLUSTER_DAMP_EDGE_SCALE;

        const clusterVx = p.implodeVx + relVx * relDamp;
        const clusterVy = p.implodeVy + relVy * relDamp;
        const freeVx = p.vx * DAMPING;
        const freeVy = p.vy * DAMPING;

        p.vx = freeVx + (clusterVx - freeVx) * integration;
        p.vy = freeVy + (clusterVy - freeVy) * integration;
        return;
    }

    // Free particle
    p.vx *= DAMPING;
    p.vy *= DAMPING;

    const cp = p.criticalProgress;
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    const absMaxSpeed = MAX_SPEED * FREE_SPEED_CLAMP_MULT;
    const effectiveMax = MAX_SPEED + (absMaxSpeed - MAX_SPEED) * cp;
    if (speed > effectiveMax && speed > 0) {
        p.vx = (p.vx / speed) * effectiveMax;
        p.vy = (p.vy / speed) * effectiveMax;
    }
}

/**
 * Constrain terminal particles within the shrinking containment radius.
 *
 * The radius starts at TERMINAL_RADIUS_MULT * CONNECTION_DISTANCE and
 * shrinks to TERMINAL_MIN_RADIUS * CONNECTION_DISTANCE during collapse.
 * When a particle exceeds the boundary, it's clamped to the edge and
 * its outward radial velocity is clamped to zero (tangential component preserved).
 */
function constrainTerminalParticle(p) {
    if (!p.terminal) return;

    const collapseProgress = Math.max(0, (p.criticalProgress - COLLAPSE_THRESHOLD) / (1 - COLLAPSE_THRESHOLD));
    const terminalRadius = CONNECTION_DISTANCE
        * (TERMINAL_RADIUS_MULT - (TERMINAL_RADIUS_MULT - TERMINAL_MIN_RADIUS) * collapseProgress * collapseProgress);

    const dx = p.x - p.implodeCx;
    const dy = p.y - p.implodeCy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > terminalRadius) {
        p.x = p.implodeCx + (dx / dist) * terminalRadius;
        p.y = p.implodeCy + (dy / dist) * terminalRadius;

        const relVx = p.vx - p.implodeVx;
        const relVy = p.vy - p.implodeVy;
        const dot = relVx * dx + relVy * dy;
        if (dot > 0) {
            p.vx -= (dot / (dist * dist)) * dx;
            p.vy -= (dot / (dist * dist)) * dy;
        }
    }
}

/**
 * Apply pairwise particle interactions and render connection edges.
 *
 * For each particle pair within CONNECTION_DISTANCE:
 *   - Close range (< REPEL_DISTANCE): inverse-square repulsion, suppressed
 *     inside clusters via criticalProgress
 *   - Mid range: linear attraction, reduced for glowing particles to avoid
 *     competing with implode force. Cross-cluster attraction is suppressed.
 *   - Render connection line with optional soft halo (suppressed inside
 *     cluster glow envelopes via inGlow)
 *
 * Physics and rendering are interleaved in a single O(n²) pass for
 * performance. After the pair loop, each particle gets damping, position
 * integration, terminal containment, viewport wrapping, and rendering.
 */
function applyPairwiseForces() {
    const connDistSq = CONNECTION_DISTANCE * CONNECTION_DISTANCE;

    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        for (let j = i + 1; j < particles.length; j++) {
            const q = particles[j];
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > connDistSq) continue;

            const dist = Math.sqrt(distSq);

            if (dist < REPEL_DISTANCE && dist > 0) {
                const repelScale = (1 - p.criticalProgress) * (1 - q.criticalProgress);
                if (repelScale > 0.001) {
                    const clampedDistSq = Math.max(distSq, MIN_REPEL_DIST_SQ);
                    const force = (REPEL_STRENGTH / clampedDistSq) * repelScale;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;
                    p.vx -= fx;
                    p.vy -= fy;
                    q.vx += fx;
                    q.vy += fy;
                }
            } else if (dist < CONNECTION_DISTANCE) {
                if (!p.exploding && !q.exploding) {
                    const attractScale = (1 - p.glow) * (1 - q.glow);
                    const crossCluster = p.imploding !== q.imploding;
                    const effectiveScale = crossCluster ? attractScale : 1;
                    if (effectiveScale > 0.001) {
                        const force = ATTRACT_STRENGTH * dist * effectiveScale;
                        const fx = (dx / dist) * force;
                        const fy = (dy / dist) * force;
                        p.vx += fx;
                        p.vy += fy;
                        q.vx -= fx;
                        q.vy -= fy;
                    }
                }

                // Connection edge with halo
                const edgeOpacity = Math.min(p.opacity, q.opacity);
                const alpha = (1 - dist / CONNECTION_DISTANCE) * EDGE_ALPHA_SCALE * edgeOpacity;
                if (alpha > EDGE_ALPHA_MIN) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(q.x, q.y);

                    // Halo suppressed inside cluster glow envelope
                    const glowSuppress = Math.min(p.inGlow, q.inGlow);
                    const haloAlpha = alpha * EDGE_HALO_ALPHA_SCALE * (1 - glowSuppress);
                    if (haloAlpha > EDGE_ALPHA_MIN) {
                        ctx.lineWidth = EDGE_HALO_WIDTH;
                        ctx.strokeStyle = `rgba(${GLOW_COLOR}, ${haloAlpha})`;
                        ctx.stroke();
                    }

                    ctx.lineWidth = 1;
                    ctx.strokeStyle = `rgba(${GLOW_COLOR}, ${alpha})`;
                    ctx.stroke();
                }
            }
        }

        // -- Per-particle update (after pair interactions) --

        applyDamping(p);

        // Transition out of exploding state when speed drops to normal
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (p.exploding && speed <= MAX_SPEED) {
            p.exploding = false;
        }

        if (p.cooldown > 0) p.cooldown--;

        // Position integration
        p.x += p.vx;
        p.y += p.vy;

        constrainTerminalParticle(p);

        // Viewport wrapping
        if (p.x < 0) p.x += w;
        if (p.x > w) p.x -= w;
        if (p.y < 0) p.y += h;
        if (p.y > h) p.y -= h;

        // Render particle dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, PARTICLE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = p.opacity >= 1 ? PARTICLE_FILL_FULL : `rgba(${GLOW_COLOR}, ${PARTICLE_OPACITY * p.opacity})`;
        ctx.fill();
    }
}


// ============================================================
// Main Animation Loop
// ============================================================

/**
 * Main frame callback. Each frame:
 *   1. Decay inGlow and snapshot imploding state
 *   2. Detect clusters via flood-fill
 *   3. Process clusters (pressure, glow, implosion/explosion, rendering)
 *   4. Apply inter-cluster gravity
 *   5. Render explosion afterglows
 *   6. Handle stagnation (dissolve stuck clusters)
 *   7. Update fading particles
 *   8. Apply pairwise forces, damping, and render particles/edges
 */
function animate() {
    ctx.clearRect(0, 0, w, h);
    frameCount++;

    // Snapshot imploding state before cluster processing clears it,
    // used to assign escape cooldown to particles that leave clusters
    _wasImploding.fill(0);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles[i].inGlow = Math.max(0, particles[i].inGlow - IN_GLOW_RAMP);
        if (particles[i].imploding) _wasImploding[i] = 1;
    }

    const clusters = findClusters();
    const terminalClusters = processClusters(clusters);

    // Assign escape cooldown to particles that just left a cluster
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        if (_wasImploding[i] && !particles[i].imploding && !particles[i].exploding && particles[i].cooldown <= 0) {
            particles[i].cooldown = ESCAPE_COOLDOWN;
        }
    }

    applyClusterGravity(terminalClusters);
    renderExplosionGlows();
    handleStagnation(clusters);
    updateFadingParticles();
    applyPairwiseForces();

    requestAnimationFrame(animate);
}


// ============================================================
// Bootstrap
// ============================================================

window.addEventListener("resize", () => {
    resize();
    createParticles();
});

resize();
createParticles();
animate();
